/**
 * forward 재정렬 엔진 (#365, 에픽 #362).
 *
 * 하이브리드 B(decision-log 2026-06-16): 하루치 변경은 국소 처리(A2), **누적 이탈이 임계치를
 * 넘을 때만** 목표일을 고정한 채 "오늘부터" 스케줄을 재구축한다. (연구 근거: Runna 재정렬 —
 * 워크아웃 누락 누적이 임계 초과 시 forward 재계산. running-coaching-standards "훈련 스케줄 모델")
 *
 * 순수 로직 — 영속/superseded 전환은 trainingScheduleStore.realign 이 담당한다.
 */

import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import type { ScheduledSession, ScheduledSessionDraft } from '@/entities/training-schedule/model'
import { buildPeriodizedSchedule } from '@/shared/lib/coaching/periodizedSchedule'

/** 재정렬 트리거 임계치(조정 가능). 단일 벤더(Runna) 사례 기반 기본값. */
export const REALIGN_MISSED_THRESHOLD = 3
export const REALIGN_MISSED_KEY_THRESHOLD = 2
/**
 * 앵커 드리프트 임계(2026-06-19). 실제 최근 체력(currentWeeklyKm=최근 30일 평균)이 **플랜이 처방한
 * 주간 볼륨과 ±25% 이상** 벌어지면 재앵커한다. 세션 누락이 없어도(잘 소화 중에도) 체력 성장/저하를
 * 플랜에 반영하기 위함 — 기존 누락-only 트리거는 "꾸준히 잘 뛰는데 플랜 앵커가 낮게 굳은" 경우를
 * 영원히 못 고쳤다(주 32km 뛰는데 18km/주 처방 고착). 25%는 ACWR 유지밴드(0.8~1.3 ≈ ±20~30%,
 * Gabbett)의 바깥 = "의미 있는 이탈". 실제 볼륨에 '맞추는' 것이라 부하 증가가 아니며, 재앵커 후엔
 * 플랜 볼륨≈실제라 ratio≈1로 수렴해 재트리거되지 않는다(자가안정). SSOT §시작점 앵커링/§점진부하.
 */
export const REALIGN_ANCHOR_DRIFT_PCT = 0.25

export type ScheduleDeviation = {
  /** 지났는데 미수행(planned/missed, runId 없음)인 세션 수. */
  missedCount: number
  /** 그중 키세션(롱런/quality) 수. */
  missedKeyCount: number
  /** 실제 체력이 플랜 처방 볼륨과 임계 이상 벌어졌는가(성장/저하). */
  anchorDrift: boolean
  /** 드리프트 방향: 'up'=체력 성장, 'down'=저하/감량. 없으면 null. */
  anchorDriftDir: 'up' | 'down' | null
  shouldRealign: boolean
  /** 사용자 고지용 한 줄 사유(재정렬 불요면 ''). */
  reason: string
}

/** detectScheduleDeviation 의 선택 맥락 — 앵커 드리프트 판정용. 미제공이면 누락만 본다(하위호환). */
export type DeviationContext = {
  /** 실제 최근 주간 주행량(최근 30일 평균, km). */
  currentWeeklyKm?: number | null
  /** 플랜이 처방한 이번 주(오늘부터 7일) 볼륨(km). */
  plannedWeeklyKm?: number | null
  /** 이번 주 단계 — Taper/Recovery 면 상향 드리프트는 무시(의도된 저볼륨이므로). */
  upcomingPhase?: string | null
}

function toDateOnly(d: Date): string {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const y = copy.getFullYear()
  const m = String(copy.getMonth() + 1).padStart(2, '0')
  const day = String(copy.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 플랜이 처방한 "이번 주"(오늘부터 7일) 볼륨과 대표 단계를 요약한다. 앵커 드리프트 판정용.
 * superseded 제외(planned+완료 포함). 대표 단계는 가장 이른 세션의 phase.
 */
function summarizeUpcomingWeek(
  sessions: ScheduledSession[],
  today: Date
): { plannedWeeklyKm: number | null; upcomingPhase: string | null } {
  const startStr = toDateOnly(today)
  const end = new Date(today)
  end.setDate(end.getDate() + 7)
  const endStr = toDateOnly(end)
  const week = sessions
    .filter((s) => s.date >= startStr && s.date < endStr && s.status !== 'superseded')
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!week.length) return { plannedWeeklyKm: null, upcomingPhase: null }
  const plannedWeeklyKm = week.reduce((sum, s) => sum + (s.prescription?.distanceKm ?? 0), 0)
  return {
    plannedWeeklyKm: plannedWeeklyKm > 0 ? plannedWeeklyKm : null,
    upcomingPhase: week[0]?.phase ?? null
  }
}

/**
 * 지난 날짜의 미수행 세션(=실질적 누락)을 집계해 재정렬 필요 여부를 판단한다.
 * `planned` 상태만 센다 — 재정렬 후 과거 누락을 `missed` 로 전환하면(markPastPlannedMissed)
 * 같은 누락이 매번 다시 트리거되지 않는다(B2 무한 재정렬 방지).
 */
export function detectScheduleDeviation(
  sessions: ScheduledSession[],
  today: Date,
  ctx: DeviationContext = {}
): ScheduleDeviation {
  const todayStr = toDateOnly(today)
  const missed = sessions.filter((s) => s.date < todayStr && !s.runId && s.status === 'planned')
  const missedCount = missed.length
  const missedKeyCount = missed.filter((s) => s.keySession).length
  const missedTrigger =
    missedCount >= REALIGN_MISSED_THRESHOLD || missedKeyCount >= REALIGN_MISSED_KEY_THRESHOLD

  // 앵커 드리프트: 실제 최근 체력 vs 플랜 처방 볼륨. 누락이 없어도 체력 변화를 반영한다.
  let anchorDrift = false
  let anchorDriftDir: 'up' | 'down' | null = null
  const { currentWeeklyKm, plannedWeeklyKm, upcomingPhase } = ctx
  if (
    currentWeeklyKm != null &&
    currentWeeklyKm > 0 &&
    plannedWeeklyKm != null &&
    plannedWeeklyKm > 0
  ) {
    const ratio = currentWeeklyKm / plannedWeeklyKm
    // Taper/Recovery 의 의도된 저볼륨을 "체력 성장"으로 오인해 상향 재앵커하지 않는다.
    const lowPhase = upcomingPhase === 'Taper' || upcomingPhase === 'Recovery'
    if (ratio > 1 + REALIGN_ANCHOR_DRIFT_PCT && !lowPhase) {
      anchorDrift = true
      anchorDriftDir = 'up'
    } else if (ratio < 1 - REALIGN_ANCHOR_DRIFT_PCT) {
      anchorDrift = true
      anchorDriftDir = 'down'
    }
  }

  const shouldRealign = missedTrigger || anchorDrift

  // 사유: 누락이 우선(더 급한 신호), 없으면 앵커 드리프트 사유.
  let reason = ''
  if (missedTrigger) {
    reason =
      missedKeyCount >= REALIGN_MISSED_KEY_THRESHOLD
        ? `핵심 세션 ${missedKeyCount}개를 놓쳐, 목표일은 그대로 두고 오늘부터 일정을 다시 짰어요.`
        : `최근 세션 ${missedCount}개를 놓쳐, 목표일은 그대로 두고 오늘부터 일정을 다시 짰어요.`
  } else if (anchorDrift) {
    reason =
      anchorDriftDir === 'up'
        ? '최근 주행량이 늘어, 지금 체력에 맞춰 오늘부터 일정을 다시 짰어요.'
        : '최근 주행량이 줄어, 지금 컨디션에 맞춰 오늘부터 일정을 다시 짰어요.'
  }

  return { missedCount, missedKeyCount, anchorDrift, anchorDriftDir, shouldRealign, reason }
}

export type RealignPlan = {
  /** 이 날짜(포함) 이후 활성 세션을 superseded 처리하고 drafts 로 교체. */
  fromDate: string
  drafts: ScheduledSessionDraft[]
  deviation: ScheduleDeviation
}

/**
 * 목표일을 고정한 채 "오늘부터" 스케줄을 재구축한다. allocatePhases 가 남은 주수에 맞춰
 * Phase 를 다시 압축하므로(주수↓→base↓), 잃은 기간이 자연히 반영된 forward 재계산이 된다.
 * shouldRealign 이 아니면 drafts 는 비고 fromDate 는 오늘(no-op 신호).
 */
export function buildRealignedSchedule(
  sessions: ScheduledSession[],
  goal: TrainingGoal,
  profile: AthleteProfile,
  today: Date,
  /** 현재 주간 주행량(최근 30일 평균) — 재정렬 시에도 현재 체력에 재앵커링한다(#395). */
  currentWeeklyKm: number | null = null,
  /** 관측 Easy 페이스(#405) — 재정렬 시에도 관측 보정 페이스로 처방. */
  observedEasyPace: { easyPaceSec: number; easyPaceRangeSec: [number, number] } | null = null
): RealignPlan {
  const { plannedWeeklyKm, upcomingPhase } = summarizeUpcomingWeek(sessions, today)
  const deviation = detectScheduleDeviation(sessions, today, {
    currentWeeklyKm,
    plannedWeeklyKm,
    upcomingPhase
  })
  const fromDate = toDateOnly(today)
  if (!deviation.shouldRealign) {
    return { fromDate, drafts: [], deviation }
  }
  const drafts = buildPeriodizedSchedule({ goal, profile, today, currentWeeklyKm, observedEasyPace }).map((d) => ({
    ...d,
    source: 'realign' as const
  }))
  return { fromDate, drafts, deviation }
}

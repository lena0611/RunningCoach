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

export type ScheduleDeviation = {
  /** 지났는데 미수행(planned/missed, runId 없음)인 세션 수. */
  missedCount: number
  /** 그중 키세션(롱런/quality) 수. */
  missedKeyCount: number
  shouldRealign: boolean
  /** 사용자 고지용 한 줄 사유(재정렬 불요면 ''). */
  reason: string
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
 * 지난 날짜의 미수행 세션(=실질적 누락)을 집계해 재정렬 필요 여부를 판단한다.
 * `planned` 상태만 센다 — 재정렬 후 과거 누락을 `missed` 로 전환하면(markPastPlannedMissed)
 * 같은 누락이 매번 다시 트리거되지 않는다(B2 무한 재정렬 방지).
 */
export function detectScheduleDeviation(sessions: ScheduledSession[], today: Date): ScheduleDeviation {
  const todayStr = toDateOnly(today)
  const missed = sessions.filter((s) => s.date < todayStr && !s.runId && s.status === 'planned')
  const missedCount = missed.length
  const missedKeyCount = missed.filter((s) => s.keySession).length

  const shouldRealign =
    missedCount >= REALIGN_MISSED_THRESHOLD || missedKeyCount >= REALIGN_MISSED_KEY_THRESHOLD

  let reason = ''
  if (shouldRealign) {
    reason =
      missedKeyCount >= REALIGN_MISSED_KEY_THRESHOLD
        ? `핵심 세션 ${missedKeyCount}개를 놓쳐, 목표일은 그대로 두고 오늘부터 일정을 다시 짰어요.`
        : `최근 세션 ${missedCount}개를 놓쳐, 목표일은 그대로 두고 오늘부터 일정을 다시 짰어요.`
  }

  return { missedCount, missedKeyCount, shouldRealign, reason }
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
  currentWeeklyKm: number | null = null
): RealignPlan {
  const deviation = detectScheduleDeviation(sessions, today)
  const fromDate = toDateOnly(today)
  if (!deviation.shouldRealign) {
    return { fromDate, drafts: [], deviation }
  }
  const drafts = buildPeriodizedSchedule({ goal, profile, today, currentWeeklyKm }).map((d) => ({
    ...d,
    source: 'realign' as const
  }))
  return { fromDate, drafts, deviation }
}

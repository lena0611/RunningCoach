/**
 * "작전 바꾸기" 목표기반 대체안 (#366, 에픽 #362).
 *
 * 기존 easierAlternative(기계적 한 단계 하향)를 대체한다. 하이브리드 B 에서 단일 세션 변경은
 * **국소 처리**(그날만, A1 재정렬과 별개)이되, (a) 양방향(더 쉽게/더 어렵게), (b) 목표를 염두에 둔
 * 경고를 동반한다. 키세션을 쉽게 바꾸면 목표 적응 동력이 빠지므로 그 영향을 알린다.
 *
 * 순수 로직 — 영속(superseded 전환 + 새 세션 insert)은 store/호출부가 한다.
 */

import type { RunType } from '@/entities/run/model'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import type { ScheduledSession, ScheduledSessionDraft } from '@/entities/training-schedule/model'
import { prescriptionFor } from '@/shared/lib/coaching/periodizedSchedule'
import { resolvePaceModel } from '@/shared/lib/vdotPaces'

export type AlternativeDirection = 'easier' | 'harder'

/** 강도 사다리(낮음→높음). 롱런(LSD/Steady Long)은 볼륨 축이라 별도 처리. */
const INTENSITY_LADDER: RunType[] = ['Recovery', 'Easy', 'Easy + Strides', 'Tempo']

/** 세션 타입을 방향에 따라 한 단계 조정. 안전 상한은 Tempo(Race/Interval로 점프 금지). */
export function adjustSessionType(type: RunType, direction: AlternativeDirection): RunType {
  // 롱런: 쉽게=Easy 로 축소, 어렵게=Steady Long(후반 가속).
  if (type === 'LSD' || type === 'Steady Long') {
    if (direction === 'easier') return 'Easy'
    return 'Steady Long'
  }
  if (type === 'Race') {
    return direction === 'easier' ? 'Tempo' : 'Race'
  }
  const idx = INTENSITY_LADDER.indexOf(type)
  if (idx < 0) return direction === 'easier' ? 'Recovery' : 'Easy'
  const next = direction === 'easier' ? idx - 1 : idx + 1
  return INTENSITY_LADDER[clamp(next, 0, INTENSITY_LADDER.length - 1)]
}

export type AlternativeProposal = {
  draft: ScheduledSessionDraft
  /** 키세션을 쉽게 바꿀 때 목표 영향 경고(없으면 ''). */
  warning: string
  /** 방향상 더 갈 곳이 없으면(이미 사다리 끝) true. */
  atBoundary: boolean
}

/**
 * 그날 세션의 대체안을 제안한다. 볼륨(거리)은 보존하되 강도/타입을 조정하고,
 * 목표·키세션 보호 경고를 붙인다. 국소 처리(source=manual).
 */
export function proposeAlternativeSession(
  current: ScheduledSession,
  goal: TrainingGoal | null,
  profile: AthleteProfile,
  direction: AlternativeDirection
): AlternativeProposal {
  const newType = adjustSessionType(current.sessionType, direction)
  const atBoundary = newType === current.sessionType
  const pace = resolvePaceModel(profile)

  // 볼륨은 대체로 보존하되, 쉽게면 약간 줄이고 어렵게면 유지.
  const baseKm = current.prescription.distanceKm ?? 0
  const distanceKm = direction === 'easier' ? round1(baseKm * 0.85) : baseKm

  const draft: ScheduledSessionDraft = {
    goalId: current.goalId,
    date: current.date,
    phase: current.phase,
    sessionType: newType,
    keySession: newType === 'Tempo' || newType === 'Steady Long' || newType === 'LSD' || newType === 'Race',
    prescription: prescriptionFor(newType, distanceKm, pace),
    source: 'manual'
  }

  let warning = ''
  if (current.keySession && direction === 'easier') {
    const goalLabel = goal?.title ? `'${goal.title}' ` : ''
    warning = `오늘은 ${goalLabel}목표를 끌어올리는 핵심 세션이에요. 쉽게 바꾸면 이번 주기 적응이 줄 수 있어요. 컨디션·통증 때문이면 괜찮습니다 — 무리하지 마세요.`
  }

  return { draft, warning, atBoundary }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

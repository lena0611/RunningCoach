import type { RunLog } from '@/entities/run/model'
import {
  dayIndex,
  isHardSession,
  sortByDateAsc,
  type AdaptationConfidence,
  type AdaptationStatus
} from '@/shared/lib/coaching/adaptationShared'

/**
 * Recovery 주기 적응 (#335).
 *
 * 원칙: 고강도 세션(Tempo/Race) 다음날·다다음날 회복 신호(RPE/컨디션/통증)를 추적해 사용자별
 *   "고강도 사이 최소 권장 휴식일수"를 학습한다.
 *   - base 2일. 부상 활성 시 +1(최소 3). 회복이 나쁘면 상향, 좋으면 base 유지. 범위 [2, 4].
 *   - 회복 양호: 다음 1~2일 내 통증 없음 + RPE<7 + 컨디션>2. 나쁨: 통증/RPE≥7/컨디션≤2.
 */

export const RECOVERY_CYCLE_BASE_DAYS = 2
export const RECOVERY_CYCLE_MIN_DAYS = 2
export const RECOVERY_CYCLE_MAX_DAYS = 4
const RECENT_HARD_LIMIT = 6
const NEXT_DAY_WINDOW = 2
const CANDIDATE_COUNT = 2

export type RecoveryCycleAdaptation = {
  baseRestDays: number
  adoptedRestDays: number | null
  effectiveRestDays: number
  status: AdaptationStatus
  confidence: AdaptationConfidence
  /** 회복 신호를 관찰할 수 있었던 고강도 세션 수. */
  qualifyingCount: number
  sampleCount: number
  /** 다음날 회복이 나빴던 고강도 세션 수. */
  poorRecoveryCount: number
  rationale: string
}

type RecoverySignal = 'good' | 'poor' | 'unknown'

/** 고강도 세션 직후 NEXT_DAY_WINDOW일 내 런의 회복 신호. 후속 기록 없거나 창 밖이면 unknown. */
export function recoverySignalAfter(run: RunLog, sortedAsc: RunLog[]): RecoverySignal {
  const here = dayIndex(run.date)
  const following = sortedAsc.filter((item) => {
    if (item.date <= run.date) return false
    const there = dayIndex(item.date)
    return here !== null && there !== null && there - here <= NEXT_DAY_WINDOW
  })
  if (!following.length) return 'unknown'
  for (const next of following) {
    if (next.painNote.trim()) return 'poor'
    if ((next.rpe ?? 0) >= 7) return 'poor'
    if ((next.conditionScore ?? 5) <= 2) return 'poor'
  }
  return 'good'
}

export function computeRecoveryCycleAdaptation(
  runs: RunLog[],
  opts: { injuryActive?: boolean; adoptedRestDays?: number | null } = {}
): RecoveryCycleAdaptation {
  const adopted = typeof opts.adoptedRestDays === 'number' ? opts.adoptedRestDays : null
  const base = RECOVERY_CYCLE_BASE_DAYS
  const clampDays = (value: number) => Math.min(Math.max(value, RECOVERY_CYCLE_MIN_DAYS), RECOVERY_CYCLE_MAX_DAYS)
  // 부상 활성 시 최소 휴식 +1.
  const injuryFloor = opts.injuryActive ? base + 1 : base
  const currentFloor = clampDays(Math.max(adopted ?? base, injuryFloor))

  const sortedAsc = sortByDateAsc(runs)
  const recentHard = sortedAsc.filter(isHardSession).slice(-RECENT_HARD_LIMIT)
  const sampleCount = recentHard.length

  const settle = (over: Partial<RecoveryCycleAdaptation>, rationale: string): RecoveryCycleAdaptation => ({
    baseRestDays: base,
    adoptedRestDays: adopted,
    effectiveRestDays: currentFloor,
    status: adopted !== null || opts.injuryActive ? 'adopted' : 'estimated',
    confidence: adopted !== null ? 'high' : 'low',
    qualifyingCount: 0,
    sampleCount,
    poorRecoveryCount: 0,
    rationale,
    ...over
  })

  if (opts.injuryActive) {
    return settle({ effectiveRestDays: currentFloor }, `부상 활성 — 고강도 사이 휴식을 ${currentFloor}일로 강화(회복 우선).`)
  }
  if (!sampleCount) return settle({}, '최근 고강도(Tempo/Race) 기록 없음 — 기본 회복 주기 유지.')

  const signals = recentHard.map((run) => recoverySignalAfter(run, sortedAsc))
  const observed = signals.filter((signal) => signal !== 'unknown')
  const qualifyingCount = observed.length
  const poorRecoveryCount = observed.filter((signal) => signal === 'poor').length

  if (qualifyingCount < CANDIDATE_COUNT) {
    return settle(
      { qualifyingCount, poorRecoveryCount },
      `회복 신호 관찰 ${qualifyingCount}건 — 회복 주기 ${currentFloor}일 유지(갱신엔 근거 부족).`
    )
  }

  const poorRatio = poorRecoveryCount / qualifyingCount
  // 회복 불량이 절반 이상이면 +1, 1건이라도 있으면 watch, 전부 양호면 base 유지(채택).
  if (poorRatio >= 0.5) {
    const target = clampDays(base + 1)
    return {
      baseRestDays: base,
      adoptedRestDays: target,
      effectiveRestDays: target,
      status: 'adopted',
      confidence: 'high',
      qualifyingCount,
      sampleCount,
      poorRecoveryCount,
      rationale: `최근 고강도 ${qualifyingCount}회 중 ${poorRecoveryCount}회 회복 불량 — 권장 휴식을 ${target}일로 상향.`
    }
  }
  if (poorRecoveryCount >= 1) {
    return {
      baseRestDays: base,
      adoptedRestDays: adopted,
      effectiveRestDays: currentFloor,
      status: 'watch',
      confidence: 'medium',
      qualifyingCount,
      sampleCount,
      poorRecoveryCount,
      rationale: `최근 고강도 ${qualifyingCount}회 중 ${poorRecoveryCount}회 회복 신호 주의 — 회복 주기 관찰 중.`
    }
  }
  return {
    baseRestDays: base,
    adoptedRestDays: base,
    effectiveRestDays: base,
    status: 'adopted',
    confidence: 'high',
    qualifyingCount,
    sampleCount,
    poorRecoveryCount,
    rationale: `최근 고강도 ${qualifyingCount}회 모두 회복 양호 — 회복 주기 ${base}일 적정.`
  }
}

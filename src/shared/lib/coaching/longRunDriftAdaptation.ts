import type { RunLog } from '@/entities/run/model'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import {
  isLongRun,
  nextRunRecoveryOk,
  sortByDateAsc,
  type AdaptationConfidence,
  type AdaptationStatus
} from '@/shared/lib/coaching/adaptationShared'

/**
 * Long Run drift tolerance 적응 (#334).
 *
 * 원칙: Long Run 후반 페이스 드리프트(전반 대비 %)를 추적해 사용자별 "지속성 OK" 허용 범위를 학습한다.
 *   - base 허용 5%(페이스). 안전망: base + 2%p(최대 7%). base 미만으로 과도하게 조이지 않는다.
 *   - 회복 양호한 Long Run들의 실측 드리프트로 개인 허용치를 잡는다(증거 누적 시 채택).
 *   - 드리프트가 낮을수록 지속성이 좋은 것. tolerance는 "이 % 이내면 지속성 ready"로 ProgressionCriteria(#336)가 사용.
 */

export const LONG_RUN_DRIFT_BASE_PERCENT = 5
export const LONG_RUN_DRIFT_MAX_PERCENT = 7
const RECENT_LONG_LIMIT = 6
const CANDIDATE_COUNT = 2
const CONFIRM_COUNT = 3

export type LongRunDriftAdaptation = {
  baseTolerancePercent: number
  adoptedTolerancePercent: number | null
  effectiveTolerancePercent: number
  status: AdaptationStatus
  confidence: AdaptationConfidence
  qualifyingCount: number
  sampleCount: number
  /** 회복 양호 Long Run의 실측 드리프트(% 반올림) 표본. */
  observedDriftPercents: number[]
  rationale: string
}

/** 한 런의 후반 페이스 드리프트(%)를 lapDrift 기반으로 산출. 전반 페이스·delta 없으면 null. */
export function lateRunDriftPercent(run: RunLog): number | null {
  const drift = evaluateLapDrift(run)
  if (drift.paceDeltaSec === null) return null
  const laps = run.laps.filter((lap) => lap.paceSec)
  if (laps.length < 2) return null
  const firstPace = laps[0].paceSec
  if (!firstPace || firstPace <= 0) return null
  return Math.round((drift.paceDeltaSec / firstPace) * 1000) / 10
}

export function computeLongRunDriftAdaptation(
  runs: RunLog[],
  opts: { injuryActive?: boolean; adoptedTolerancePercent?: number | null } = {}
): LongRunDriftAdaptation {
  const adopted = typeof opts.adoptedTolerancePercent === 'number' ? opts.adoptedTolerancePercent : null
  const base = LONG_RUN_DRIFT_BASE_PERCENT
  const clampTolerance = (value: number) => Math.min(Math.max(value, base), LONG_RUN_DRIFT_MAX_PERCENT)
  const currentFloor = adopted !== null ? clampTolerance(adopted) : base

  const sortedAsc = sortByDateAsc(runs)
  const recentLong = sortedAsc.filter(isLongRun).slice(-RECENT_LONG_LIMIT)
  const sampleCount = recentLong.length

  const settle = (over: Partial<LongRunDriftAdaptation>, rationale: string): LongRunDriftAdaptation => ({
    baseTolerancePercent: base,
    adoptedTolerancePercent: adopted,
    effectiveTolerancePercent: currentFloor,
    status: adopted !== null ? 'adopted' : 'estimated',
    confidence: adopted !== null ? 'high' : 'low',
    qualifyingCount: 0,
    sampleCount,
    observedDriftPercents: [],
    rationale,
    ...over
  })

  if (opts.injuryActive) return settle({}, '부상 활성 — Long Run 허용치 갱신 보류. 채택값 유지, 회복 후 재평가.')
  if (!sampleCount) return settle({}, '최근 Long Run 기록 없음 — 기본 허용치 유지.')

  // 회복 양호한 Long Run의 실측 드리프트만 증거로 인정.
  const qualifying = recentLong
    .map((run) => ({ run, drift: lateRunDriftPercent(run), recoveryOk: nextRunRecoveryOk(run, sortedAsc) === true }))
    .filter((item): item is { run: RunLog; drift: number; recoveryOk: boolean } => item.drift !== null && item.recoveryOk)
  const observedDriftPercents = qualifying.map((item) => item.drift)
  const qualifyingCount = qualifying.length

  if (qualifyingCount < CANDIDATE_COUNT) {
    return settle(
      { qualifyingCount, observedDriftPercents },
      adopted !== null
        ? `현재 Long Run 허용 드리프트 ${currentFloor}% 유지(증거 ${qualifyingCount}건, 갱신엔 부족).`
        : `회복 양호 Long Run 증거 ${qualifyingCount}건 — 기본 허용치 ${base}% 유지.`
    )
  }

  // 개인 허용치 = 실측 드리프트의 중앙값을 올림해 [base, max]로 클램프(개발 단계 러너는 다소 느슨 허용).
  const sorted = [...observedDriftPercents].sort((a, b) => a - b)
  const median = sorted[Math.floor((sorted.length - 1) / 2)]
  const target = clampTolerance(Math.ceil(median))
  const confirmed = qualifyingCount >= CONFIRM_COUNT

  return {
    baseTolerancePercent: base,
    adoptedTolerancePercent: confirmed ? target : adopted,
    effectiveTolerancePercent: confirmed ? target : currentFloor,
    status: confirmed ? 'adopted' : 'watch',
    confidence: confirmed ? 'high' : 'medium',
    qualifyingCount,
    sampleCount,
    observedDriftPercents,
    rationale: confirmed
      ? `회복 양호 Long Run ${qualifyingCount}회의 후반 드리프트 중앙값 ${median}% — 개인 허용치를 ${target}%로 채택.`
      : `회복 양호 Long Run ${qualifyingCount}회 관찰 중(중앙값 ${median}%) — 1회 더 확인되면 허용치 갱신.`
  }
}

import type { RunLog } from '@/entities/run/model'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import {
  nextRunRecoveryOk,
  sortByDateAsc,
  type AdaptationConfidence,
  type AdaptationStatus
} from '@/shared/lib/coaching/adaptationShared'

/**
 * Easy 심박 상한 적응 (#333, tempoAdaptation #301 패턴 미러).
 *
 * 원칙: heartRateZones의 easyCeilingBpm(base) 위에 "추정→검증→채택"을 얹는다.
 *   - Easy는 상한을 "넘기지 않는" 처방이므로, 적응은 유산소 기반 향상의 증거(같은 Easy에서 심박이
 *     상한보다 충분히 낮고 후반 안정·회복 양호)가 쌓이면 상한을 한 단계 올려 더 빠른 Easy를 허용한다.
 *   - 상향만. base 미만 불가. 안전망: base + MAX_TOTAL_RAISE_BPM(8).
 *   - 검증 2회 → 후보(watch), 3회 이상 → 채택(adopted). 부상 활성 시 상향 게이트 차단.
 */

export const EASY_MAX_TOTAL_RAISE_BPM = 8
const RAISE_STEP_BPM = 2
const RECENT_EASY_LIMIT = 6
const CANDIDATE_COUNT = 2
const CONFIRM_COUNT = 3
// 유산소 향상 증거: 평균심박이 현재 상한보다 이만큼 이상 낮아야 "여유 있는 Easy"로 본다.
const COMFORT_MARGIN_BPM = 8
const RPE_MAX_FOR_RAISE = 4

export type EasyCeilingAdaptation = {
  baseCeilingBpm: number | null
  effectiveCeilingBpm: number | null
  candidateCeilingBpm: number | null
  proposedAdoptedCeilingBpm: number | null
  status: AdaptationStatus
  confidence: AdaptationConfidence
  qualifyingCount: number
  sampleCount: number
  rationale: string
}

function isEasyType(run: RunLog): boolean {
  return run.type === 'Easy' || run.type === 'Easy + Strides'
}

export function computeEasyCeilingAdaptation(
  runs: RunLog[],
  baseCeilingBpm: number | null,
  opts: { injuryActive?: boolean; adoptedCeilingBpm?: number | null } = {}
): EasyCeilingAdaptation {
  const adopted = typeof opts.adoptedCeilingBpm === 'number' ? opts.adoptedCeilingBpm : null

  if (baseCeilingBpm === null) {
    return {
      baseCeilingBpm: null,
      effectiveCeilingBpm: null,
      candidateCeilingBpm: null,
      proposedAdoptedCeilingBpm: adopted,
      status: 'estimated',
      confidence: 'low',
      qualifyingCount: 0,
      sampleCount: 0,
      rationale: 'Easy 심박 상한 미설정(나이/심박 입력 필요) — 적응 보류.'
    }
  }

  const raiseCap = baseCeilingBpm + EASY_MAX_TOTAL_RAISE_BPM
  const currentFloor = Math.min(Math.max(baseCeilingBpm, adopted ?? baseCeilingBpm), raiseCap)
  const onAdapted = currentFloor > baseCeilingBpm

  const sortedAsc = sortByDateAsc(runs)
  const recentEasy = sortedAsc.filter(isEasyType).slice(-RECENT_EASY_LIMIT)
  const sampleCount = recentEasy.length

  const settle = (over: Partial<EasyCeilingAdaptation>, rationale: string): EasyCeilingAdaptation => ({
    baseCeilingBpm,
    effectiveCeilingBpm: currentFloor,
    candidateCeilingBpm: null,
    proposedAdoptedCeilingBpm: adopted,
    status: onAdapted ? 'adopted' : 'estimated',
    confidence: onAdapted ? 'high' : 'low',
    qualifyingCount: 0,
    sampleCount,
    rationale,
    ...over
  })

  if (opts.injuryActive) return settle({}, '부상 활성 — Easy 상향 게이트 차단. 채택 상한 유지, 회복 후 재평가.')
  if (!sampleCount) return settle({}, '최근 Easy 기록 없음 — 현재 상한 유지.')

  // 검증: 평균심박이 상한보다 충분히 낮고(여유), 후반 안정(드리프트 ≤1), 회복 양호, RPE 낮음.
  const qualifying = recentEasy.filter((run) => {
    if (run.avgHeartRate === null) return false
    if (run.avgHeartRate > currentFloor - COMFORT_MARGIN_BPM) return false
    if (evaluateLapDrift(run).level >= 2) return false
    if (run.rpe !== null && run.rpe > RPE_MAX_FOR_RAISE) return false
    return nextRunRecoveryOk(run, sortedAsc) === true
  })
  const qualifyingCount = qualifying.length
  const raiseTarget = Math.min(currentFloor + RAISE_STEP_BPM, raiseCap)

  if (raiseTarget <= currentFloor) {
    return settle({ qualifyingCount }, `Easy 상한이 안전 상한(base+${EASY_MAX_TOTAL_RAISE_BPM})에 도달 — 추가 상향 없음.`)
  }
  if (qualifyingCount >= CONFIRM_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: raiseTarget,
      candidateCeilingBpm: null,
      proposedAdoptedCeilingBpm: raiseTarget,
      status: 'adopted',
      confidence: 'high',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Easy ${qualifyingCount}회가 상한보다 여유 있게 안정·회복 양호 — Easy 상한을 ${currentFloor}→${raiseTarget}bpm로 상향.`
    }
  }
  if (qualifyingCount >= CANDIDATE_COUNT) {
    return {
      baseCeilingBpm,
      effectiveCeilingBpm: currentFloor,
      candidateCeilingBpm: raiseTarget,
      proposedAdoptedCeilingBpm: adopted,
      status: 'watch',
      confidence: onAdapted ? 'high' : 'medium',
      qualifyingCount,
      sampleCount,
      rationale: `최근 Easy ${qualifyingCount}회가 상향 조건 충족 — ${raiseTarget}bpm 후보로 관찰(1회 더 확인 시 적용).`
    }
  }
  return settle(
    { qualifyingCount },
    onAdapted ? `현재 Easy 적응 상한 ${currentFloor}bpm 유지(추가 상향 근거 부족).` : '아직 Easy 상향 근거 부족 — 추정 상한 유지.'
  )
}

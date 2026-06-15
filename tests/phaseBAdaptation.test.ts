import { describe, expect, it } from 'vitest'
import type { Lap, RunLog } from '@/entities/run/model'
import { computeEasyCeilingAdaptation } from '@/shared/lib/coaching/easyAdaptation'
import {
  computeLongRunDriftAdaptation,
  lateRunDriftPercent
} from '@/shared/lib/coaching/longRunDriftAdaptation'
import { computeRecoveryCycleAdaptation } from '@/shared/lib/coaching/recoveryCycleAdaptation'
import {
  summarizeAdaptiveModels,
  toAdoptedAdaptiveMetrics,
  type AdaptiveModelsSummary
} from '@/shared/lib/coaching/adaptiveModelsSummary'
import { normalizeTrainingMemory } from '@/entities/training-memory/model'
import { makeRun } from './factories'

function lap(paceSec: number, avgHeartRate: number): Lap {
  return { distanceKm: 1, paceSec, avgHeartRate, maxHeartRate: avgHeartRate + 5 } as Lap
}

// 날짜 헬퍼: 2026-06-d
function day(d: number): string {
  return `2026-06-${String(d).padStart(2, '0')}`
}

describe('computeEasyCeilingAdaptation (#333)', () => {
  it('base 미설정이면 보류한다', () => {
    const result = computeEasyCeilingAdaptation([makeRun({ type: 'Easy' })], null)
    expect(result.status).toBe('estimated')
    expect(result.effectiveCeilingBpm).toBeNull()
  })

  it('여유 있는 Easy 3회+회복 양호면 상한을 한 단계 채택한다', () => {
    const runs: RunLog[] = [
      makeRun({ id: 'e1', type: 'Easy', date: day(1), avgHeartRate: 130 }),
      makeRun({ id: 'r1', type: 'Easy', date: day(3), avgHeartRate: 131 }),
      makeRun({ id: 'e2', type: 'Easy', date: day(5), avgHeartRate: 129 }),
      makeRun({ id: 'r2', type: 'Recovery', date: day(7), avgHeartRate: 120 }) // 마지막 회복 근거
    ]
    const result = computeEasyCeilingAdaptation(runs, 145)
    expect(result.qualifyingCount).toBeGreaterThanOrEqual(3)
    expect(result.status).toBe('adopted')
    expect(result.effectiveCeilingBpm).toBe(147)
    expect(result.proposedAdoptedCeilingBpm).toBe(147)
  })

  it('부상 활성 시 상향 게이트를 차단한다', () => {
    const runs = [makeRun({ type: 'Easy', date: day(1), avgHeartRate: 130 }), makeRun({ type: 'Easy', date: day(3), avgHeartRate: 130 })]
    const result = computeEasyCeilingAdaptation(runs, 145, { injuryActive: true })
    expect(result.effectiveCeilingBpm).toBe(145)
    expect(result.rationale).toContain('부상')
  })

  it('base+8 안전 상한을 넘기지 않는다', () => {
    const runs: RunLog[] = [
      makeRun({ id: 'e1', type: 'Easy', date: day(1), avgHeartRate: 130 }),
      makeRun({ id: 'e2', type: 'Easy', date: day(3), avgHeartRate: 130 }),
      makeRun({ id: 'e3', type: 'Easy', date: day(5), avgHeartRate: 130 }),
      makeRun({ id: 'tail', type: 'Recovery', date: day(7), avgHeartRate: 120 })
    ]
    const result = computeEasyCeilingAdaptation(runs, 145, { adoptedCeilingBpm: 153 })
    expect(result.effectiveCeilingBpm).toBeLessThanOrEqual(153)
  })
})

describe('lateRunDriftPercent + computeLongRunDriftAdaptation (#334)', () => {
  it('전반 대비 후반 페이스 드리프트를 %로 계산한다', () => {
    const run = makeRun({
      type: 'LSD',
      laps: [lap(360, 140), lap(362, 142), lap(372, 150), lap(374, 152)]
    })
    // 후반(372,374 평균 373) - 전반(360,362 평균 361) = 12, /360 → 3.3%
    expect(lateRunDriftPercent(run)).toBeCloseTo(3.3, 1)
  })

  it('회복 양호 Long Run 3회면 개인 허용치를 채택한다', () => {
    const longLaps = [lap(360, 140), lap(361, 141), lap(369, 148), lap(370, 149)] // 약 2.5% 드리프트
    const runs: RunLog[] = [
      makeRun({ id: 'l1', type: 'LSD', date: day(1), laps: longLaps }),
      makeRun({ id: 'g1', type: 'Easy', date: day(3), avgHeartRate: 120 }),
      makeRun({ id: 'l2', type: 'Steady Long', date: day(5), laps: longLaps }),
      makeRun({ id: 'g2', type: 'Easy', date: day(7), avgHeartRate: 120 }),
      makeRun({ id: 'l3', type: 'LSD', date: day(9), laps: longLaps }),
      makeRun({ id: 'g3', type: 'Easy', date: day(11), avgHeartRate: 120 })
    ]
    const result = computeLongRunDriftAdaptation(runs)
    expect(result.qualifyingCount).toBeGreaterThanOrEqual(3)
    expect(result.status).toBe('adopted')
    expect(result.effectiveTolerancePercent).toBeGreaterThanOrEqual(5)
    expect(result.effectiveTolerancePercent).toBeLessThanOrEqual(7)
  })

  it('Long Run 없으면 기본 허용치를 유지한다', () => {
    const result = computeLongRunDriftAdaptation([makeRun({ type: 'Easy' })])
    expect(result.effectiveTolerancePercent).toBe(5)
    expect(result.status).toBe('estimated')
  })
})

describe('computeRecoveryCycleAdaptation (#335)', () => {
  it('고강도 후 회복 모두 양호면 base 2일을 채택한다', () => {
    const runs: RunLog[] = [
      makeRun({ id: 't1', type: 'Tempo', date: day(1) }),
      makeRun({ id: 'g1', type: 'Easy', date: day(2), conditionScore: 5 }),
      makeRun({ id: 't2', type: 'Tempo', date: day(5) }),
      makeRun({ id: 'g2', type: 'Easy', date: day(6), conditionScore: 5 })
    ]
    const result = computeRecoveryCycleAdaptation(runs)
    expect(result.effectiveRestDays).toBe(2)
    expect(result.status).toBe('adopted')
  })

  it('회복 불량이 절반 이상이면 휴식을 상향한다', () => {
    const runs: RunLog[] = [
      makeRun({ id: 't1', type: 'Tempo', date: day(1) }),
      makeRun({ id: 'b1', type: 'Easy', date: day(2), rpe: 8 }), // 회복 불량
      makeRun({ id: 't2', type: 'Tempo', date: day(5) }),
      makeRun({ id: 'b2', type: 'Easy', date: day(6), painNote: '무릎 통증' }) // 회복 불량
    ]
    const result = computeRecoveryCycleAdaptation(runs)
    expect(result.poorRecoveryCount).toBe(2)
    expect(result.effectiveRestDays).toBe(3)
    expect(result.status).toBe('adopted')
  })

  it('부상 활성 시 휴식을 최소 3일로 강화한다', () => {
    const result = computeRecoveryCycleAdaptation([makeRun({ type: 'Tempo', date: day(1) })], { injuryActive: true })
    expect(result.effectiveRestDays).toBeGreaterThanOrEqual(3)
    expect(result.rationale).toContain('부상')
  })

  it('범위를 [2,4]로 제한한다', () => {
    const result = computeRecoveryCycleAdaptation([makeRun({ type: 'Tempo', date: day(1) })], { adoptedRestDays: 9 })
    expect(result.effectiveRestDays).toBeLessThanOrEqual(4)
  })
})

describe('summarizeAdaptiveModels + toAdoptedAdaptiveMetrics (#333~#335)', () => {
  it('runs+memory로 세 모델 요약을 모두 반환한다', () => {
    const memory = normalizeTrainingMemory({ goal: '10km 60분 달성', injuryItems: [] } as never)
    const summary = summarizeAdaptiveModels([makeRun({ type: 'Easy' })], memory, [])
    expect(summary.easyCeiling).toBeDefined()
    expect(summary.longRunDrift).toBeDefined()
    expect(summary.recoveryCycle).toBeDefined()
  })

  it('채택(adopted) 상태 메트릭만 영속 레코드로 변환한다', () => {
    const summary: AdaptiveModelsSummary = {
      easyCeiling: {
        baseCeilingBpm: 145,
        effectiveCeilingBpm: 147,
        candidateCeilingBpm: null,
        proposedAdoptedCeilingBpm: 147,
        status: 'adopted',
        confidence: 'high',
        qualifyingCount: 3,
        sampleCount: 4,
        rationale: ''
      },
      longRunDrift: {
        baseTolerancePercent: 5,
        adoptedTolerancePercent: null,
        effectiveTolerancePercent: 5,
        status: 'watch',
        confidence: 'medium',
        qualifyingCount: 2,
        sampleCount: 3,
        observedDriftPercents: [],
        rationale: ''
      },
      recoveryCycle: {
        baseRestDays: 2,
        adoptedRestDays: 3,
        effectiveRestDays: 3,
        status: 'adopted',
        confidence: 'high',
        qualifyingCount: 4,
        sampleCount: 4,
        poorRecoveryCount: 2,
        rationale: ''
      }
    }
    const records = toAdoptedAdaptiveMetrics(summary)
    const types = records.map((record) => record.metricType).sort()
    expect(types).toEqual(['easy_ceiling', 'recovery_cycle'])
    expect(records.find((r) => r.metricType === 'easy_ceiling')?.adoptedValue).toBe(147)
    expect(records.find((r) => r.metricType === 'recovery_cycle')?.unit).toBe('days')
  })
})

import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { computeTempoCeilingAdaptation, gradeTempoRun } from './tempoAdaptation'

function makeRun(overrides: Partial<RunLog> & { id: string }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-06-01', startAt: null, endAt: null,
    type: 'Tempo', distanceKm: 8, durationSec: 2400, avgPaceSec: 300, avgHeartRate: 150, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  }
}

// fade<2가 되도록 laps는 비워두면 evaluateLapDrift level=1.
const BASE = 158

describe('gradeTempoRun', () => {
  it('A: 자극 확보 + 상한 이내 + 후반 안정', () => {
    const run = makeRun({ id: 'a', maxHeartRate: 156, avgHeartRate: 150, rpe: 6 })
    expect(gradeTempoRun(run, BASE, 1).grade).toBe('A')
  })

  it('B: 자극 확보 + 경계 일부 초과(<=10bpm) + 후반 안정', () => {
    const run = makeRun({ id: 'b', maxHeartRate: 166, avgHeartRate: 152, rpe: 6 }) // +8
    const g = gradeTempoRun(run, BASE, 1)
    expect(g.grade).toBe('B')
    expect(g.overBpm).toBe(8)
  })

  it('C: 경계 크게 초과(>10bpm)', () => {
    const run = makeRun({ id: 'c', maxHeartRate: 172, avgHeartRate: 158, rpe: 7 }) // +14
    expect(gradeTempoRun(run, BASE, 1).grade).toBe('C')
  })

  it('C: 경미 초과라도 후반 급락(level>=2) 동반', () => {
    const run = makeRun({ id: 'c2', maxHeartRate: 162, avgHeartRate: 152, rpe: 6 }) // +4
    expect(gradeTempoRun(run, BASE, 2).grade).toBe('C')
  })

  it('D: 자극 부족(목표 강도 미도달)', () => {
    const run = makeRun({ id: 'd', maxHeartRate: 130, avgHeartRate: 120, rpe: 3 })
    expect(gradeTempoRun(run, BASE, 1).grade).toBe('D')
  })

  it('상한 미상이어도 자극 있으면 최소 B(보수 판정)', () => {
    const run = makeRun({ id: 'n', maxHeartRate: null, avgHeartRate: null, rpe: 6 })
    expect(gradeTempoRun(run, null, 1).grade).toBe('B')
  })
})

// 검증 자격 Tempo + 다음날 회복 양호 세트. 각 Tempo 뒤에 회복 런을 둔다.
function qualifyingSet(count: number, maxHr: number): RunLog[] {
  const runs: RunLog[] = []
  for (let i = 0; i < count; i++) {
    const day = 10 + i * 4
    runs.push(makeRun({ id: `tempo-${i}`, type: 'Tempo', date: `2026-06-${String(day).padStart(2, '0')}`, maxHeartRate: maxHr, avgHeartRate: 152, rpe: 6 }))
    runs.push(makeRun({ id: `easy-${i}`, type: 'Easy', date: `2026-06-${String(day + 1).padStart(2, '0')}`, maxHeartRate: 135, avgHeartRate: 125, rpe: 3, conditionScore: 4 }))
  }
  return runs
}

describe('computeTempoCeilingAdaptation', () => {
  it('base 상한이 없으면 적응 보류(estimate/low)', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), null)
    expect(a.source).toBe('estimate')
    expect(a.effectiveCeilingBpm).toBeNull()
  })

  it('부상 활성이면 상향 게이트 차단', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), BASE, { injuryActive: true })
    expect(a.source).toBe('estimate')
    expect(a.effectiveCeilingBpm).toBe(BASE)
    expect(a.candidateCeilingBpm).toBeNull()
  })

  it('검증 2회 → 상향 후보(관찰), effective는 아직 base', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(2, 165), BASE)
    expect(a.confidence).toBe('medium')
    expect(a.source).toBe('estimate')
    expect(a.effectiveCeilingBpm).toBe(BASE)
    expect(a.candidateCeilingBpm).toBe(BASE + 2)
    expect(a.qualifyingCount).toBe(2)
  })

  it('검증 3회 이상 → 고신뢰 자동 적용(+step, 입증 최대 이내)', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), BASE)
    expect(a.confidence).toBe('high')
    expect(a.source).toBe('adapted')
    expect(a.effectiveCeilingBpm).toBe(BASE + 2) // min(158+2, 165)
    expect(a.candidateCeilingBpm).toBeNull()
  })

  it('상향 step은 입증된 최대심박을 넘지 않는다', () => {
    // 상한 초과지만 +1bpm만 입증 → effective는 base+1로 캡.
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, BASE + 1), BASE)
    expect(a.effectiveCeilingBpm).toBe(BASE + 1)
  })

  it('RPE 높거나 회복 나쁘면 검증 자격 미달 → 상향 안 함', () => {
    const runs = qualifyingSet(3, 165).map((r) => (r.type === 'Tempo' ? { ...r, rpe: 8 } : r))
    const a = computeTempoCeilingAdaptation(runs, BASE)
    expect(a.qualifyingCount).toBe(0)
    expect(a.effectiveCeilingBpm).toBe(BASE)
  })

  it('상한 이내(초과 아님) Tempo는 검증 자격 아님(상향 근거 아님)', () => {
    const runs = qualifyingSet(3, BASE - 4) // maxHr < base
    const a = computeTempoCeilingAdaptation(runs, BASE)
    expect(a.qualifyingCount).toBe(0)
    expect(a.effectiveCeilingBpm).toBe(BASE)
  })

  it('effective는 base 미만으로 내려가지 않는다(상향만)', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(1, 200), BASE)
    expect(a.effectiveCeilingBpm).toBe(BASE)
  })

  it('검증 3회는 proposedAdoptedCeilingBpm를 effective와 동일하게 제시(영속 대상)', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), BASE)
    expect(a.proposedAdoptedCeilingBpm).toBe(BASE + 2)
    expect(a.effectiveCeilingBpm).toBe(BASE + 2)
  })
})

describe('computeTempoCeilingAdaptation — 다단계 래칫(영속 채택값 재앵커링)', () => {
  it('채택값은 sticky: 추가 근거 없어도 effective는 채택 상한 유지(고신뢰)', () => {
    const a = computeTempoCeilingAdaptation([], BASE, { adoptedCeilingBpm: 160 })
    expect(a.effectiveCeilingBpm).toBe(160)
    expect(a.source).toBe('adapted')
    expect(a.confidence).toBe('high')
    expect(a.proposedAdoptedCeilingBpm).toBe(160) // 변경 없음
  })

  it('채택값 위에서 재검증되면 다음 단계로 상향(160→162)', () => {
    // 채택 160 위로 maxHr 165가 3회 검증 → 162로 한 단계 더.
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), BASE, { adoptedCeilingBpm: 160 })
    expect(a.effectiveCeilingBpm).toBe(162)
    expect(a.proposedAdoptedCeilingBpm).toBe(162)
    expect(a.source).toBe('adapted')
  })

  it('채택값을 넘지 못한 Tempo는 추가 상향 근거가 아니다(채택 상한 유지)', () => {
    // 채택 162인데 최근 Tempo maxHr 160(채택값 이하) → 추가 자격 0, effective 162 유지.
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 160), BASE, { adoptedCeilingBpm: 162 })
    expect(a.qualifyingCount).toBe(0)
    expect(a.effectiveCeilingBpm).toBe(162)
    expect(a.proposedAdoptedCeilingBpm).toBe(162)
  })

  it('부상 활성: 채택 상한은 유지하되 추가 상향은 차단', () => {
    const a = computeTempoCeilingAdaptation(qualifyingSet(3, 165), BASE, { adoptedCeilingBpm: 160, injuryActive: true })
    expect(a.effectiveCeilingBpm).toBe(160)
    expect(a.candidateCeilingBpm).toBeNull()
    expect(a.proposedAdoptedCeilingBpm).toBe(160)
  })

  it('채택값이 base보다 낮아도 effective는 base 미만으로 내려가지 않는다', () => {
    const a = computeTempoCeilingAdaptation([], BASE, { adoptedCeilingBpm: BASE - 5 })
    expect(a.effectiveCeilingBpm).toBe(BASE)
  })
})

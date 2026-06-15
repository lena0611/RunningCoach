import { describe, expect, it } from 'vitest'
import type { Lap, RunLog } from '@/entities/run/model'
import { normalizeTrainingMemory, type TrainingMemory } from '@/entities/training-memory/model'
import { evaluateProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'
import { makeRun } from './factories'

function lap(paceSec: number, avgHeartRate: number): Lap {
  return { distanceKm: 1, paceSec, avgHeartRate, maxHeartRate: avgHeartRate + 5 } as Lap
}
function day(d: number): string {
  return `2026-06-${String(d).padStart(2, '0')}`
}
function memoryWith(overrides: Record<string, unknown> = {}): TrainingMemory {
  return normalizeTrainingMemory({
    goal: '10km 60분 달성',
    athleteProfile: { heartRateMode: 'manual', lactateThresholdHr: 170 },
    injuryItems: [],
    activeInjuryItemId: null,
    ...overrides
  } as never)
}

describe('evaluateProgressionCriteria (#336)', () => {
  it('4기준 statusMap을 모두 채우고 readyCount를 집계한다', () => {
    const result = evaluateProgressionCriteria([makeRun({ type: 'Easy' })], memoryWith())
    expect(Object.keys(result.statusMap).sort()).toEqual([
      'easy-hr-stability',
      'injury-recovery-gate',
      'long-run-durability',
      'tempo-ceiling-quality'
    ])
    expect(result.readyCount).toBeGreaterThanOrEqual(0)
    expect(result.criteria).toHaveLength(4)
  })

  it('active 부상이면 injury-recovery-gate가 blocked, allReady=false', () => {
    const memory = memoryWith({
      injuryItems: [
        { id: 'inj1', title: '좌측 햄스트링', area: '햄스트링', severity: 3, status: 'active' }
      ],
      activeInjuryItemId: 'inj1'
    })
    const result = evaluateProgressionCriteria([makeRun({ type: 'Easy' })], memory)
    expect(result.statusMap['injury-recovery-gate']).toBe('blocked')
    expect(result.allReady).toBe(false)
  })

  it('Easy가 상한보다 충분히 낮으면 easy-hr-stability ready', () => {
    const runs: RunLog[] = [
      makeRun({ type: 'Easy', date: day(10), avgHeartRate: 110 }),
      makeRun({ type: 'Easy', date: day(12), avgHeartRate: 112 }),
      makeRun({ type: 'Easy', date: day(14), avgHeartRate: 111 })
    ]
    const result = evaluateProgressionCriteria(runs, memoryWith())
    expect(result.statusMap['easy-hr-stability']).toBe('ready')
  })

  it('Easy가 상한을 크게 넘으면 easy-hr-stability blocked', () => {
    const runs: RunLog[] = [
      makeRun({ type: 'Easy', date: day(10), avgHeartRate: 205 }),
      makeRun({ type: 'Easy', date: day(12), avgHeartRate: 206 })
    ]
    const result = evaluateProgressionCriteria(runs, memoryWith())
    expect(result.statusMap['easy-hr-stability']).toBe('blocked')
  })

  it('Tempo가 상한을 크게·반복 초과하면 tempo-ceiling-quality blocked', () => {
    const runs: RunLog[] = [
      makeRun({ type: 'Tempo', date: day(10), avgHeartRate: 190, maxHeartRate: 205 }),
      makeRun({ type: 'Tempo', date: day(13), avgHeartRate: 192, maxHeartRate: 208 })
    ]
    const result = evaluateProgressionCriteria(runs, memoryWith())
    expect(result.statusMap['tempo-ceiling-quality']).toBe('blocked')
  })

  it('Long Run 후반 드리프트가 작으면 long-run-durability ready', () => {
    const steady = [lap(360, 140), lap(361, 141), lap(369, 148), lap(370, 149)] // ~2.5%
    const runs: RunLog[] = [
      makeRun({ type: 'LSD', date: day(5), laps: steady }),
      makeRun({ type: 'Steady Long', date: day(15), laps: steady })
    ]
    const result = evaluateProgressionCriteria(runs, memoryWith())
    expect(result.statusMap['long-run-durability']).toBe('ready')
  })

  it('Long Run 후반 드리프트가 크면 long-run-durability blocked', () => {
    const fading = [lap(360, 140), lap(362, 142), lap(430, 165), lap(440, 168)] // ~21%
    const runs: RunLog[] = [
      makeRun({ type: 'LSD', date: day(5), laps: fading }),
      makeRun({ type: 'Steady Long', date: day(15), laps: fading })
    ]
    const result = evaluateProgressionCriteria(runs, memoryWith())
    expect(result.statusMap['long-run-durability']).toBe('blocked')
  })
})

import { describe, expect, it } from 'vitest'
import type { Lap, RunLog } from '@/entities/run/model'
import type { SessionIntent } from '@/entities/session-intent/model'
import { computeIntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'

function lap(index: number, paceSec: number, hr: number): Lap {
  return { index, distanceKm: 1, paceSec, avgHeartRate: hr, cadence: null }
}

function run(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'r1', userId: 'u1', externalId: null, sessionTitle: '', date: '2026-06-15',
    startAt: null, endAt: null, type: 'Tempo', distanceKm: 6, durationSec: 1800,
    avgPaceSec: 300, avgHeartRate: 158, maxHeartRate: 170, cadence: null, activeEnergyKcal: null,
    temperature: null, humidity: null, windMps: null, elevationGainM: null, elevationLossM: null,
    courseType: 'Unknown', rpe: 7, workoutFeeling: '', painNote: '', sleepQuality: null,
    conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [lap(1, 300, 150), lap(2, 300, 152), lap(3, 302, 156), lap(4, 303, 158)],
    fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '', updatedAt: '', ...overrides
  }
}

function intent(overrides: Partial<SessionIntent['targets']> = {}): SessionIntent {
  return {
    id: 'i1', userId: 'u1', goalId: null, plannedDate: '2026-06-15', sessionType: 'Tempo',
    title: 'Tempo 6km', why: '', successCriteria: [], source: 'coach', status: 'completed',
    runId: 'r1', matchedAt: null, createdAt: '', updatedAt: '',
    targets: { hrCeilingBpm: 168, hrRange: [156, 168], rpeRange: [6, 7], paceHold: '유지', ...overrides }
  }
}

describe('computeIntentFulfillment', () => {
  it('상한 이내·후반 안정·RPE 범위 → 높은 달성률', () => {
    const f = computeIntentFulfillment(intent(), run())
    expect(f).not.toBeNull()
    expect(f!.pct).toBeGreaterThanOrEqual(90)
  })

  it('심박 상한 크게 초과 → 달성률 하락', () => {
    const high = computeIntentFulfillment(intent(), run({ avgHeartRate: 185 }))!
    const ok = computeIntentFulfillment(intent(), run())!
    expect(high.pct).toBeLessThan(ok.pct)
  })

  it('평가 가능한 항목만으로 정규화(랩 없고 심박만)', () => {
    const f = computeIntentFulfillment(intent(), run({ laps: [], rpe: null }))
    expect(f).not.toBeNull()
    expect(f!.components.find((c) => c.key === 'pace')!.score).toBeNull()
    expect(f!.components.find((c) => c.key === 'rpe')!.score).toBeNull()
    // 심박만 상한 이내 → 100
    expect(f!.pct).toBe(100)
  })

  it('평가 가능한 항목이 전혀 없으면 null', () => {
    const f = computeIntentFulfillment(
      intent({ hrCeilingBpm: null, rpeRange: null }),
      run({ avgHeartRate: null, rpe: null, laps: [] })
    )
    expect(f).toBeNull()
  })
})

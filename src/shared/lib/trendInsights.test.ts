import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { buildTrendLensResult } from '@/shared/lib/trendInsights'

function run(input: Partial<RunLog>): RunLog {
  return {
    id: input.id ?? crypto.randomUUID(),
    userId: 'user-1',
    externalId: null,
    sessionTitle: input.sessionTitle ?? input.type ?? '러닝',
    date: input.date ?? '2026-01-01',
    startAt: null,
    endAt: null,
    type: input.type ?? 'Easy',
    distanceKm: input.distanceKm ?? 5,
    durationSec: input.durationSec ?? 1800,
    avgPaceSec: input.avgPaceSec ?? 360,
    avgHeartRate: input.avgHeartRate ?? 140,
    maxHeartRate: input.maxHeartRate ?? 148,
    cadence: input.cadence ?? 170,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: input.courseType ?? 'Flat',
    rpe: input.rpe ?? null,
    workoutFeeling: '',
    painNote: input.painNote ?? '',
    sleepQuality: input.sleepQuality ?? null,
    conditionScore: input.conditionScore ?? null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: input.laps ?? [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: input.tags ?? [],
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('buildTrendLensResult', () => {
  it('returns neutral empty state when runs are missing', () => {
    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs: [],
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('neutral')
    expect(result.prescriptionImpact.status).toBe('not-enough-data')
  })

  it('detects same heart-rate band pace improvement in efficiency lens', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410 }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400 }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405 }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378 }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382 })
    ]

    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('good')
    expect(result.hero.value).toContain('+')
    expect(result.prescriptionImpact.status).toBe('raise-candidate')
  })

  it('flags hard-session density in intensity lens without treating load jump as injury prediction', () => {
    const runs = [
      run({ id: 'easy-1', date: '2026-05-26', type: 'Easy', distanceKm: 5, avgPaceSec: 420 }),
      run({ id: 'tempo-1', date: '2026-05-27', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'long-1', date: '2026-05-29', type: 'LSD', distanceKm: 12, avgPaceSec: 430 }),
      run({ id: 'race-1', date: '2026-05-31', type: 'Race', distanceKm: 5, avgPaceSec: 330 })
    ]

    const result = buildTrendLensResult({
      lens: 'intensity',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('warning')
    expect(result.explanations.join(' ')).toContain('스케줄 보수성')
    expect(result.prescriptionImpact.status).toBe('reduce-or-recover')
  })

  it('uses pain note after a quality session as recovery cost signal', () => {
    const runs = [
      run({ id: 'tempo-1', date: '2026-05-20', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'easy-after', date: '2026-05-22', type: 'Easy', distanceKm: 4, avgPaceSec: 430, painNote: '햄스트링 뻣뻣함', rpe: 7 })
    ]

    const result = buildTrendLensResult({
      lens: 'recovery',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('warning')
    expect(result.cards.find((item) => item.id === 'pain')?.value).toBe('1')
  })
})

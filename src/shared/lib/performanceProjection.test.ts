import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingGoal } from '@/entities/training-memory/model'
import { getRaceProjection } from './performanceProjection'

const goal: TrainingGoal = {
  id: 'goal-10k',
  title: '10km 60분',
  category: 'race',
  startDate: null,
  targetDate: '2026-11-25',
  distanceKm: 10,
  targetDurationSec: 3600,
  priority: 1,
  status: 'active',
  successCriteria: '10km 60분 이내',
  strategyNotes: '',
  notes: '',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
}

describe('performanceProjection', () => {
  it('combines performance, threshold, aerobic base, long run, and consistency factors', () => {
    const runs = [
      run({ id: 'tempo-2', date: '2026-05-24', type: 'Tempo', distanceKm: 6.2, durationSec: 2480, avgHeartRate: 156, maxHeartRate: 164, rpe: 7 }),
      run({ id: 'long-1', date: '2026-05-23', type: 'Steady Long', distanceKm: 12.8, durationSec: 5580, avgHeartRate: 144, maxHeartRate: 154 }),
      run({ id: 'easy-1', date: '2026-05-21', type: 'Easy', distanceKm: 5.1, durationSec: 2400, avgHeartRate: 135 }),
      run({ id: 'tempo-1', date: '2026-05-17', type: 'Tempo', distanceKm: 5.5, durationSec: 2250, avgHeartRate: 158, maxHeartRate: 165, rpe: 7 }),
      run({ id: 'easy-2', date: '2026-05-15', type: 'Recovery', distanceKm: 4.8, durationSec: 2900, avgHeartRate: 122 }),
      run({ id: 'easy-3', date: '2026-05-12', type: 'Easy + Strides', distanceKm: 5.4, durationSec: 2450, avgHeartRate: 138 }),
      run({ id: 'tempo-0', date: '2026-05-10', type: 'Tempo', distanceKm: 5, durationSec: 2100, avgHeartRate: 157, maxHeartRate: 164, rpe: 7 }),
      run({ id: 'easy-4', date: '2026-05-05', type: 'Easy', distanceKm: 5.2, durationSec: 2500, avgHeartRate: 134 })
    ]

    const projection = getRaceProjection(runs, goal, new Date('2026-05-27T00:00:00'))

    expect(projection?.factors.map((factor) => factor.key)).toEqual([
      'performance',
      'threshold',
      'aerobicBase',
      'longRun',
      'consistency',
      'injuryRecovery'
    ])
    expect(projection?.readinessScore).toBeGreaterThan(50)
    expect(projection?.factors.find((factor) => factor.key === 'threshold')?.summary).toContain('3회')
    expect(projection?.factors.find((factor) => factor.key === 'longRun')?.score).toBeGreaterThan(70)
  })

  it('does not treat a single fast signal as a complete goal basis', () => {
    const runs = [
      run({ id: 'tempo-only', date: '2026-05-24', type: 'Tempo', distanceKm: 6, durationSec: 2400, avgHeartRate: 158, maxHeartRate: 164, rpe: 7 })
    ]

    const projection = getRaceProjection(runs, goal, new Date('2026-05-27T00:00:00'))

    expect(projection?.readinessScore).toBeLessThan(60)
    expect(projection?.factors.find((factor) => factor.key === 'aerobicBase')?.status).toBe('weak')
    expect(projection?.factors.find((factor) => factor.key === 'longRun')?.status).toBe('weak')
  })
})

function run(overrides: Partial<RunLog>): RunLog {
  return {
    id: 'run',
    userId: 'user',
    externalId: null,
    sessionTitle: '',
    date: '2026-05-01',
    startAt: null,
    endAt: null,
    type: 'Easy',
    distanceKm: 5,
    durationSec: 2400,
    avgPaceSec: null,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: 'Unknown',
    rpe: null,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: [],
    source: 'manual',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides
  }
}

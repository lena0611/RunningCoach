import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { AthleteProfile } from '@/entities/training-memory/model'
import { deriveRunnerLevel, resolveRunnerLevel } from './runnerLevel'

const today = new Date('2026-06-02T00:00:00')

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    birthYear: null,
    sex: 'unknown',
    runningExperienceMonths: null,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: [],
    runnerLevel: 'auto',
    ...overrides
  }
}

function daysAgo(n: number): string {
  const d = new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function run(date: string, distanceKm: number): RunLog {
  return {
    id: `run-${date}-${distanceKm}`, userId: 'u', externalId: null, sessionTitle: '', date,
    startAt: null, endAt: null, type: 'Easy', distanceKm, durationSec: 1800, avgPaceSec: null,
    avgHeartRate: null, maxHeartRate: null, cadence: null, activeEnergyKcal: null, temperature: null,
    humidity: null, windMps: null, elevationGainM: null, elevationLossM: null, courseType: 'Unknown',
    rpe: null, workoutFeeling: '', painNote: '', sleepQuality: null, conditionScore: null,
    stressLevel: null, companion: '', memo: '', laps: [], fastSegments: [], metricSamples: [],
    routePoints: [], tags: [], source: 'manual', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`
  }
}

function recentRuns(count: number, distanceKm: number): RunLog[] {
  return Array.from({ length: count }, (_, index) => run(daysAgo(index + 1), distanceKm))
}

describe('deriveRunnerLevel', () => {
  it('treats an empty profile with no runs as beginner with low data sufficiency', () => {
    const result = deriveRunnerLevel(profile(), [], today)
    expect(result.level).toBe('beginner')
    expect(result.dataSufficiency).toBe('low')
    expect(result.source).toBe('auto')
  })

  it('keeps a short-experience low-volume runner at beginner', () => {
    const result = deriveRunnerLevel(profile({ runningExperienceMonths: 6 }), recentRuns(4, 4), today)
    expect(result.level).toBe('beginner')
    expect(result.dataSufficiency).toBe('ok')
  })

  it('classifies a mid-experience moderate-volume runner as intermediate', () => {
    const result = deriveRunnerLevel(profile({ runningExperienceMonths: 24 }), recentRuns(12, 7), today)
    expect(result.level).toBe('intermediate')
  })

  it('classifies an experienced high-volume runner with a fast PB as advanced', () => {
    const result = deriveRunnerLevel(
      profile({
        runningExperienceMonths: 48,
        personalBests: [{ distanceKm: 5, durationSec: 22 * 60, date: '2026-05-01', source: 'race' }]
      }),
      recentRuns(20, 10),
      today
    )
    expect(result.level).toBe('advanced')
  })

  it('ignores PBs shorter than the 3km reference distance', () => {
    const withSprint = deriveRunnerLevel(
      profile({ runningExperienceMonths: 14, personalBests: [{ distanceKm: 1, durationSec: 180, date: '2026-05-01', source: 'time_trial' }] }),
      recentRuns(10, 6),
      today
    )
    // 1km PB는 점수에 반영되지 않으므로 경력+볼륨/빈도만으로 판정된다.
    expect(withSprint.level).toBe('intermediate')
  })
})

describe('resolveRunnerLevel override', () => {
  it('uses the manual override over the derived level', () => {
    const result = resolveRunnerLevel(profile({ runnerLevel: 'advanced' }), [], today)
    expect(result.level).toBe('advanced')
    expect(result.source).toBe('manual')
  })

  it('falls back to the derived level when set to auto', () => {
    const result = resolveRunnerLevel(profile({ runnerLevel: 'auto', runningExperienceMonths: 6 }), recentRuns(3, 4), today)
    expect(result.source).toBe('auto')
    expect(result.level).toBe('beginner')
  })
})

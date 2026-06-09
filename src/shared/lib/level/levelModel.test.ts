import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { AthleteProfile } from '@/entities/training-memory/model'
import {
  distanceClassFromMeters,
  evaluateGate1,
  gate1InputsFromRuns,
  gradeBandFromVdot,
  gradeMaintenanceDue,
  maxCompletedDistanceM,
  nextDistanceClass,
  nextGradeBand,
  resolveRunnerProgress,
  runnerLevelFromGrade,
  runnerProgressLabel
} from './levelModel'

const today = new Date('2026-06-08T00:00:00')

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    birthYear: null,
    sex: 'unknown',
    runningExperienceMonths: null,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: [],
    runnerLevel: 'auto',
    maxHeartRate: null,
    restingHeartRate: null,
    lactateThresholdHr: null,
    heartRateMode: 'auto',
    vo2Max: null,
    vo2MaxSampleDate: null,
    vo2MaxSource: null,
    ...overrides
  }
}

function daysAgo(n: number): string {
  const d = new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function run(date: string, distanceKm: number, extra: Partial<RunLog> = {}): RunLog {
  return {
    id: `run-${date}-${distanceKm}`, userId: 'u', externalId: null, sessionTitle: '', date,
    startAt: null, endAt: null, type: 'Easy', distanceKm, durationSec: 1800, avgPaceSec: null,
    avgHeartRate: null, maxHeartRate: null, cadence: null, activeEnergyKcal: null, temperature: null,
    humidity: null, windMps: null, elevationGainM: null, elevationLossM: null, courseType: 'Unknown',
    rpe: null, workoutFeeling: '', painNote: '', sleepQuality: null, conditionScore: null,
    stressLevel: null, companion: '', memo: '', laps: [], fastSegments: [], metricSamples: [],
    routePoints: [], tags: [], source: 'manual', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`,
    ...extra
  }
}

describe('gradeBandFromVdot', () => {
  it('returns null for null/non-finite vdot', () => {
    expect(gradeBandFromVdot(null)).toBeNull()
    expect(gradeBandFromVdot(Number.NaN)).toBeNull()
  })

  it('maps vdot to the right band at boundaries', () => {
    expect(gradeBandFromVdot(31)?.key).toBe('iron')
    expect(gradeBandFromVdot(32)?.key).toBe('bronze')
    expect(gradeBandFromVdot(37.9)?.key).toBe('bronze')
    expect(gradeBandFromVdot(38)?.key).toBe('silver')
    expect(gradeBandFromVdot(44)?.key).toBe('gold')
    expect(gradeBandFromVdot(50)?.key).toBe('platinum')
    expect(gradeBandFromVdot(55.9)?.key).toBe('platinum')
    expect(gradeBandFromVdot(56)?.key).toBe('diamond')
    expect(gradeBandFromVdot(90)?.key).toBe('diamond')
  })
})

describe('nextGradeBand', () => {
  it('returns the next band, or null at the top', () => {
    expect(nextGradeBand(gradeBandFromVdot(44))?.key).toBe('platinum') // gold -> platinum
    expect(nextGradeBand(gradeBandFromVdot(56))).toBeNull() // diamond is top
    expect(nextGradeBand(null)?.key).toBe('bronze') // 미측정이면 첫 의미 등급
  })
})

describe('distanceClassFromMeters', () => {
  it('classifies by highest reached milestone', () => {
    expect(distanceClassFromMeters(0).key).toBe('pre')
    expect(distanceClassFromMeters(4999).key).toBe('pre')
    expect(distanceClassFromMeters(5000).key).toBe('5k')
    expect(distanceClassFromMeters(9999.9).key).toBe('5k')
    expect(distanceClassFromMeters(10000).key).toBe('10k')
    expect(distanceClassFromMeters(21097.5).key).toBe('half')
    expect(distanceClassFromMeters(42195).key).toBe('full')
    expect(distanceClassFromMeters(50000).key).toBe('full')
  })
})

describe('nextDistanceClass', () => {
  it('advances class, null at full', () => {
    expect(nextDistanceClass(distanceClassFromMeters(0))?.key ?? null).toBe('5k')
    expect(nextDistanceClass(distanceClassFromMeters(42195))).toBeNull()
  })
})

describe('maxCompletedDistanceM', () => {
  it('takes the longest single run', () => {
    expect(maxCompletedDistanceM([run(daysAgo(1), 3), run(daysAgo(2), 10), run(daysAgo(3), 7)])).toBe(10000)
    expect(maxCompletedDistanceM([])).toBe(0)
  })
})

describe('evaluateGate1', () => {
  it('returns null for a class with no requirement (pre)', () => {
    expect(evaluateGate1('pre', { recentLongestRunM: 5000, weeklyVolumeKm: 20 })).toBeNull()
  })

  it('is not eligible below thresholds and eligible at/above', () => {
    const below = evaluateGate1('10k', { recentLongestRunM: 4000, weeklyVolumeKm: 9 })!
    expect(below.eligible).toBe(false)
    expect(below.percent).toBeLessThan(100)

    const ok = evaluateGate1('10k', { recentLongestRunM: 8000, weeklyVolumeKm: 18 })!
    expect(ok.eligible).toBe(true)
    expect(ok.percent).toBe(100)
  })

  it('flags hard warning only for the full marathon when short', () => {
    expect(evaluateGate1('full', { recentLongestRunM: 10000, weeklyVolumeKm: 20 })!.hardWarn).toBe(true)
    expect(evaluateGate1('half', { recentLongestRunM: 5000, weeklyVolumeKm: 10 })!.hardWarn).toBe(false)
  })
})

describe('gate1InputsFromRuns', () => {
  it('computes recent longest run and weekly volume from windows', () => {
    const runs = [
      run(daysAgo(5), 12), // 최근 60일 최장
      run(daysAgo(3), 5),
      run(daysAgo(10), 5),
      run(daysAgo(20), 5),
      run(daysAgo(90), 30) // 윈도우 밖 → 무시
    ]
    const inputs = gate1InputsFromRuns(runs, today)
    expect(inputs.recentLongestRunM).toBe(12000)
    // 최근 28일 볼륨 = 12+5+5+5 = 27km, 주간 = 27/4 = 6.75 → 소수1자리 반올림 6.8
    expect(inputs.weeklyVolumeKm).toBeCloseTo(6.8, 5)
  })
})

describe('gradeMaintenanceDue', () => {
  it('is due with no measurement or stale measurement, not due when recent', () => {
    expect(gradeMaintenanceDue(null, today)).toBe(true)
    expect(gradeMaintenanceDue(daysAgo(7), today)).toBe(false)
    expect(gradeMaintenanceDue(daysAgo(40), today)).toBe(true)
  })
})

describe('runnerLevelFromGrade', () => {
  it('maps grade bands to coarse runner level', () => {
    expect(runnerLevelFromGrade('iron')).toBe('beginner')
    expect(runnerLevelFromGrade('silver')).toBe('intermediate')
    expect(runnerLevelFromGrade('diamond')).toBe('advanced')
  })
})

describe('resolveRunnerProgress', () => {
  it('returns a pre-class beginner with no data', () => {
    const p = resolveRunnerProgress(profile(), [], today)
    expect(p.vdot).toBeNull()
    expect(p.confidence).toBe('none')
    expect(p.grade).toBeNull()
    expect(p.distanceClass.key).toBe('pre')
    expect(p.nextClass?.key).toBe('5k')
    expect(p.gate1).not.toBeNull()
    expect(p.runnerLevel).toBe('beginner')
    expect(p.runnerLevelSource).toBe('derived')
    expect(p.maintenanceDue).toBe(true)
    expect(p.racePredictions).toEqual([])
    expect(runnerProgressLabel(p)).toBe('입문')
  })

  it('derives grade/class from a PB and a 10k run, grade-sourced runner level', () => {
    const p = resolveRunnerProgress(
      profile({ personalBests: [{ distanceKm: 5, durationSec: 20 * 60 + 30, date: daysAgo(7), source: 'race' }] }),
      [run(daysAgo(10), 10, { type: 'Race', tags: ['self-race'] }), run(daysAgo(3), 6)],
      today
    )
    expect(typeof p.vdot).toBe('number')
    expect(p.confidence).toBe('measured')
    expect(p.grade).not.toBeNull()
    expect(p.distanceClass.key).toBe('10k')
    expect(p.nextClass?.key).toBe('half')
    expect(p.gate1).not.toBeNull()
    expect(p.runnerLevelSource).toBe('grade')
    expect(p.runnerLevel).toBe(runnerLevelFromGrade(p.grade!.key))
    expect(p.racePredictions).toHaveLength(4)
    expect(p.maintenanceDue).toBe(false) // PB/self-race 7~10일 전
    expect(runnerProgressLabel(p)).toContain('·')
  })

  it('lets a manual runnerLevel override win over the grade-derived view', () => {
    const p = resolveRunnerProgress(
      profile({ runnerLevel: 'advanced', personalBests: [{ distanceKm: 5, durationSec: 30 * 60, date: daysAgo(7), source: 'race' }] }),
      [],
      today
    )
    expect(p.runnerLevel).toBe('advanced')
    expect(p.runnerLevelSource).toBe('derived')
  })

  it('uses self-reported placement for a provisional class when no run verifies it', () => {
    const p = resolveRunnerProgress(profile(), [], today, { maxDistanceM: 42195 })
    expect(p.distanceClass.key).toBe('full')
    expect(p.provisional).toBe(true)
    expect(p.nextClass).toBeNull()
  })

  it('is not provisional when an actual run already reaches the self-reported class', () => {
    const p = resolveRunnerProgress(profile(), [run(daysAgo(5), 10)], today, { maxDistanceM: 10000 })
    expect(p.distanceClass.key).toBe('10k')
    expect(p.provisional).toBe(false)
  })
})

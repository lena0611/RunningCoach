import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { CompetitionResult } from '@/entities/competition/model'
import { computeAchievements, computeCumulativeAchievements, summarizeAchievementsForCoach } from './achievements'

function makeResult(overrides: Partial<CompetitionResult> & { id: string }): CompetitionResult {
  return {
    userId: 'u', mode: 'self-pb', targetPb: { distanceM: 5000, elapsedSec: 1500, sourceRunId: 'pb' },
    racedDistanceM: 5005, racedDurationSec: 1480, resultGapSec: -20, outcome: 'win', linkedRunId: 'r',
    racedAt: '2026-06-11T07:00:00.000Z', createdAt: '2026-06-11T07:30:00.000Z', updatedAt: '2026-06-11T07:30:00.000Z',
    ...overrides
  }
}

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-01-01', startAt: null, endAt: null,
    type: 'Easy', durationSec: null, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function rec<T extends { context: string }>(arr: T[], context: 'training' | 'race') {
  return arr.find((r) => r.context === context)
}

describe('computeAchievements', () => {
  it('returns empty record sets for empty input', () => {
    const set = computeAchievements([])
    expect(set).toEqual({
      distancePbs: [], fastestPace: [], longestDistance: [], longestDuration: [], firstMilestones: [],
      cumulative: { longestStreak: null, bestWeeklyVolume: null, bestMonthlyVolume: null }
    })
  })

  it('finds longest distance, longest duration, and fastest average pace per context', () => {
    const runs = [
      makeRun({ id: 'r1', distanceKm: 10, durationSec: 3000, avgPaceSec: 300, date: '2026-01-01' }),
      makeRun({ id: 'r2', distanceKm: 21, durationSec: 7200, avgPaceSec: 343, date: '2026-02-01' }),
      makeRun({ id: 'r3', distanceKm: 5, durationSec: 1300, avgPaceSec: 260, date: '2026-03-01' })
    ]
    const set = computeAchievements(runs)
    expect(rec(set.longestDistance, 'training')).toMatchObject({ runId: 'r2', distanceKm: 21 })
    expect(rec(set.longestDuration, 'training')).toMatchObject({ runId: 'r2', durationSec: 7200 })
    expect(rec(set.fastestPace, 'training')).toMatchObject({ runId: 'r3', avgPaceSec: 260 })
  })

  it('excludes sub-1km runs from the fastest-pace record', () => {
    const runs = [
      makeRun({ id: 'sprint', distanceKm: 0.4, durationSec: 80, avgPaceSec: 200 }),
      makeRun({ id: 'real', distanceKm: 5, durationSec: 1400, avgPaceSec: 280 })
    ]
    expect(rec(computeAchievements(runs).fastestPace, 'training')).toMatchObject({ runId: 'real', avgPaceSec: 280 })
  })

  it('records the earliest run for each first-reached distance milestone', () => {
    const runs = [
      makeRun({ id: 'half-late', distanceKm: 22, durationSec: 8000, date: '2026-05-01' }),
      makeRun({ id: 'ten-first', distanceKm: 12, durationSec: 3600, date: '2026-01-10' }),
      makeRun({ id: 'five-first', distanceKm: 6, durationSec: 1800, date: '2026-01-01' })
    ]
    const ms = computeAchievements(runs).firstMilestones.filter((m) => m.context === 'training')
    expect(ms.find((m) => m.distanceM === 5000)).toMatchObject({ runId: 'five-first' })
    expect(ms.find((m) => m.distanceM === 10000)).toMatchObject({ runId: 'ten-first' })
    expect(ms.find((m) => m.distanceM === 21097.5)).toMatchObject({ runId: 'half-late' })
    expect(ms.find((m) => m.distanceM === 42195)).toBeUndefined() // 풀 미달
  })

  it('separates training and race record ladders (mutually exclusive)', () => {
    const trainingLong = makeRun({ id: 't-long', distanceKm: 30, durationSec: 10000 })
    const raceShort = makeRun({ id: 'race', distanceKm: 10, durationSec: 2400, avgPaceSec: 240, tags: ['self-race'] })
    const set = computeAchievements([trainingLong, raceShort])
    // 레이싱 최장거리는 레이싱 사다리 안에서만(훈련 30km에 오염되지 않음)
    expect(rec(set.longestDistance, 'race')).toMatchObject({ runId: 'race', distanceKm: 10 })
    expect(rec(set.longestDistance, 'training')).toMatchObject({ runId: 't-long', distanceKm: 30 })
    // 더 빠른 레이싱 페이스가 훈련 사다리로 새지 않음
    expect(rec(set.fastestPace, 'training')).toBeUndefined() // 훈련런에 avgPaceSec 없음
    expect(rec(set.fastestPace, 'race')).toMatchObject({ runId: 'race', avgPaceSec: 240 })
  })

  it('breaks record ties by earlier achievedAt', () => {
    const later = makeRun({ id: 'later', distanceKm: 15, durationSec: 4500, date: '2026-02-01' })
    const earlier = makeRun({ id: 'earlier', distanceKm: 15, durationSec: 4500, date: '2026-01-01' })
    expect(rec(computeAchievements([later, earlier]).longestDistance, 'training')!.runId).toBe('earlier')
  })

  it('delegates distance PBs to computeDistancePbs', () => {
    const run = makeRun({ id: 'pb', distanceKm: 10, durationSec: 3000 })
    const set = computeAchievements([run])
    expect(set.distancePbs.map((p) => p.distanceM)).toEqual([5000, 10000])
    expect(set.distancePbs.find((p) => p.distanceM === 5000)).toMatchObject({ context: 'training', elapsedSec: 1500 })
  })
})

describe('summarizeAchievementsForCoach', () => {
  it('produces a compact training summary and null race when no self-race runs', () => {
    const runs = [
      makeRun({ id: 'a', distanceKm: 12, durationSec: 3600, avgPaceSec: 300, date: '2026-01-01' }),
      makeRun({ id: 'b', distanceKm: 21, durationSec: 7200, avgPaceSec: 343, date: '2026-02-01' })
    ]
    const summary = summarizeAchievementsForCoach(runs)
    expect(summary.race).toBeNull()
    expect(summary.training.longestDistanceKm).toBe(21)
    expect(summary.training.longestDurationSec).toBe(7200)
    expect(summary.training.fastestAvgPaceSec).toBe(300)
    expect(summary.training.milestonesM).toContain(5000)
    expect(summary.training.milestonesM).toContain(10000)
    // PB 는 최대 2버킷으로 제한
    expect(summary.training.distancePbs.length).toBeLessThanOrEqual(2)
    expect(summary.training.distancePbs[0]).toMatchObject({ distanceM: 5000 })
  })

  it('includes a race summary once a self-race run exists', () => {
    const runs = [
      makeRun({ id: 't', distanceKm: 10, durationSec: 3000 }),
      makeRun({ id: 'r', distanceKm: 10, durationSec: 2700, avgPaceSec: 270, tags: ['self-race'] })
    ]
    const summary = summarizeAchievementsForCoach(runs)
    expect(summary.race).not.toBeNull()
    expect(summary.race!.fastestAvgPaceSec).toBe(270)
    expect(summary.race!.longestDistanceKm).toBe(10)
  })

  it('summarizes cumulative achievements (streak + best volumes)', () => {
    const runs = [
      makeRun({ id: 'd1', distanceKm: 5, date: '2026-03-02' }), // 월
      makeRun({ id: 'd2', distanceKm: 7, date: '2026-03-03' }), // 화
      makeRun({ id: 'd3', distanceKm: 8, date: '2026-03-04' }) // 수
    ]
    const summary = summarizeAchievementsForCoach(runs)
    expect(summary.cumulative.longestStreakDays).toBe(3)
    expect(summary.cumulative.bestWeeklyVolumeKm).toBe(20) // 같은 주 합
    expect(summary.cumulative.bestMonthlyVolumeKm).toBe(20)
  })

  it('defaults recentRacingResults to empty and summarizes provided competition results newest-first', () => {
    const runs = [makeRun({ id: 'r', distanceKm: 5, durationSec: 1480, tags: ['self-race'] })]
    expect(summarizeAchievementsForCoach(runs).recentRacingResults).toEqual([])

    const results = [
      makeResult({ id: 'older', outcome: 'lose', resultGapSec: 18, racedAt: '2026-05-01T07:00:00.000Z' }),
      makeResult({ id: 'newer', outcome: 'win', resultGapSec: -20, racedAt: '2026-06-11T07:00:00.000Z' })
    ]
    const summary = summarizeAchievementsForCoach(runs, results)
    expect(summary.recentRacingResults).toHaveLength(2)
    expect(summary.recentRacingResults[0]).toMatchObject({ distanceM: 5000, outcome: 'win', isPb: true, racedAt: '2026-06-11', resultGapSec: -20 })
    expect(summary.recentRacingResults[1]).toMatchObject({ outcome: 'lose', isPb: false, racedAt: '2026-05-01' })
  })
})

describe('computeCumulativeAchievements', () => {
  it('returns nulls for no runs', () => {
    expect(computeCumulativeAchievements([])).toEqual({ longestStreak: null, bestWeeklyVolume: null, bestMonthlyVolume: null })
  })

  it('finds the longest consecutive-day streak across gaps and dedupes same-day runs', () => {
    const runs = [
      makeRun({ id: 'a', distanceKm: 5, date: '2026-01-01' }),
      makeRun({ id: 'b', distanceKm: 5, date: '2026-01-02' }),
      makeRun({ id: 'b2', distanceKm: 3, date: '2026-01-02' }), // 같은 날 두 번 — 하루로
      makeRun({ id: 'c', distanceKm: 5, date: '2026-01-03' }),
      makeRun({ id: 'gap', distanceKm: 5, date: '2026-01-05' }), // 04 빠짐 → 끊김
      makeRun({ id: 'e', distanceKm: 5, date: '2026-01-06' })
    ]
    const { longestStreak } = computeCumulativeAchievements(runs)
    expect(longestStreak).toEqual({ days: 3, start: '2026-01-01', end: '2026-01-03' })
  })

  it('counts a single run as a 1-day streak', () => {
    expect(computeCumulativeAchievements([makeRun({ id: 's', distanceKm: 5, date: '2026-02-10' })]).longestStreak).toEqual({
      days: 1, start: '2026-02-10', end: '2026-02-10'
    })
  })

  it('picks the best weekly (Mon-start) and monthly volume; ties prefer earlier period', () => {
    const runs = [
      // 2026-01-05(월)~01-11(일) 주: 10+12 = 22
      makeRun({ id: 'w1a', distanceKm: 10, date: '2026-01-05' }),
      makeRun({ id: 'w1b', distanceKm: 12, date: '2026-01-08' }),
      // 2026-01-12 주: 9
      makeRun({ id: 'w2', distanceKm: 9, date: '2026-01-13' }),
      // 2월: 한 주에 8
      makeRun({ id: 'feb', distanceKm: 8, date: '2026-02-02' })
    ]
    const { bestWeeklyVolume, bestMonthlyVolume } = computeCumulativeAchievements(runs)
    expect(bestWeeklyVolume).toMatchObject({ periodStart: '2026-01-05', distanceKm: 22, runCount: 2 })
    expect(bestMonthlyVolume).toMatchObject({ periodStart: '2026-01-01', distanceKm: 31, runCount: 3 })
  })

  it('integrates across contexts (training + race counted together)', () => {
    const runs = [
      makeRun({ id: 't', distanceKm: 10, date: '2026-04-06' }),
      makeRun({ id: 'r', distanceKm: 10, date: '2026-04-07', tags: ['self-race'] })
    ]
    const { longestStreak, bestWeeklyVolume } = computeCumulativeAchievements(runs)
    expect(longestStreak!.days).toBe(2) // 레이싱·훈련 통합 연속
    expect(bestWeeklyVolume!.distanceKm).toBe(20)
  })
})

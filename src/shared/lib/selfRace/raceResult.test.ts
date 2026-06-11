import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { CompetitionTargetPb, PendingSelfRace } from '@/entities/competition/model'
import {
  addSelfRaceTag,
  deriveResultFields,
  isMeaningfulFinish,
  isPendingExpired,
  matchScore,
  outcomeFromLeadState,
  pickBestMatch
} from './raceResult'

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-06-11', startAt: null, endAt: null,
    type: 'Easy', durationSec: null, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides
  }
}

const target: CompetitionTargetPb = { distanceM: 5000, elapsedSec: 1500, sourceRunId: 'pb-run' }

function makePending(overrides: Partial<PendingSelfRace> = {}): PendingSelfRace {
  return {
    id: 'p1',
    racedAt: '2026-06-11T07:00:00.000Z',
    racedDistanceM: 5000,
    racedDurationSec: 1480,
    targetPb: target,
    outcome: 'win',
    resultGapSec: -20,
    createdAt: '2026-06-11T07:30:00.000Z',
    ...overrides
  }
}

describe('outcomeFromLeadState', () => {
  it('maps leadState to outcome', () => {
    expect(outcomeFromLeadState('ahead')).toBe('win')
    expect(outcomeFromLeadState('behind')).toBe('lose')
    expect(outcomeFromLeadState('even')).toBe('tie')
  })
})

describe('deriveResultFields', () => {
  it('derives win/gap from finalGap when target present (negative gap = faster)', () => {
    const fields = deriveResultFields({
      racedAt: '2026-06-11T07:00:00.000Z',
      racedDistanceM: 5003.4,
      racedDurationSec: 1480.7,
      targetPb: target,
      finalGap: { timeGapSec: -20.4, leadState: 'ahead' }
    })
    expect(fields).toMatchObject({ racedDistanceM: 5003, racedDurationSec: 1481, outcome: 'win', resultGapSec: -20 })
    expect(fields.targetPb).toEqual(target)
  })

  it('leaves outcome/gap null for a free time-trial (no target)', () => {
    const fields = deriveResultFields({
      racedAt: '2026-06-11T07:00:00.000Z',
      racedDistanceM: 4200,
      racedDurationSec: 1300,
      targetPb: null,
      finalGap: null
    })
    expect(fields.outcome).toBeNull()
    expect(fields.resultGapSec).toBeNull()
    expect(fields.targetPb).toBeNull()
  })
})

describe('addSelfRaceTag', () => {
  it('adds the tag idempotently and preserves existing tags', () => {
    expect(addSelfRaceTag(['healthkit', 'type:auto'])).toEqual(['healthkit', 'type:auto', 'self-race'])
    expect(addSelfRaceTag(['self-race', 'healthkit'])).toEqual(['self-race', 'healthkit'])
    expect(addSelfRaceTag(null)).toEqual(['self-race'])
  })
})

describe('matchScore / pickBestMatch', () => {
  it('matches by startAt proximity when close in time and distance', () => {
    const run = makeRun({ id: 'r', distanceKm: 5.02, durationSec: 1485, startAt: '2026-06-11T07:01:00.000Z' })
    expect(matchScore(run, makePending())).toBe(60) // 1분 차
  })

  it('rejects when start time is too far apart', () => {
    const run = makeRun({ id: 'r', distanceKm: 5, durationSec: 1480, startAt: '2026-06-11T09:00:00.000Z' })
    expect(matchScore(run, makePending())).toBe(Infinity)
  })

  it('rejects when distance is out of tolerance', () => {
    const run = makeRun({ id: 'r', distanceKm: 8, durationSec: 1480, startAt: '2026-06-11T07:00:30.000Z' })
    expect(matchScore(run, makePending())).toBe(Infinity)
  })

  it('rejects when duration is out of tolerance', () => {
    const run = makeRun({ id: 'r', distanceKm: 5, durationSec: 2000, startAt: '2026-06-11T07:00:30.000Z' })
    expect(matchScore(run, makePending())).toBe(Infinity)
  })

  it('falls back to same-day match when startAt is missing', () => {
    const run = makeRun({ id: 'r', distanceKm: 5.05, durationSec: 1490, startAt: null, date: '2026-06-11' })
    const score = matchScore(run, makePending())
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(900) // 폴백은 startAt 매칭보다 뒤로 밀린다
  })

  it('picks the closest run when several are within tolerance', () => {
    const near = makeRun({ id: 'near', distanceKm: 5.0, durationSec: 1480, startAt: '2026-06-11T07:00:30.000Z' })
    const far = makeRun({ id: 'far', distanceKm: 5.0, durationSec: 1480, startAt: '2026-06-11T07:05:00.000Z' })
    const noise = makeRun({ id: 'noise', distanceKm: 12, durationSec: 4000, startAt: '2026-06-11T07:00:10.000Z' })
    expect(pickBestMatch([far, noise, near], makePending())?.id).toBe('near')
  })

  it('returns null when nothing matches', () => {
    const run = makeRun({ id: 'r', distanceKm: 20, durationSec: 7000, startAt: '2026-06-12T07:00:00.000Z' })
    expect(pickBestMatch([run], makePending())).toBeNull()
  })
})

describe('isPendingExpired', () => {
  it('expires after the max age', () => {
    const p = makePending({ createdAt: '2026-06-08T07:00:00.000Z' })
    const now = Date.parse('2026-06-11T08:00:00.000Z')
    expect(isPendingExpired(p, now, 3 * 86400000)).toBe(true)
    expect(isPendingExpired(p, Date.parse('2026-06-09T07:00:00.000Z'), 3 * 86400000)).toBe(false)
  })
})

describe('isMeaningfulFinish', () => {
  it('rejects zero / non-finite distance', () => {
    expect(isMeaningfulFinish(0)).toBe(false)
    expect(isMeaningfulFinish(NaN)).toBe(false)
    expect(isMeaningfulFinish(1200)).toBe(true)
  })
})

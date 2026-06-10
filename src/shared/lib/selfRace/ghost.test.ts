import { describe, expect, it } from 'vitest'
import type { Lap, RunLog, RunMetricSample } from '@/entities/run/model'
import {
  buildGhostCurve,
  computeGap,
  detectReversal,
  distanceAtTime,
  formatAnnouncement,
  timeAtDistance,
  type GapState
} from './ghost'

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-01-01', startAt: null, endAt: null,
    type: 'Race', durationSec: null, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: ['self-race'], source: 'healthkit',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function samples(pairs: Array<[number, number | null]>): RunMetricSample[] {
  return pairs.map(([offsetSec, paceSec]) => ({ offsetSec, heartRate: null, paceSec, cadence: null }))
}

function evenSamples(): RunMetricSample[] {
  // 5:00/km(=300s/km) 등속, 10km, 3000s
  return samples([0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000].map((t) => [t, 300]))
}

function kmLaps(n: number, paceSec = 300): Lap[] {
  return Array.from({ length: n }, (_, i) => ({ index: i, distanceKm: 1, paceSec, avgHeartRate: null, cadence: null }))
}

describe('buildGhostCurve', () => {
  it('builds from metricSamples and anchors distance to total (even pace ⇒ linear)', () => {
    const curve = buildGhostCurve(makeRun({ id: 'ms', distanceKm: 10, durationSec: 3000, metricSamples: evenSamples() }))
    expect(curve.source).toBe('metricSamples')
    expect(timeAtDistance(curve, 5000)).toBeCloseTo(1500, 1)
    expect(timeAtDistance(curve, 10000)).toBeCloseTo(3000, 1)
  })

  it('falls back to laps when metricSamples are unusable', () => {
    const curve = buildGhostCurve(makeRun({ id: 'lap', distanceKm: 10, durationSec: 3000, laps: kmLaps(10) }))
    expect(curve.source).toBe('laps')
    expect(timeAtDistance(curve, 5000)).toBeCloseTo(1500, 1)
  })

  it('falls back to even pacing when neither samples nor laps are usable', () => {
    const curve = buildGhostCurve(makeRun({ id: 'even', distanceKm: 10, durationSec: 3000 }))
    expect(curve.source).toBe('even')
    expect(curve.points).toHaveLength(2)
    expect(timeAtDistance(curve, 5000)).toBeCloseTo(1500, 1)
  })

  it('forces even pacing when opts.mode = "even" even if samples exist', () => {
    const curve = buildGhostCurve(makeRun({ id: 'force', distanceKm: 10, durationSec: 3000, metricSamples: evenSamples() }), { mode: 'even' })
    expect(curve.source).toBe('even')
  })

  it('prefers metricSamples over laps when both exist', () => {
    const curve = buildGhostCurve(makeRun({ id: 'both', distanceKm: 10, durationSec: 3000, metricSamples: evenSamples(), laps: kmLaps(10) }))
    expect(curve.source).toBe('metricSamples')
  })
})

describe('curve queries (boundary)', () => {
  const curve = buildGhostCurve(makeRun({ id: 'q', distanceKm: 10, durationSec: 3000 }))

  it('returns 0 at/under the start and clamps beyond the end', () => {
    expect(timeAtDistance(curve, 0)).toBe(0)
    expect(timeAtDistance(curve, -100)).toBe(0)
    expect(timeAtDistance(curve, 99999)).toBeCloseTo(3000, 1) // 클램프
    expect(distanceAtTime(curve, 0)).toBe(0)
    expect(distanceAtTime(curve, 99999)).toBeCloseTo(10000, 1)
  })
})

describe('computeGap', () => {
  const curve = buildGhostCurve(makeRun({ id: 'g', distanceKm: 10, durationSec: 3000 })) // 등속, 5km=1500s

  it('reports a negative timeGap (ahead) when reaching the distance faster', () => {
    const gap = computeGap(curve, { cumulativeDistanceM: 5000, elapsedSec: 1400 })
    expect(gap.timeGapSec).toBeCloseTo(-100, 1)
    expect(gap.distanceGapM).toBeGreaterThan(0)
    expect(gap.leadState).toBe('ahead')
  })

  it('reports a positive timeGap (behind) when slower', () => {
    const gap = computeGap(curve, { cumulativeDistanceM: 5000, elapsedSec: 1600 })
    expect(gap.timeGapSec).toBeCloseTo(100, 1)
    expect(gap.leadState).toBe('behind')
  })

  it('reports even within the epsilon', () => {
    expect(computeGap(curve, { cumulativeDistanceM: 5000, elapsedSec: 1500 }).leadState).toBe('even')
  })
})

function gap(leadState: GapState['leadState'], timeGapSec = 0): GapState {
  return { timeGapSec, distanceGapM: -timeGapSec, leadState }
}

describe('detectReversal (one-shot)', () => {
  it('detects overtake when going from behind/even to ahead', () => {
    expect(detectReversal(gap('behind', 50), gap('ahead', -50))).toBe('overtake')
    expect(detectReversal(gap('even'), gap('ahead', -50))).toBe('overtake')
  })

  it('detects overtaken when going from ahead to behind', () => {
    expect(detectReversal(gap('ahead', -50), gap('behind', 50))).toBe('overtaken')
  })

  it('returns null while the lead state is unchanged (no repeat firing)', () => {
    expect(detectReversal(gap('ahead', -50), gap('ahead', -30))).toBeNull()
    expect(detectReversal(gap('behind', 50), gap('behind', 80))).toBeNull()
  })

  it('returns null on the first tick (no prev)', () => {
    expect(detectReversal(null, gap('ahead', -10))).toBeNull()
  })
})

describe('formatAnnouncement', () => {
  it('produces a stable dedupeKey for the same km on lap re-entry', () => {
    const a = formatAnnouncement('lap', { gap: gap('ahead', -12), distanceM: 5000 })
    const b = formatAnnouncement('lap', { gap: gap('ahead', -8), distanceM: 5012 })
    expect(a.dedupeKey).toBe('lap:5')
    expect(b.dedupeKey).toBe('lap:5') // 같은 5km 재진입 → 같은 키
    expect(a.text).toContain('5km')
    expect(a.text).toContain('앞서')
  })

  it('dedupes periodic by step (not km) so time-based intervals within one km stay distinct', () => {
    // 시간 주기(예: 1분마다): 같은 km 안에 여러 멘트가 생긴다. step 으로 dedupe 해야
    // 2번째 발화부터 무음 드롭되지 않는다(#229 백그라운드 무음 회귀 방지).
    const m1 = formatAnnouncement('periodic', { gap: gap('behind', 20), distanceM: 120, periodicStep: 1 })
    const m2 = formatAnnouncement('periodic', { gap: gap('behind', 30), distanceM: 240, periodicStep: 2 })
    expect(m1.dedupeKey).toBe('periodic:1')
    expect(m2.dedupeKey).toBe('periodic:2')
    expect(m1.dedupeKey).not.toBe(m2.dedupeKey)
  })

  it('falls back to km bucket when periodicStep is absent', () => {
    expect(formatAnnouncement('periodic', { gap: gap('behind', 20), distanceM: 3000 }).dedupeKey).toBe('periodic:3')
  })

  it('orders priority finish > reversal > lap > periodic', () => {
    const periodic = formatAnnouncement('periodic', { gap: gap('behind', 20), distanceM: 3000 })
    const lap = formatAnnouncement('lap', { gap: gap('behind', 20), distanceM: 3000 })
    const reversal = formatAnnouncement('reversal', { gap: gap('ahead', -5), reversal: 'overtake', distanceM: 3000 })
    const finish = formatAnnouncement('finish', { gap: gap('ahead', -5) })
    expect(periodic.priority).toBeLessThan(lap.priority)
    expect(lap.priority).toBeLessThan(reversal.priority)
    expect(reversal.priority).toBeLessThan(finish.priority)
  })

  it('formats reversal text and finish with minute:second gaps', () => {
    expect(formatAnnouncement('reversal', { gap: gap('ahead', -5), reversal: 'overtake' }).text).toContain('제쳤')
    expect(formatAnnouncement('reversal', { gap: gap('behind', 5), reversal: 'overtaken' }).text).toContain('따라잡')
    expect(formatAnnouncement('finish', { gap: gap('ahead', -75) }).text).toContain('1분 15초')
    expect(formatAnnouncement('periodic', { gap: gap('even'), distanceM: 2000 }).text).toContain('나란히')
  })
})

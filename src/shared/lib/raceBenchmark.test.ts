import { describe, expect, it } from 'vitest'
import type { RaceProjection } from './performanceProjection'
import {
  compareProjectionToRaceBenchmarks,
  getRaceBenchmarkCatalogSummary,
  isDistanceMatch,
  type RaceBenchmarkSnapshot
} from './raceBenchmark'

const projection: RaceProjection = {
  targetDistanceKm: 10,
  targetDurationSec: 3600,
  current: {
    runId: 'run-1',
    date: '2026-06-20',
    type: 'Tempo',
    distanceKm: 6,
    durationSec: 2400,
    projectedSec: 3720,
    confidence: 'medium'
  },
  previous: null,
  deltaSec: null,
  readinessScore: 72,
  readinessLevel: '보통',
  readinessSummary: '',
  factors: [],
  projectedRangeSec: [3600, 3900]
}

const readySnapshot: RaceBenchmarkSnapshot = {
  id: 'sample-10k',
  eventName: 'Sample 10K',
  region: 'domestic',
  country: 'KR',
  city: 'Seoul',
  distanceKm: 10,
  year: 2026,
  sourceName: 'sample',
  sourceUrl: 'https://example.com',
  retrievedAt: '2026-06-29',
  publishedAt: '2026 results',
  freshnessStatus: 'latest-confirmed',
  resultStatus: 'final',
  distributionStatus: 'ready',
  percentileCutsSec: [
    { percentile: 10, durationSec: 3300 },
    { percentile: 30, durationSec: 3900 },
    { percentile: 50, durationSec: 4500 }
  ],
  note: ''
}

describe('raceBenchmark', () => {
  it('tracks domestic and international recent source coverage', () => {
    const summary = getRaceBenchmarkCatalogSummary(10)

    expect(summary.domestic).toBeGreaterThanOrEqual(4)
    expect(summary.international).toBeGreaterThanOrEqual(5)
    expect(summary.latestConfirmed).toBe(summary.total)
    expect(summary.matchingDistance).toBeGreaterThanOrEqual(1)
  })

  it('does not compare when distribution cuts are still pending', () => {
    const [comparison] = compareProjectionToRaceBenchmarks(projection, [
      { ...readySnapshot, distributionStatus: 'needs-permission', percentileCutsSec: [] }
    ])

    expect(comparison.status).toBe('pending-distribution')
    expect(comparison.percentile).toBeNull()
  })

  it('interpolates percentile from non-identifying cut buckets when ready', () => {
    const [comparison] = compareProjectionToRaceBenchmarks(projection, [readySnapshot])

    expect(comparison.status).toBe('ready')
    expect(comparison.percentile).toBe(24)
    expect(comparison.nextCut?.percentile).toBe(10)
    expect(comparison.nextCutGapSec).toBe(420)
  })

  it('uses a small tolerance for distance matching', () => {
    expect(isDistanceMatch(42.195, 42.2)).toBe(true)
    expect(isDistanceMatch(10, 42.195)).toBe(false)
  })
})

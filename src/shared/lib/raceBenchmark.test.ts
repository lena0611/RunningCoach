import { describe, expect, it } from 'vitest'
import type { RaceProjection } from './performanceProjection'
import {
  compareProjectionToRaceBenchmarks,
  getRaceBenchmarkCatalogSummary,
  getRaceBenchmarkDistanceCategory,
  isDistanceMatch,
  raceBenchmarkDistanceCategories,
  raceBenchmarkSnapshots,
  splitRaceBenchmarkComparisons,
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
    expect(summary.matchingDistributionReady).toBeGreaterThanOrEqual(1)
    expect(summary.matchingPendingDistribution).toBe(summary.matchingDistance - summary.matchingDistributionReady)
  })

  it('covers 10K, half, and marathon sources across domestic and international catalogs', () => {
    const summary = getRaceBenchmarkCatalogSummary(10)

    raceBenchmarkDistanceCategories.forEach((category) => {
      const coverage = summary.distanceCoverage[category.id]
      expect(coverage.total, category.label).toBeGreaterThanOrEqual(2)
      expect(coverage.domestic, category.label).toBeGreaterThanOrEqual(1)
      expect(coverage.international, category.label).toBeGreaterThanOrEqual(1)
      expect(coverage.latestConfirmed, category.label).toBe(coverage.total)
    })
  })

  it('has ready non-identifying percentile cuts for 10K, half, and marathon calculations', () => {
    raceBenchmarkDistanceCategories.forEach((category) => {
      const ready = raceBenchmarkSnapshots.filter((snapshot) => (
        snapshot.distributionStatus === 'ready' &&
        isDistanceMatch(snapshot.distanceKm, category.distanceKm)
      ))

      expect(ready.length, category.label).toBeGreaterThanOrEqual(1)
      ready.forEach((snapshot) => {
        expect(snapshot.percentileCutsSec.length, snapshot.eventName).toBeGreaterThanOrEqual(7)
        expect(snapshot.distributionBasis?.sampleSize, snapshot.eventName).toBeGreaterThan(1000)
      })
    })
  })

  it('includes ready Berlin official API aggregate cuts for half and marathon', () => {
    const readyById = new Map(raceBenchmarkSnapshots.map((snapshot) => [snapshot.id, snapshot]))

    expect(readyById.get('berlin-half-2025-half')?.distributionStatus).toBe('ready')
    expect(readyById.get('berlin-half-2025-half')?.distributionBasis?.sampleSize).toBe(34731)
    expect(readyById.get('berlin-marathon-2025-marathon')?.distributionStatus).toBe('ready')
    expect(readyById.get('berlin-marathon-2025-marathon')?.distributionBasis?.sampleSize).toBe(48351)
  })

  it('does not compare when distribution cuts are still pending', () => {
    const [comparison] = compareProjectionToRaceBenchmarks(projection, [
      { ...readySnapshot, distributionStatus: 'needs-permission', percentileCutsSec: [] }
    ])

    expect(comparison.status).toBe('pending-distribution')
    expect(comparison.percentile).toBeNull()
  })

  it('interpolates percentile and projected range from non-identifying cut buckets when ready', () => {
    const [comparison] = compareProjectionToRaceBenchmarks(projection, [readySnapshot])

    expect(comparison.status).toBe('ready')
    expect(comparison.percentile).toBe(24)
    expect(comparison.percentileRange).toEqual([20, 30])
    expect(comparison.nextCut?.percentile).toBe(10)
    expect(comparison.nextCutGapSec).toBe(420)
  })

  it('uses a small tolerance for distance matching', () => {
    expect(isDistanceMatch(42.195, 42.2)).toBe(true)
    expect(isDistanceMatch(21.0975, 21.1)).toBe(true)
    expect(isDistanceMatch(10, 42.195)).toBe(false)
    expect(getRaceBenchmarkDistanceCategory(10)).toBe('10k')
    expect(getRaceBenchmarkDistanceCategory(21.0975)).toBe('half')
    expect(getRaceBenchmarkDistanceCategory(42.195)).toBe('marathon')
  })

  it('separates current-distance status from other-distance catalog entries', () => {
    const comparisons = compareProjectionToRaceBenchmarks(projection, [
      readySnapshot,
      { ...readySnapshot, id: 'pending-10k', distributionStatus: 'needs-permission', percentileCutsSec: [] },
      { ...readySnapshot, id: 'sample-marathon', distanceKm: 42.195, eventName: 'Sample Marathon' }
    ])
    const groups = splitRaceBenchmarkComparisons(comparisons)

    expect(groups.currentDistance).toHaveLength(2)
    expect(groups.currentDistance.some((item) => item.status === 'distance-mismatch')).toBe(false)
    expect(groups.otherDistances).toHaveLength(1)
    expect(groups.otherDistances[0].snapshot.eventName).toBe('Sample Marathon')
  })
})

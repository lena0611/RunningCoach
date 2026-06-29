import { describe, expect, it } from 'vitest'
import type { RaceProjection } from './performanceProjection'
import {
  compareProjectionToRaceBenchmarks,
  formatRaceBenchmarkPercentilePoint,
  formatRaceBenchmarkPercentileRange,
  formatRaceBenchmarkSegmentLabel,
  getRaceBenchmarkEvidenceLevel,
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

  it('includes ready domestic MyResult aggregate cuts (denser tail + gender) without raw participant rows', () => {
    const readyById = new Map(raceBenchmarkSnapshots.map((snapshot) => [snapshot.id, snapshot]))
    // 표본 재수집(무작위 표본 ~3,000/코스)으로 산출한 비식별 컷. sampleSize는 컷 산출에 쓴 표본 수.
    const expected = [
      ['jtbc-seoul-marathon-2025-10k', 3081],
      ['jtbc-seoul-marathon-2025-marathon', 3073],
      ['chuncheon-marathon-2025-10k', 3070],
      ['chuncheon-marathon-2025-marathon', 3000]
    ] as const
    const denserPercentiles = [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]

    expected.forEach(([id, sampleSize]) => {
      const snapshot = readyById.get(id)

      expect(snapshot?.distributionStatus, id).toBe('ready')
      expect(snapshot?.distributionBasis?.label, id).toBe('MyResult public event/player API')
      expect(snapshot?.distributionBasis?.sampleSize, id).toBe(sampleSize)
      // 클램핑 해소를 위한 느린쪽 꼬리(p95/p99) + 빠른쪽(p2.5) 포함.
      expect(snapshot?.percentileCutsSec.map((cut) => cut.percentile), id).toEqual(denserPercentiles)
      // 컷은 시간 오름차순(퍼센타일 오름차순)이라야 보간이 단조.
      const secs = snapshot?.percentileCutsSec.map((cut) => cut.durationSec) ?? []
      expect([...secs].sort((a, b) => a - b), id).toEqual(secs)
      expect(snapshot?.note, id).toContain('개별 기록 row는 저장하지 않는다')

      // 성별 분포: 남/여 모두 같은 컷 세트 + 충분한 표본. 같은 거리에서 남자 그룹이 더 빠르다(중앙값).
      const male = snapshot?.genderDistribution?.male
      const female = snapshot?.genderDistribution?.female
      expect(male?.cuts.map((cut) => cut.percentile), id).toEqual(denserPercentiles)
      expect(female?.cuts.map((cut) => cut.percentile), id).toEqual(denserPercentiles)
      expect(male?.sampleSize, id).toBeGreaterThanOrEqual(200)
      expect(female?.sampleSize, id).toBeGreaterThanOrEqual(200)
      const maleP50 = male?.cuts.find((cut) => cut.percentile === 50)?.durationSec ?? 0
      const femaleP50 = female?.cuts.find((cut) => cut.percentile === 50)?.durationSec ?? 0
      expect(maleP50, id).toBeLessThan(femaleP50)
    })
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

  it('labels benchmark evidence conservatively when only one ready race exists', () => {
    expect(getRaceBenchmarkEvidenceLevel(0)).toBe('none')
    expect(getRaceBenchmarkEvidenceLevel(1)).toBe('single-reference')
    expect(getRaceBenchmarkEvidenceLevel(2)).toBe('multi-benchmark')
  })

  it('formats percentile copy as a top-percent position where a smaller number is faster', () => {
    expect(formatRaceBenchmarkPercentilePoint(76)).toBe('상위 76%')
    expect(formatRaceBenchmarkPercentileRange([70, 80])).toBe('상위 70~80%')
    expect(formatRaceBenchmarkPercentileRange([75, 75])).toBe('상위 75%')
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

  it('does not clamp the slow tail: slower than the slowest cut is labeled "상위 N%+" not a flat percentile', () => {
    const tailSnapshot: RaceBenchmarkSnapshot = {
      ...readySnapshot,
      id: 'tail-10k',
      percentileCutsSec: [
        { percentile: 1, durationSec: 2400 },
        { percentile: 50, durationSec: 3460 },
        { percentile: 90, durationSec: 4380 }
      ]
    }
    const slowProjection = {
      ...projection,
      current: { ...projection.current, projectedSec: 5400 },
      projectedRangeSec: [5100, 5700] as [number, number]
    }
    const [comparison] = compareProjectionToRaceBenchmarks(slowProjection, [tailSnapshot])

    expect(comparison.status).toBe('ready')
    expect(comparison.percentile).toBe(90)
    expect(comparison.percentileBound).toBe('beyond-slow')
    expect(formatRaceBenchmarkPercentilePoint(comparison.percentile!, comparison.percentileBound!)).toBe('상위 90%+')
  })

  it('labels faster than the fastest cut as "상위 N% 이내" (beyond-fast), not clamped silently', () => {
    const tailSnapshot: RaceBenchmarkSnapshot = {
      ...readySnapshot,
      id: 'fast-10k',
      percentileCutsSec: [
        { percentile: 1, durationSec: 2400 },
        { percentile: 50, durationSec: 3460 },
        { percentile: 90, durationSec: 4380 }
      ]
    }
    const fastProjection = {
      ...projection,
      current: { ...projection.current, projectedSec: 2000 },
      projectedRangeSec: [1900, 2100] as [number, number]
    }
    const [comparison] = compareProjectionToRaceBenchmarks(fastProjection, [tailSnapshot])

    expect(comparison.percentile).toBe(1)
    expect(comparison.percentileBound).toBe('beyond-fast')
    expect(formatRaceBenchmarkPercentilePoint(comparison.percentile!, comparison.percentileBound!)).toBe('상위 1% 이내')
  })

  it('formats percentile copy with honest tail bounds', () => {
    expect(formatRaceBenchmarkPercentilePoint(50)).toBe('상위 50%')
    expect(formatRaceBenchmarkPercentilePoint(90, 'beyond-slow')).toBe('상위 90%+')
    expect(formatRaceBenchmarkPercentilePoint(1, 'beyond-fast')).toBe('상위 1% 이내')
    expect(formatRaceBenchmarkPercentileRange([75, 90], ['exact', 'beyond-slow'])).toBe('상위 75~90%+')
    expect(formatRaceBenchmarkPercentileRange([20, 30])).toBe('상위 20~30%')
    // 동률이라도 한쪽 끝이 꼬리 너머면 정직 표시를 유지(클램핑 회귀 방지).
    expect(formatRaceBenchmarkPercentileRange([90, 90], ['exact', 'beyond-slow'])).toBe('상위 90%+')
    expect(formatRaceBenchmarkPercentileRange([1, 1], ['beyond-fast', 'exact'])).toBe('상위 1% 이내')
  })

  it('exposes overall + gender segments when a snapshot carries gender distributions', () => {
    const genderSnapshot: RaceBenchmarkSnapshot = {
      ...readySnapshot,
      id: 'gender-10k',
      distributionBasis: { label: 'sample', sampleSize: 8000, method: 'sample' },
      percentileCutsSec: [
        { percentile: 10, durationSec: 3300 },
        { percentile: 50, durationSec: 4000 },
        { percentile: 90, durationSec: 4800 }
      ],
      genderDistribution: {
        male: {
          sampleSize: 5000,
          cuts: [
            { percentile: 10, durationSec: 3100 },
            { percentile: 50, durationSec: 3800 },
            { percentile: 90, durationSec: 4600 }
          ]
        },
        female: {
          sampleSize: 3000,
          cuts: [
            { percentile: 10, durationSec: 3500 },
            { percentile: 50, durationSec: 4200 },
            { percentile: 90, durationSec: 5000 }
          ]
        }
      }
    }
    const [comparison] = compareProjectionToRaceBenchmarks(projection, [genderSnapshot])

    expect(comparison.status).toBe('ready')
    expect(comparison.segments.map((segment) => segment.segment)).toEqual(['overall', 'male', 'female'])
    // overall 기준값은 segments[0]과 동일해야 한다(하위호환).
    expect(comparison.percentile).toBe(comparison.segments[0].percentile)
    const male = comparison.segments.find((segment) => segment.segment === 'male')
    const female = comparison.segments.find((segment) => segment.segment === 'female')
    expect(male?.sampleSize).toBe(5000)
    expect(female?.sampleSize).toBe(3000)
    // 같은 기록이면 남자 그룹이 더 빨라 "상위 %"가 더 큼(뒤쪽), 여자 그룹은 더 작음(앞쪽).
    expect(male!.percentile).toBeGreaterThan(female!.percentile)
  })

  it('labels segment keys in Korean', () => {
    expect(formatRaceBenchmarkSegmentLabel('overall')).toBe('전체')
    expect(formatRaceBenchmarkSegmentLabel('male')).toBe('남자')
    expect(formatRaceBenchmarkSegmentLabel('female')).toBe('여자')
  })
})

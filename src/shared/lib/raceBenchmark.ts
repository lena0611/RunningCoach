import type { RaceProjection } from './performanceProjection'

export type RaceBenchmarkRegion = 'domestic' | 'international'
export type RaceBenchmarkDistanceCategory = '10k' | 'half' | 'marathon'
export type RaceBenchmarkFreshnessStatus =
  | 'latest-confirmed'
  | 'latest-unverified'
  | 'recent'
  | 'historical'
  | 'stale'
  | 'unavailable'
export type RaceBenchmarkResultStatus = 'provisional' | 'final' | 'corrected' | 'unknown'
export type RaceBenchmarkDistributionStatus = 'ready' | 'source-confirmed' | 'needs-permission' | 'unavailable'

export type RaceBenchmarkCut = {
  /** 완주자 중 빠른 쪽 누적 비율. 예: 10 = 상위 10% 컷. */
  percentile: number
  durationSec: number
}

export type RaceBenchmarkDistributionBasis = {
  label: string
  sampleSize: number
  method: string
}

export type RaceBenchmarkSnapshot = {
  id: string
  eventName: string
  region: RaceBenchmarkRegion
  country: string
  city: string
  distanceKm: number
  year: number
  sourceName: string
  sourceUrl: string
  retrievedAt: string
  publishedAt: string
  freshnessStatus: RaceBenchmarkFreshnessStatus
  resultStatus: RaceBenchmarkResultStatus
  distributionStatus: RaceBenchmarkDistributionStatus
  distributionBasis?: RaceBenchmarkDistributionBasis
  percentileCutsSec: RaceBenchmarkCut[]
  note: string
}

export type RaceBenchmarkCatalogSummary = {
  total: number
  domestic: number
  international: number
  latestConfirmed: number
  distributionReady: number
  matchingDistance: number
  matchingDistributionReady: number
  matchingPendingDistribution: number
  pendingDistribution: number
  distanceCoverage: Record<RaceBenchmarkDistanceCategory, RaceBenchmarkDistanceCoverage>
}

export type RaceBenchmarkDistanceCoverage = {
  total: number
  domestic: number
  international: number
  latestConfirmed: number
}

export type RaceBenchmarkComparison = {
  snapshot: RaceBenchmarkSnapshot
  percentile: number | null
  percentileRange: [number, number] | null
  nextCut: RaceBenchmarkCut | null
  nextCutGapSec: number | null
  status: 'ready' | 'pending-distribution' | 'distance-mismatch'
}

export type RaceBenchmarkComparisonGroups = {
  currentDistance: RaceBenchmarkComparison[]
  otherDistances: RaceBenchmarkComparison[]
}

const retrievedAt = '2026-06-29'

export const raceBenchmarkDistanceCategories: Array<{ id: RaceBenchmarkDistanceCategory; label: string; distanceKm: number }> = [
  { id: '10k', label: '10K', distanceKm: 10 },
  { id: 'half', label: '하프', distanceKm: 21.0975 },
  { id: 'marathon', label: '풀', distanceKm: 42.195 }
]

/**
 * #531 recent-source catalog. This is intentionally metadata + non-identifying
 * percentile buckets only. Do not add participant names, bib numbers, birth dates,
 * or scraped raw rows here.
 */
export const raceBenchmarkSnapshots: RaceBenchmarkSnapshot[] = [
  {
    id: 'seoul-marathon-2026-10k',
    eventName: '서울마라톤 10K',
    region: 'domestic',
    country: 'KR',
    city: 'Seoul',
    distanceKm: 10,
    year: 2026,
    sourceName: 'Runarchive 기록조회',
    sourceUrl: 'https://record.runarchive.com/',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '최근 기록 조회 경로는 확인됐지만, 제품 내 퍼센타일 컷 저장은 비식별 집계 허용 범위 확인 뒤 활성화한다.'
  },
  {
    id: 'seoul-marathon-2026-marathon',
    eventName: '서울마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Seoul',
    distanceKm: 42.195,
    year: 2026,
    sourceName: 'Runarchive 기록조회',
    sourceUrl: 'https://record.runarchive.com/',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '국내 대표 대회 최신 결과 후보. 원본 참가자 기록 저장 없이 분포 컷만 별도 확보해야 한다.'
  },
  {
    id: 'jtbc-seoul-marathon-2025-10k',
    eventName: 'JTBC 서울마라톤 10K',
    region: 'domestic',
    country: 'KR',
    city: 'Seoul',
    distanceKm: 10,
    year: 2025,
    sourceName: 'JTBC 서울마라톤 공식 사이트',
    sourceUrl: 'https://marathon.jtbc.com/1884697087',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '국내 10K 최근 결과 후보. 공식 기록조회 경로의 비식별 분포 컷만 제품 비교에 사용한다.'
  },
  {
    id: 'seoul-half-marathon-2026-half',
    eventName: '서울하프마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Seoul',
    distanceKm: 21.0975,
    year: 2026,
    sourceName: 'Runarchive 기록조회',
    sourceUrl: 'https://record.runarchive.com/',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '국내 하프 거리 최근 결과 후보. 원본 참가자 row 대신 하프 거리 비식별 분포 컷만 확보한다.'
  },
  {
    id: 'daegu-marathon-2026-marathon',
    eventName: '대구마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Daegu',
    distanceKm: 42.195,
    year: 2026,
    sourceName: '대구마라톤 공식 사이트',
    sourceUrl: 'https://daegumarathon.daegu.go.kr/board_detail.php?idx=7344',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '공식 결과/기록증 경로 확인 대상. 비식별 구간 집계로만 제품 데이터화한다.'
  },
  {
    id: 'jtbc-seoul-marathon-2025-marathon',
    eventName: 'JTBC 서울마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Seoul',
    distanceKm: 42.195,
    year: 2025,
    sourceName: 'JTBC 서울마라톤 공식 사이트',
    sourceUrl: 'https://marathon.jtbc.com/1884697087',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '2026 대회 전까지 최신 공개 결과 후보로 취급한다. 최신 연도 갱신 시 메타데이터를 교체한다.'
  },
  {
    id: 'chuncheon-marathon-2025-marathon',
    eventName: '춘천마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Chuncheon',
    distanceKm: 42.195,
    year: 2025,
    sourceName: '춘천마라톤 공식 기록조회 안내',
    sourceUrl: 'https://www.chuncheonmarathon.com/community/faq.html',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '이름/생년월일 조회형 결과는 재식별 위험이 있어 원본 저장 대상이 아니다.'
  },
  {
    id: 'tokyo-marathon-2026-marathon',
    eventName: 'Tokyo Marathon',
    region: 'international',
    country: 'JP',
    city: 'Tokyo',
    distanceKm: 42.195,
    year: 2026,
    sourceName: 'Tokyo Marathon official results',
    sourceUrl: 'https://www.marathon.tokyo/en/news/detail/news_20260301170000.html',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '해외 메이저 최신 공개 결과 후보. 원본 결과 rows 대신 허용된 집계 컷만 사용한다.'
  },
  {
    id: 'baa-10k-2025-10k',
    eventName: 'B.A.A. 10K',
    region: 'international',
    country: 'US',
    city: 'Boston',
    distanceKm: 10,
    year: 2025,
    sourceName: 'B.A.A. official results',
    sourceUrl: 'https://www.baa.org/races/boston-10k/results/',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'B.A.A. official race_results public DB',
      sampleSize: 7609,
      method: '숫자 bib 완주자의 ChipFinish만 Range 페이지네이션으로 집계해 1/5/10/25/50/75/90% 컷을 산출했다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 2115 },
      { percentile: 5, durationSec: 2561 },
      { percentile: 10, durationSec: 2775 },
      { percentile: 25, durationSec: 3202 },
      { percentile: 50, durationSec: 3673 },
      { percentile: 75, durationSec: 4221 },
      { percentile: 90, durationSec: 4795 }
    ],
    note: '2026 전체 분포는 공식 DB에 아직 0건이라, 최신 final 전체 분포가 확보된 2025 결과를 비식별 컷으로 사용한다.'
  },
  {
    id: 'baa-10k-2026-10k',
    eventName: 'B.A.A. 10K',
    region: 'international',
    country: 'US',
    city: 'Boston',
    distanceKm: 10,
    year: 2026,
    sourceName: 'B.A.A. official results',
    sourceUrl: 'https://www.baa.org/races/baa-10k/results',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '2026 대회 페이지는 확인됐지만 공식 공개 DB의 전체 분포는 아직 0건이다. 비교 계산은 2025 final 스냅샷으로 연다.'
  },
  {
    id: 'baa-half-2025-half',
    eventName: 'B.A.A. Half Marathon',
    region: 'international',
    country: 'US',
    city: 'Boston',
    distanceKm: 21.0975,
    year: 2025,
    sourceName: 'B.A.A. official results',
    sourceUrl: 'https://www.baa.org/races/boston-half/results/',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'B.A.A. official race_results public DB',
      sampleSize: 7041,
      method: '숫자 bib 완주자의 ChipFinish만 Range 페이지네이션으로 집계해 1/5/10/25/50/75/90% 컷을 산출했다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 4861 },
      { percentile: 5, durationSec: 5640 },
      { percentile: 10, durationSec: 6045 },
      { percentile: 25, durationSec: 6802 },
      { percentile: 50, durationSec: 7738 },
      { percentile: 75, durationSec: 8801 },
      { percentile: 90, durationSec: 9815 }
    ],
    note: '해외 하프 최신 final 전체 분포 후보. 원본 참가자 row는 저장하지 않고 비식별 컷과 표본 수만 저장한다.'
  },
  {
    id: 'nyc-half-2026-half',
    eventName: 'United Airlines NYC Half',
    region: 'international',
    country: 'US',
    city: 'New York',
    distanceKm: 21.0975,
    year: 2026,
    sourceName: 'NYRR official results',
    sourceUrl: 'https://www.nyrr.org/races/2026unitedairlinesnychalf/results',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '해외 하프 최근 결과 후보. NYRR 공식 결과 기준이며 원본 row 저장 없이 하프 분포 컷만 사용한다.'
  },
  {
    id: 'berlin-half-2025-half',
    eventName: 'Berlin Half Marathon',
    region: 'international',
    country: 'DE',
    city: 'Berlin',
    distanceKm: 21.0975,
    year: 2025,
    sourceName: 'Berlin Half Marathon official results',
    sourceUrl: 'https://www.generali-berliner-halbmarathon.de/en/your-race/results',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'SCC Events official result API',
      sampleSize: 34731,
      method: '공식 result API의 전체 순위 위치를 조회해 Runner netto 기준 1/5/10/25/50/75/90% 컷을 산출했다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 4604 },
      { percentile: 5, durationSec: 5225 },
      { percentile: 10, durationSec: 5597 },
      { percentile: 25, durationSec: 6304 },
      { percentile: 50, durationSec: 7122 },
      { percentile: 75, durationSec: 8101 },
      { percentile: 90, durationSec: 9044 }
    ],
    note: '공식 SCC Events API에서 비식별 컷과 표본 수만 저장한다. 참가자 원본 row는 제품 데이터에 저장하지 않는다.'
  },
  {
    id: 'boston-marathon-2026-marathon',
    eventName: 'Boston Marathon',
    region: 'international',
    country: 'US',
    city: 'Boston',
    distanceKm: 42.195,
    year: 2026,
    sourceName: 'B.A.A. official results',
    sourceUrl: 'https://www.baa.org/races/boston-marathon/results/',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'B.A.A. official race_results public DB',
      sampleSize: 28979,
      method: '숫자 bib 완주자의 ChipFinish만 Range 페이지네이션으로 집계해 1/5/10/25/50/75/90% 컷을 산출했다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 8953 },
      { percentile: 5, durationSec: 9716 },
      { percentile: 10, durationSec: 10174 },
      { percentile: 25, durationSec: 11128 },
      { percentile: 50, durationSec: 12514 },
      { percentile: 75, durationSec: 14484 },
      { percentile: 90, durationSec: 17094 }
    ],
    note: '공식 공개 DB의 전체 분포에서 비식별 컷과 표본 수만 저장한다. 실제 순위나 참가자 원본 정보는 저장하지 않는다.'
  },
  {
    id: 'london-marathon-2026-marathon',
    eventName: 'London Marathon',
    region: 'international',
    country: 'GB',
    city: 'London',
    distanceKm: 42.195,
    year: 2026,
    sourceName: 'London Marathon official results',
    sourceUrl: 'https://www.londonmarathonevents.co.uk/london-marathon/results',
    retrievedAt,
    publishedAt: '2026 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '공식 검색형 결과 기준. 분포 스냅샷은 별도 허용/제휴 또는 공개 집계만 사용한다.'
  },
  {
    id: 'berlin-marathon-2025-marathon',
    eventName: 'Berlin Marathon',
    region: 'international',
    country: 'DE',
    city: 'Berlin',
    distanceKm: 42.195,
    year: 2025,
    sourceName: 'BMW Berlin Marathon official results',
    sourceUrl: 'https://www.bmw-berlin-marathon.com/en/your-race/results',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'SCC Events official result API',
      sampleSize: 48351,
      method: '공식 result API의 전체 순위 위치를 조회해 Runner netto 기준 1/5/10/25/50/75/90% 컷을 산출했다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 9642 },
      { percentile: 5, durationSec: 10806 },
      { percentile: 10, durationSec: 11806 },
      { percentile: 25, durationSec: 13503 },
      { percentile: 50, durationSec: 15614 },
      { percentile: 75, durationSec: 18003 },
      { percentile: 90, durationSec: 20387 }
    ],
    note: '공식 SCC Events API에서 비식별 컷과 표본 수만 저장한다. 참가자 원본 row는 제품 데이터에 저장하지 않는다.'
  },
  {
    id: 'chicago-marathon-2025-marathon',
    eventName: 'Chicago Marathon',
    region: 'international',
    country: 'US',
    city: 'Chicago',
    distanceKm: 42.195,
    year: 2025,
    sourceName: 'Chicago Marathon official race results',
    sourceUrl: 'https://www.chicagomarathon.com/runners/race-results/',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '2026 대회 전까지 최신 final 결과로 관리한다.'
  },
  {
    id: 'nyc-marathon-2025-marathon',
    eventName: 'New York City Marathon',
    region: 'international',
    country: 'US',
    city: 'New York',
    distanceKm: 42.195,
    year: 2025,
    sourceName: 'NYRR official results',
    sourceUrl: 'https://www.nyrr.org/tcsnycmarathon/results',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'needs-permission',
    percentileCutsSec: [],
    note: '공식 검색형 결과 기준. 비식별 퍼센타일 컷 확보 전까지 실제 순위 표현을 막는다.'
  }
]

export function getRecentRaceBenchmarkSnapshots(): RaceBenchmarkSnapshot[] {
  return [...raceBenchmarkSnapshots].sort((a, b) => {
    if (a.region !== b.region) return a.region === 'domestic' ? -1 : 1
    if (a.year !== b.year) return b.year - a.year
    return a.eventName.localeCompare(b.eventName)
  })
}

export function getRaceBenchmarkCatalogSummary(targetDistanceKm: number | null | undefined): RaceBenchmarkCatalogSummary {
  const snapshots = getRecentRaceBenchmarkSnapshots()
  const distanceCoverage = getDistanceCoverage(snapshots)
  const matchingSnapshots = typeof targetDistanceKm === 'number'
    ? snapshots.filter((snapshot) => isDistanceMatch(snapshot.distanceKm, targetDistanceKm))
    : []
  return {
    total: snapshots.length,
    domestic: snapshots.filter((snapshot) => snapshot.region === 'domestic').length,
    international: snapshots.filter((snapshot) => snapshot.region === 'international').length,
    latestConfirmed: snapshots.filter((snapshot) => snapshot.freshnessStatus === 'latest-confirmed').length,
    distributionReady: snapshots.filter((snapshot) => snapshot.distributionStatus === 'ready').length,
    matchingDistance: matchingSnapshots.length,
    matchingDistributionReady: matchingSnapshots.filter((snapshot) => snapshot.distributionStatus === 'ready').length,
    matchingPendingDistribution: matchingSnapshots.filter((snapshot) => snapshot.distributionStatus !== 'ready').length,
    pendingDistribution: snapshots.filter((snapshot) => snapshot.distributionStatus !== 'ready').length,
    distanceCoverage
  }
}

export function compareProjectionToRaceBenchmarks(
  projection: RaceProjection | null,
  snapshots: RaceBenchmarkSnapshot[] = getRecentRaceBenchmarkSnapshots()
): RaceBenchmarkComparison[] {
  if (!projection) return []
  return snapshots.map((snapshot) => {
    if (!isDistanceMatch(snapshot.distanceKm, projection.targetDistanceKm)) {
      return { snapshot, percentile: null, percentileRange: null, nextCut: null, nextCutGapSec: null, status: 'distance-mismatch' }
    }
    if (snapshot.distributionStatus !== 'ready' || snapshot.percentileCutsSec.length < 2) {
      return { snapshot, percentile: null, percentileRange: null, nextCut: null, nextCutGapSec: null, status: 'pending-distribution' }
    }
    const percentile = interpolatePercentile(projection.current.projectedSec, snapshot.percentileCutsSec)
    const percentileRange = interpolatePercentileRange(projection.projectedRangeSec, snapshot.percentileCutsSec)
    const nextCut = getNextFasterCut(projection.current.projectedSec, snapshot.percentileCutsSec)
    return {
      snapshot,
      percentile,
      percentileRange,
      nextCut,
      nextCutGapSec: nextCut ? Math.max(0, projection.current.projectedSec - nextCut.durationSec) : null,
      status: 'ready'
    }
  })
}

export function splitRaceBenchmarkComparisons(comparisons: RaceBenchmarkComparison[]): RaceBenchmarkComparisonGroups {
  return {
    currentDistance: comparisons.filter((comparison) => comparison.status !== 'distance-mismatch'),
    otherDistances: comparisons.filter((comparison) => comparison.status === 'distance-mismatch')
  }
}

export function isDistanceMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.2, Math.min(a, b) * 0.01)
}

export function getRaceBenchmarkDistanceCategory(distanceKm: number): RaceBenchmarkDistanceCategory | null {
  return raceBenchmarkDistanceCategories.find((category) => isDistanceMatch(distanceKm, category.distanceKm))?.id ?? null
}

export function raceBenchmarkDistanceCategoryLabel(category: RaceBenchmarkDistanceCategory): string {
  return raceBenchmarkDistanceCategories.find((item) => item.id === category)?.label ?? category
}

export function raceBenchmarkFreshnessLabel(status: RaceBenchmarkFreshnessStatus): string {
  if (status === 'latest-confirmed') return '최신 확인'
  if (status === 'latest-unverified') return '최신 미확정'
  if (status === 'recent') return '최근 참고'
  if (status === 'historical') return '과거 기록'
  if (status === 'stale') return '갱신 필요'
  return '사용 불가'
}

export function raceBenchmarkDistributionLabel(status: RaceBenchmarkDistributionStatus): string {
  if (status === 'ready') return '비교 가능'
  if (status === 'source-confirmed') return '출처 확인'
  if (status === 'needs-permission') return '분포 집계 필요'
  return '분포 없음'
}

function interpolatePercentile(durationSec: number, cuts: RaceBenchmarkCut[]): number {
  const sorted = [...cuts].sort((a, b) => a.durationSec - b.durationSec)
  if (durationSec <= sorted[0].durationSec) return sorted[0].percentile
  const last = sorted[sorted.length - 1]
  if (durationSec >= last.durationSec) return last.percentile

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const next = sorted[i]
    if (durationSec <= next.durationSec) {
      const span = next.durationSec - prev.durationSec
      const ratio = span > 0 ? (durationSec - prev.durationSec) / span : 0
      return Math.round((prev.percentile + (next.percentile - prev.percentile) * ratio) * 10) / 10
    }
  }
  return last.percentile
}

function interpolatePercentileRange(projectedRangeSec: [number, number] | null, cuts: RaceBenchmarkCut[]): [number, number] | null {
  if (!projectedRangeSec) return null
  const [fastSec, slowSec] = [...projectedRangeSec].sort((a, b) => a - b)
  const fastPercentile = interpolatePercentile(fastSec, cuts)
  const slowPercentile = interpolatePercentile(slowSec, cuts)
  return fastPercentile <= slowPercentile
    ? [fastPercentile, slowPercentile]
    : [slowPercentile, fastPercentile]
}

function getNextFasterCut(durationSec: number, cuts: RaceBenchmarkCut[]): RaceBenchmarkCut | null {
  const faster = cuts
    .filter((cut) => cut.durationSec < durationSec)
    .sort((a, b) => b.percentile - a.percentile)
  return faster[0] ?? null
}

function getDistanceCoverage(snapshots: RaceBenchmarkSnapshot[]): Record<RaceBenchmarkDistanceCategory, RaceBenchmarkDistanceCoverage> {
  const coverage = emptyDistanceCoverage()
  snapshots.forEach((snapshot) => {
    const category = getRaceBenchmarkDistanceCategory(snapshot.distanceKm)
    if (!category) return
    coverage[category].total += 1
    if (snapshot.region === 'domestic') coverage[category].domestic += 1
    if (snapshot.region === 'international') coverage[category].international += 1
    if (snapshot.freshnessStatus === 'latest-confirmed') coverage[category].latestConfirmed += 1
  })
  return coverage
}

function emptyDistanceCoverage(): Record<RaceBenchmarkDistanceCategory, RaceBenchmarkDistanceCoverage> {
  return {
    '10k': { total: 0, domestic: 0, international: 0, latestConfirmed: 0 },
    half: { total: 0, domestic: 0, international: 0, latestConfirmed: 0 },
    marathon: { total: 0, domestic: 0, international: 0, latestConfirmed: 0 }
  }
}

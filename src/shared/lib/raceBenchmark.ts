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

/**
 * 입력 기록이 분포 컷 범위 안에 들어왔는지, 아니면 가장 빠른/느린 컷 너머인지.
 * - `exact`: 컷 구간 안. 보간값을 그대로 신뢰.
 * - `beyond-fast`: 가장 빠른 컷(예: p1)보다도 빠름 → "상위 N% 이내".
 * - `beyond-slow`: 가장 느린 컷(예: p90/p99)보다도 느림 → "상위 N%+"(꼬리). 클램핑 표현 금지.
 */
export type RaceBenchmarkPercentileBound = 'exact' | 'beyond-fast' | 'beyond-slow'

/** 비교 세그먼트. 전체와 성별(남/여)만 지원한다(나이대는 소스 데이터 부재로 보류). */
export type RaceBenchmarkSegmentKey = 'overall' | 'male' | 'female'

/** 비식별 세그먼트 분포: 퍼센타일 컷과 표본 수만. 원본 row는 저장하지 않는다. */
export type RaceBenchmarkSegmentDistribution = {
  cuts: RaceBenchmarkCut[]
  sampleSize: number
}

export type RaceBenchmarkGenderDistribution = {
  male?: RaceBenchmarkSegmentDistribution
  female?: RaceBenchmarkSegmentDistribution
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
  /** 전체 완주자 분포 컷(비식별 aggregate). */
  percentileCutsSec: RaceBenchmarkCut[]
  /** 성별 분포 컷(있을 때만). 같은 비식별 집계 원칙을 따른다. */
  genderDistribution?: RaceBenchmarkGenderDistribution
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

/** 한 세그먼트(전체/남/여)에 대한 현주소 계산 결과. */
export type RaceBenchmarkSegmentComparison = {
  segment: RaceBenchmarkSegmentKey
  sampleSize: number
  percentile: number
  /** 입력이 컷 범위 안인지, 빠른/느린 꼬리 너머인지. 표시 라벨이 이 값에 따라 달라진다. */
  percentileBound: RaceBenchmarkPercentileBound
  percentileRange: [number, number]
  percentileRangeBounds: [RaceBenchmarkPercentileBound, RaceBenchmarkPercentileBound]
  nextCut: RaceBenchmarkCut | null
  nextCutGapSec: number | null
}

export type RaceBenchmarkComparison = {
  snapshot: RaceBenchmarkSnapshot
  /** 전체 세그먼트 기준값(하위호환·기본 표시). `segments[0]`과 동일. */
  percentile: number | null
  percentileBound: RaceBenchmarkPercentileBound | null
  percentileRange: [number, number] | null
  percentileRangeBounds: [RaceBenchmarkPercentileBound, RaceBenchmarkPercentileBound] | null
  nextCut: RaceBenchmarkCut | null
  nextCutGapSec: number | null
  /** 전체 + 데이터가 있는 성별 세그먼트. UI 토글이 여기서 고른다. */
  segments: RaceBenchmarkSegmentComparison[]
  status: 'ready' | 'pending-distribution' | 'distance-mismatch'
}

export type RaceBenchmarkComparisonGroups = {
  currentDistance: RaceBenchmarkComparison[]
  otherDistances: RaceBenchmarkComparison[]
}

export type RaceBenchmarkEvidenceLevel = 'none' | 'single-reference' | 'multi-benchmark'

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
    sourceName: 'MyResult 기록조회',
    sourceUrl: 'https://www.myresult.co.kr/133',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'MyResult public event/player API',
      sampleSize: 3081,
      method: '공개 event/player API를 표본 순회(코스 배번 블록 탐색 후 블록 내 무작위 표본)해 10K 완주 기록의 net time만 집계하고, [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]% 컷을 전체·성별로 산출했다. sampleSize는 컷 산출에 쓴 표본 수다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 2464 },
      { percentile: 2.5, durationSec: 2608 },
      { percentile: 5, durationSec: 2731 },
      { percentile: 10, durationSec: 2883 },
      { percentile: 25, durationSec: 3164 },
      { percentile: 50, durationSec: 3469 },
      { percentile: 75, durationSec: 3867 },
      { percentile: 90, durationSec: 4336 },
      { percentile: 95, durationSec: 4666 },
      { percentile: 99, durationSec: 5266 }
    ],
    genderDistribution: {
      male: {
        sampleSize: 1641,
        cuts: [
          { percentile: 1, durationSec: 2411 },
          { percentile: 2.5, durationSec: 2520 },
          { percentile: 5, durationSec: 2652 },
          { percentile: 10, durationSec: 2753 },
          { percentile: 25, durationSec: 2982 },
          { percentile: 50, durationSec: 3298 },
          { percentile: 75, durationSec: 3617 },
          { percentile: 90, durationSec: 4080 },
          { percentile: 95, durationSec: 4377 },
          { percentile: 99, durationSec: 5096 }
        ]
      },
      female: {
        sampleSize: 1440,
        cuts: [
          { percentile: 1, durationSec: 2774 },
          { percentile: 2.5, durationSec: 2903 },
          { percentile: 5, durationSec: 3005 },
          { percentile: 10, durationSec: 3163 },
          { percentile: 25, durationSec: 3367 },
          { percentile: 50, durationSec: 3675 },
          { percentile: 75, durationSec: 4050 },
          { percentile: 90, durationSec: 4479 },
          { percentile: 95, durationSec: 4835 },
          { percentile: 99, durationSec: 5445 }
        ]
      }
    },
    note: 'MyResult 공개 API에서 비식별 분포 컷과 표본 수만 제품 데이터에 저장한다. 참가자 이름, 배번, 개별 기록 row는 저장하지 않는다.'
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
    sourceName: 'MyResult 기록조회',
    sourceUrl: 'https://www.myresult.co.kr/133',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'MyResult public event/player API',
      sampleSize: 3073,
      method: '공개 event/player API를 표본 순회(코스 배번 블록 탐색 후 블록 내 무작위 표본)해 마스터즈 풀 완주 기록의 net time만 집계하고, [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]% 컷을 전체·성별로 산출했다. 풀코스 느린쪽 꼬리(p95·p99)는 대회 제한시간으로 검열(censored)돼 finisher 기준임에 유의한다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 10033 },
      { percentile: 2.5, durationSec: 10601 },
      { percentile: 5, durationSec: 10870 },
      { percentile: 10, durationSec: 11573 },
      { percentile: 25, durationSec: 12828 },
      { percentile: 50, durationSec: 14219 },
      { percentile: 75, durationSec: 16000 },
      { percentile: 90, durationSec: 17562 },
      { percentile: 95, durationSec: 18457 },
      { percentile: 99, durationSec: 20359 }
    ],
    genderDistribution: {
      male: {
        sampleSize: 2560,
        cuts: [
          { percentile: 1, durationSec: 9980 },
          { percentile: 2.5, durationSec: 10530 },
          { percentile: 5, durationSec: 10770 },
          { percentile: 10, durationSec: 11404 },
          { percentile: 25, durationSec: 12575 },
          { percentile: 50, durationSec: 14102 },
          { percentile: 75, durationSec: 15839 },
          { percentile: 90, durationSec: 17472 },
          { percentile: 95, durationSec: 18294 },
          { percentile: 99, durationSec: 20363 }
        ]
      },
      female: {
        sampleSize: 513,
        cuts: [
          { percentile: 1, durationSec: 11405 },
          { percentile: 2.5, durationSec: 11905 },
          { percentile: 5, durationSec: 12257 },
          { percentile: 10, durationSec: 12847 },
          { percentile: 25, durationSec: 13910 },
          { percentile: 50, durationSec: 15137 },
          { percentile: 75, durationSec: 16647 },
          { percentile: 90, durationSec: 17795 },
          { percentile: 95, durationSec: 19052 },
          { percentile: 99, durationSec: 20184 }
        ]
      }
    },
    note: '2026 대회 전까지 최신 공개 결과 후보로 취급한다. MyResult 공개 API에서 비식별 분포 컷과 표본 수만 저장하고, 개별 기록 row는 저장하지 않는다.'
  },
  {
    id: 'chuncheon-marathon-2025-10k',
    eventName: '춘천마라톤 10K',
    region: 'domestic',
    country: 'KR',
    city: 'Chuncheon',
    distanceKm: 10,
    year: 2025,
    sourceName: 'MyResult 기록조회',
    sourceUrl: 'https://www.myresult.co.kr/132',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'MyResult public event/player API',
      sampleSize: 3070,
      method: '공개 event/player API를 표본 순회(코스 배번 블록 탐색 후 블록 내 무작위 표본)해 10K 완주 기록의 net time만 집계하고, [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]% 컷을 전체·성별로 산출했다. sampleSize는 컷 산출에 쓴 표본 수다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 2397 },
      { percentile: 2.5, durationSec: 2554 },
      { percentile: 5, durationSec: 2675 },
      { percentile: 10, durationSec: 2841 },
      { percentile: 25, durationSec: 3114 },
      { percentile: 50, durationSec: 3463 },
      { percentile: 75, durationSec: 3905 },
      { percentile: 90, durationSec: 4361 },
      { percentile: 95, durationSec: 4689 },
      { percentile: 99, durationSec: 5228 }
    ],
    genderDistribution: {
      male: {
        sampleSize: 1567,
        cuts: [
          { percentile: 1, durationSec: 2336 },
          { percentile: 2.5, durationSec: 2456 },
          { percentile: 5, durationSec: 2580 },
          { percentile: 10, durationSec: 2711 },
          { percentile: 25, durationSec: 2918 },
          { percentile: 50, durationSec: 3260 },
          { percentile: 75, durationSec: 3641 },
          { percentile: 90, durationSec: 4160 },
          { percentile: 95, durationSec: 4505 },
          { percentile: 99, durationSec: 5049 }
        ]
      },
      female: {
        sampleSize: 1503,
        cuts: [
          { percentile: 1, durationSec: 2658 },
          { percentile: 2.5, durationSec: 2868 },
          { percentile: 5, durationSec: 2977 },
          { percentile: 10, durationSec: 3121 },
          { percentile: 25, durationSec: 3356 },
          { percentile: 50, durationSec: 3679 },
          { percentile: 75, durationSec: 4099 },
          { percentile: 90, durationSec: 4534 },
          { percentile: 95, durationSec: 4830 },
          { percentile: 99, durationSec: 5267 }
        ]
      }
    },
    note: 'MyResult 공개 API에서 비식별 분포 컷과 표본 수만 제품 데이터에 저장한다. 참가자 이름, 배번, 개별 기록 row는 저장하지 않는다.'
  },
  {
    id: 'chuncheon-marathon-2025-marathon',
    eventName: '춘천마라톤',
    region: 'domestic',
    country: 'KR',
    city: 'Chuncheon',
    distanceKm: 42.195,
    year: 2025,
    sourceName: 'MyResult 기록조회',
    sourceUrl: 'https://www.myresult.co.kr/132',
    retrievedAt,
    publishedAt: '2025 results',
    freshnessStatus: 'latest-confirmed',
    resultStatus: 'final',
    distributionStatus: 'ready',
    distributionBasis: {
      label: 'MyResult public event/player API',
      sampleSize: 3000,
      method: '공개 event/player API를 표본 순회(코스 배번 블록 탐색 후 블록 내 무작위 표본)해 마스터즈 풀 완주 기록의 net time만 집계하고, [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]% 컷을 전체·성별로 산출했다. 풀코스 느린쪽 꼬리(p95·p99)는 대회 제한시간으로 검열(censored)돼 finisher 기준임에 유의한다.'
    },
    percentileCutsSec: [
      { percentile: 1, durationSec: 9987 },
      { percentile: 2.5, durationSec: 10501 },
      { percentile: 5, durationSec: 10826 },
      { percentile: 10, durationSec: 11675 },
      { percentile: 25, durationSec: 12885 },
      { percentile: 50, durationSec: 14273 },
      { percentile: 75, durationSec: 16127 },
      { percentile: 90, durationSec: 17674 },
      { percentile: 95, durationSec: 18718 },
      { percentile: 99, durationSec: 20308 }
    ],
    genderDistribution: {
      male: {
        sampleSize: 2415,
        cuts: [
          { percentile: 1, durationSec: 9876 },
          { percentile: 2.5, durationSec: 10360 },
          { percentile: 5, durationSec: 10741 },
          { percentile: 10, durationSec: 11417 },
          { percentile: 25, durationSec: 12558 },
          { percentile: 50, durationSec: 14079 },
          { percentile: 75, durationSec: 15786 },
          { percentile: 90, durationSec: 17426 },
          { percentile: 95, durationSec: 18388 },
          { percentile: 99, durationSec: 20024 }
        ]
      },
      female: {
        sampleSize: 585,
        cuts: [
          { percentile: 1, durationSec: 12045 },
          { percentile: 2.5, durationSec: 12482 },
          { percentile: 5, durationSec: 12781 },
          { percentile: 10, durationSec: 13211 },
          { percentile: 25, durationSec: 14150 },
          { percentile: 50, durationSec: 15579 },
          { percentile: 75, durationSec: 17087 },
          { percentile: 90, durationSec: 18355 },
          { percentile: 95, durationSec: 19485 },
          { percentile: 99, durationSec: 20779 }
        ]
      }
    },
    note: 'MyResult 공개 API에서 비식별 분포 컷과 표본 수만 제품 데이터에 저장한다. 참가자 이름, 배번, 개별 기록 row는 저장하지 않는다.'
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
      return emptyComparison(snapshot, 'distance-mismatch')
    }
    if (snapshot.distributionStatus !== 'ready' || snapshot.percentileCutsSec.length < 2) {
      return emptyComparison(snapshot, 'pending-distribution')
    }

    const segments = buildSegmentComparisons(projection, snapshot)
    const overall = segments[0]
    return {
      snapshot,
      percentile: overall.percentile,
      percentileBound: overall.percentileBound,
      percentileRange: overall.percentileRange,
      percentileRangeBounds: overall.percentileRangeBounds,
      nextCut: overall.nextCut,
      nextCutGapSec: overall.nextCutGapSec,
      segments,
      status: 'ready'
    }
  })
}

function emptyComparison(
  snapshot: RaceBenchmarkSnapshot,
  status: 'pending-distribution' | 'distance-mismatch'
): RaceBenchmarkComparison {
  return {
    snapshot,
    percentile: null,
    percentileBound: null,
    percentileRange: null,
    percentileRangeBounds: null,
    nextCut: null,
    nextCutGapSec: null,
    segments: [],
    status
  }
}

/** 전체 + 데이터가 있는 성별 세그먼트 비교를 만든다. 항상 overall이 첫 번째. */
function buildSegmentComparisons(
  projection: RaceProjection,
  snapshot: RaceBenchmarkSnapshot
): RaceBenchmarkSegmentComparison[] {
  const segments: RaceBenchmarkSegmentComparison[] = [
    buildSegmentComparison('overall', snapshot.percentileCutsSec, snapshot.distributionBasis?.sampleSize ?? 0, projection)
  ]
  const male = snapshot.genderDistribution?.male
  if (male && male.cuts.length >= 2) {
    segments.push(buildSegmentComparison('male', male.cuts, male.sampleSize, projection))
  }
  const female = snapshot.genderDistribution?.female
  if (female && female.cuts.length >= 2) {
    segments.push(buildSegmentComparison('female', female.cuts, female.sampleSize, projection))
  }
  return segments
}

function buildSegmentComparison(
  segment: RaceBenchmarkSegmentKey,
  cuts: RaceBenchmarkCut[],
  sampleSize: number,
  projection: RaceProjection
): RaceBenchmarkSegmentComparison {
  const point = resolvePercentilePoint(projection.current.projectedSec, cuts)
  // 범위가 없으면 점으로 축약(범위 밖이면 bound가 라벨에 살아 있도록).
  const rangeResult = resolvePercentileRange(projection.projectedRangeSec, cuts)
    ?? { range: [point.percentile, point.percentile] as [number, number], bounds: [point.bound, point.bound] as [RaceBenchmarkPercentileBound, RaceBenchmarkPercentileBound] }
  const nextCut = getNextFasterCut(projection.current.projectedSec, cuts)
  return {
    segment,
    sampleSize,
    percentile: point.percentile,
    percentileBound: point.bound,
    percentileRange: rangeResult.range,
    percentileRangeBounds: rangeResult.bounds,
    nextCut,
    nextCutGapSec: nextCut ? Math.max(0, projection.current.projectedSec - nextCut.durationSec) : null
  }
}

export function splitRaceBenchmarkComparisons(comparisons: RaceBenchmarkComparison[]): RaceBenchmarkComparisonGroups {
  return {
    currentDistance: comparisons.filter((comparison) => comparison.status !== 'distance-mismatch'),
    otherDistances: comparisons.filter((comparison) => comparison.status === 'distance-mismatch')
  }
}

export function getRaceBenchmarkEvidenceLevel(readyComparisonCount: number): RaceBenchmarkEvidenceLevel {
  if (readyComparisonCount >= 2) return 'multi-benchmark'
  if (readyComparisonCount === 1) return 'single-reference'
  return 'none'
}

export function formatRaceBenchmarkPercentilePoint(
  percentile: number,
  bound: RaceBenchmarkPercentileBound = 'exact'
): string {
  // 가장 빠른 컷보다 빠르면 "상위 N% 이내"(그 컷 안쪽), 가장 느린 컷보다 느리면 "상위 N%+"(꼬리).
  if (bound === 'beyond-fast') return `상위 ${percentile}% 이내`
  if (bound === 'beyond-slow') return `상위 ${percentile}%+`
  return `상위 ${percentile}%`
}

export function formatRaceBenchmarkPercentileRange(
  range: [number, number] | null,
  bounds: [RaceBenchmarkPercentileBound, RaceBenchmarkPercentileBound] = ['exact', 'exact']
): string {
  if (!range) return ''
  const [low, high] = range
  const [lowBound, highBound] = bounds
  if (low === high) {
    // 동률이면 더 정직한(극단) bound 우선: 한쪽 끝이라도 꼬리 너머면 그 표시("+"/"이내")를 살린다.
    const tieBound = highBound === 'beyond-slow' ? 'beyond-slow' : lowBound === 'beyond-fast' ? 'beyond-fast' : lowBound
    return formatRaceBenchmarkPercentilePoint(low, tieBound)
  }
  // low=빠른 끝(낙관), high=느린 끝(보수). 느린 끝이 꼬리 너머면 "+"로 정직하게 표시.
  const lowText = lowBound === 'beyond-fast' ? `${low}% 이내` : `${low}`
  const highSuffix = highBound === 'beyond-slow' ? '%+' : '%'
  return lowBound === 'beyond-fast'
    ? `상위 ${lowText}~${high}${highSuffix}`
    : `상위 ${low}~${high}${highSuffix}`
}

export function formatRaceBenchmarkSegmentLabel(segment: RaceBenchmarkSegmentKey): string {
  if (segment === 'male') return '남자'
  if (segment === 'female') return '여자'
  return '전체'
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

type RaceBenchmarkPercentilePoint = {
  percentile: number
  bound: RaceBenchmarkPercentileBound
}

/**
 * 입력 기록의 퍼센타일 위치를 컷 사이 선형보간으로 구한다.
 * 핵심: 가장 빠른/느린 컷 너머는 *클램핑하지 않고* bound로 표시해, p90/p99 너머가 전부
 * 같은 숫자로 뭉개지는 버그를 막는다(표시 라벨이 bound를 반영).
 */
function resolvePercentilePoint(durationSec: number, cuts: RaceBenchmarkCut[]): RaceBenchmarkPercentilePoint {
  const sorted = [...cuts].sort((a, b) => a.durationSec - b.durationSec)
  const fastest = sorted[0]
  const slowest = sorted[sorted.length - 1]
  // 가장 빠른 컷보다 더 빠름 → 그 컷 안쪽(beyond-fast). 동률은 정확값으로 둔다.
  if (durationSec < fastest.durationSec) return { percentile: fastest.percentile, bound: 'beyond-fast' }
  // 가장 느린 컷보다 더 느림 → 꼬리(beyond-slow). 클램핑 대신 정직 표시.
  if (durationSec > slowest.durationSec) return { percentile: slowest.percentile, bound: 'beyond-slow' }

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const next = sorted[i]
    if (durationSec <= next.durationSec) {
      const span = next.durationSec - prev.durationSec
      const ratio = span > 0 ? (durationSec - prev.durationSec) / span : 0
      const percentile = Math.round((prev.percentile + (next.percentile - prev.percentile) * ratio) * 10) / 10
      return { percentile, bound: 'exact' }
    }
  }
  return { percentile: slowest.percentile, bound: 'exact' }
}

type RaceBenchmarkRangeResult = {
  range: [number, number]
  bounds: [RaceBenchmarkPercentileBound, RaceBenchmarkPercentileBound]
}

/**
 * 예상 범위(낙관~보수)를 퍼센타일 범위 + 각 끝의 bound로 변환.
 * 범위가 없으면 null을 돌려, 호출부가 단일 점으로 축약하도록 둔다.
 */
function resolvePercentileRange(
  projectedRangeSec: [number, number] | null,
  cuts: RaceBenchmarkCut[]
): RaceBenchmarkRangeResult | null {
  if (!projectedRangeSec) return null
  const [fastSec, slowSec] = [...projectedRangeSec].sort((a, b) => a - b)
  const fast = resolvePercentilePoint(fastSec, cuts)
  const slow = resolvePercentilePoint(slowSec, cuts)
  return fast.percentile <= slow.percentile
    ? { range: [fast.percentile, slow.percentile], bounds: [fast.bound, slow.bound] }
    : { range: [slow.percentile, fast.percentile], bounds: [slow.bound, fast.bound] }
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

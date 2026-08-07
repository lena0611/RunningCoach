export type RunType =
  | 'Easy'
  | 'Recovery'
  | 'Easy + Strides'
  | 'Tempo'
  | 'LSD'
  | 'Steady Long'
  | 'Race'
  | 'Unknown'

export type CourseType = 'Unknown' | 'Flat' | 'Hilly' | 'Track' | 'Treadmill' | 'Trail' | 'Mixed'

export type Lap = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  avgHeartRate: number | null
  maxHeartRate?: number | null
  cadence: number | null
}

export type FastSegment = {
  index: number
  startSec: number | null
  durationSec: number | null
  distanceKm: number | null
  avgPaceSec: number | null
  bestPaceSec: number | null
}

export type RunMetricSample = {
  offsetSec: number
  heartRate: number | null
  paceSec: number | null
  cadence: number | null
}

export type RunRoutePoint = {
  offsetSec: number
  latitude: number
  longitude: number
  altitude: number | null
}

export type RunLog = {
  id: string
  userId: string
  externalId: string | null
  sessionTitle: string
  date: string
  startAt: string | null
  endAt: string | null
  type: RunType
  distanceKm: number
  durationSec: number | null
  avgPaceSec: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  cadence: number | null
  activeEnergyKcal: number | null
  temperature: number | null
  humidity: number | null
  windMps: number | null
  elevationGainM: number | null
  elevationLossM: number | null
  courseType: CourseType
  rpe: number | null
  workoutFeeling: string
  painNote: string
  sleepQuality: number | null
  conditionScore: number | null
  stressLevel: number | null
  companion: string
  memo: string
  laps: Lap[]
  fastSegments: FastSegment[]
  metricSamples: RunMetricSample[]
  routePoints: RunRoutePoint[]
  tags: string[]
  source: 'file_import' | 'healthkit' | 'manual' | 'image_extracted'
  createdAt: string
  updatedAt: string
  /**
   * 무거운 데이터(랩·구간 샘플·경로 좌표)가 실제로 실려 있는가(#661 지연 로드).
   *
   * 목록 조회는 이 세 배열을 **받아오지 않는다**(런당 23KB → 1KB, 실측 203런에서 4.7MB → 0.2MB).
   * 그래서 목록에서 온 런은 배열이 `[]` 이고 `heavyDataLoaded === false` 다 — **"데이터가 없음"이
   * 아니라 "아직 안 불러옴"** 이라는 뜻이라 이 둘을 반드시 구분해야 한다. 있는지 없는지는 아래 개수로 본다.
   * 세션 상세를 열 때 `runStore.ensureHeavyData(id)` 가 채우고 true 가 된다.
   */
  heavyDataLoaded?: boolean
  /** 서버 생성 컬럼(무거운 배열을 안 받아도 "있는지"를 알 수 있다). 로컬 모드에선 undefined. */
  lapCount?: number
  metricSampleCount?: number
  routePointCount?: number
}

/** 배열이 실려 있으면 그 길이, 아니면 서버가 준 개수. 목록/상세 어디서 온 런이든 같은 답을 준다. */
export function runDataCount(
  run: Pick<RunLog, 'laps' | 'metricSamples' | 'routePoints' | 'lapCount' | 'metricSampleCount' | 'routePointCount'>,
  kind: 'laps' | 'metricSamples' | 'routePoints'
): number {
  const loaded = run[kind]?.length ?? 0
  if (loaded) return loaded
  if (kind === 'laps') return run.lapCount ?? 0
  if (kind === 'metricSamples') return run.metricSampleCount ?? 0
  return run.routePointCount ?? 0
}

export const runTypes: RunType[] = [
  'Easy',
  'Recovery',
  'Easy + Strides',
  'Tempo',
  'LSD',
  'Steady Long',
  'Race',
  'Unknown'
]

export const courseTypes: CourseType[] = ['Unknown', 'Flat', 'Hilly', 'Track', 'Treadmill', 'Trail', 'Mixed']

export type ExtractedRunData = Omit<RunLog, 'id' | 'userId' | 'source' | 'createdAt' | 'updatedAt' | 'rpe' | 'tags'> & {
  rpe?: number | null
  tags?: string[]
}

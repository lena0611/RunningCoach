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

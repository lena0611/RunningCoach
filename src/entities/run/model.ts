export type RunType =
  | 'Easy'
  | 'Recovery'
  | 'Easy + Strides'
  | 'Tempo'
  | 'LSD'
  | 'Steady Long'
  | 'Race'
  | 'Unknown'

export type Lap = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  avgHeartRate: number | null
  cadence: number | null
}

export type RunLog = {
  id: string
  userId: string
  date: string
  type: RunType
  distanceKm: number
  durationSec: number | null
  avgPaceSec: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  cadence: number | null
  temperature: number | null
  rpe: number | null
  memo: string
  laps: Lap[]
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

export type ExtractedRunData = Omit<RunLog, 'id' | 'userId' | 'source' | 'createdAt' | 'updatedAt' | 'rpe' | 'tags'> & {
  rpe?: number | null
  tags?: string[]
}

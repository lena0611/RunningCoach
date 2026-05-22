import type { ExtractedRunData } from '@/entities/run/model'

export async function extractRunDataFromFile(file: File): Promise<ExtractedRunData> {
  const lowerName = file.name.toLowerCase()

  if (!lowerName.endsWith('.fit')) {
    throw new Error('현재는 Workoutdoors FIT 파일만 지원합니다.')
  }

  return extractFromFit(await file.arrayBuffer())
}

async function extractFromFit(buffer: ArrayBuffer): Promise<ExtractedRunData> {
  const { default: FitParser } = await import('fit-file-parser')
  const fitParser = new FitParser({
    force: true,
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true,
    mode: 'list'
  })

  const data = await new Promise<any>((resolve, reject) => {
    fitParser.parse(buffer, (error: unknown, result: unknown) => {
      if (error) reject(error)
      else resolve(result)
    })
  })

  const session = data.sessions?.[0]
  const laps = Array.isArray(data.laps) ? data.laps : []
  const records = Array.isArray(data.records) ? data.records : []
  const totalDistanceKm = session?.total_distance ? round(session.total_distance / 1000) : round((records.at(-1)?.distance ?? 0) / 1000)
  const durationSec = Math.round(session?.total_timer_time ?? session?.total_moving_time ?? session?.total_elapsed_time ?? 0)
  const rawCadence = numberOrNull(String(session?.avg_cadence ?? ''))

  return {
    ...createEmptyRun(),
    date: toIsoDate(session?.start_time ?? session?.timestamp ?? records[0]?.timestamp),
    distanceKm: totalDistanceKm,
    durationSec: durationSec || null,
    avgPaceSec: totalDistanceKm > 0 && durationSec ? Math.round(durationSec / totalDistanceKm) : null,
    avgHeartRate: numberOrNull(String(session?.avg_heart_rate ?? '')),
    maxHeartRate: numberOrNull(String(session?.max_heart_rate ?? '')),
    cadence: rawCadence === null ? null : normalizeCadence(rawCadence),
    laps: laps.map((lap: any, index: number) => {
      const distanceKm = numberOrNull(String(lap.total_distance ?? ''))
      const lapDurationSec = numberOrNull(String(lap.total_timer_time ?? lap.total_moving_time ?? lap.total_elapsed_time ?? ''))
      const lapCadence = numberOrNull(String(lap.avg_cadence ?? ''))
      return {
        index: index + 1,
        distanceKm: distanceKm === null ? null : round(distanceKm / 1000),
        paceSec: distanceKm && lapDurationSec ? Math.round(lapDurationSec / (distanceKm / 1000)) : null,
        avgHeartRate: numberOrNull(String(lap.avg_heart_rate ?? '')),
        cadence: lapCadence === null ? null : normalizeCadence(lapCadence)
      }
    }),
    memo: 'FIT 세션 요약 기반 로컬 추출. 저장 전 실제 값을 확인하세요.'
  }
}

export function createEmptyRun(): ExtractedRunData {
  return {
    sessionTitle: '',
    date: new Date().toISOString().slice(0, 10),
    type: 'Unknown',
    distanceKm: 0,
    durationSec: null,
    avgPaceSec: null,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: 'Unknown',
    rpe: null,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: [],
    tags: []
  }
}

function toIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function numberOrNull(value: string): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeCadence(value: number): number {
  return Math.round(value < 120 ? value * 2 : value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

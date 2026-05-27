import type { ExtractedRunData, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { createSessionTitle } from '@/features/create-session-title/createSessionTitle'
import { inferCourseType } from '@/features/infer-course-type/inferCourseType'
import { inferRunType } from '@/features/infer-run-type/inferRunType'

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
  const elevationGainM = numberOrNull(String(session?.total_ascent ?? session?.total_elevation_gain ?? session?.enhanced_total_ascent ?? ''))
  const elevationLossM = numberOrNull(String(session?.total_descent ?? session?.total_elevation_loss ?? session?.enhanced_total_descent ?? ''))
  const activeEnergyKcal = numberOrNull(String(session?.total_calories ?? session?.active_calories ?? session?.total_energy ?? ''))
  const temperature = numberOrNull(String(session?.avg_temperature ?? session?.temperature ?? session?.max_temperature ?? ''))
  const humidity = numberOrNull(String(session?.avg_humidity ?? session?.humidity ?? ''))
  const windMps = numberOrNull(String(session?.avg_wind_speed ?? session?.wind_speed ?? ''))
  const rpe = normalizeRpe(numberOrNull(String(session?.perceived_exertion ?? session?.workout_effort_score ?? '')))
  const date = toIsoDate(session?.start_time ?? session?.timestamp ?? records[0]?.timestamp)
  const mappedLaps = laps.map((lap: any, index: number) => {
    const distanceKm = numberOrNull(String(lap.total_distance ?? ''))
    const lapDurationSec = numberOrNull(String(lap.total_timer_time ?? lap.total_moving_time ?? lap.total_elapsed_time ?? ''))
    const lapCadence = numberOrNull(String(lap.avg_cadence ?? ''))
    return {
      index: index + 1,
      distanceKm: distanceKm === null ? null : round(distanceKm / 1000),
      paceSec: distanceKm && lapDurationSec ? Math.round(lapDurationSec / (distanceKm / 1000)) : null,
      avgHeartRate: numberOrNull(String(lap.avg_heart_rate ?? '')),
      maxHeartRate: numberOrNull(String(lap.max_heart_rate ?? '')),
      cadence: lapCadence === null ? null : normalizeCadence(lapCadence)
    }
  })
  const metricSamples = buildMetricSamples(records, session?.start_time ?? session?.timestamp ?? records[0]?.timestamp)
  const routePoints = buildRoutePoints(records, session?.start_time ?? session?.timestamp ?? records[0]?.timestamp)
  const type = inferRunType({
    date,
    distanceKm: totalDistanceKm,
    avgPaceSec: totalDistanceKm > 0 && durationSec ? Math.round(durationSec / totalDistanceKm) : null,
    avgHeartRate: numberOrNull(String(session?.avg_heart_rate ?? '')),
    laps: mappedLaps,
    fastSegments: [],
    metricSamples
  })

  return {
    ...createEmptyRun(),
    sessionTitle: createSessionTitle({
      date,
      startAt: toIsoDateTime(session?.start_time ?? session?.timestamp ?? records[0]?.timestamp),
      type
    }),
    date,
    type,
    distanceKm: totalDistanceKm,
    durationSec: durationSec || null,
    avgPaceSec: totalDistanceKm > 0 && durationSec ? Math.round(durationSec / totalDistanceKm) : null,
    avgHeartRate: numberOrNull(String(session?.avg_heart_rate ?? '')),
    maxHeartRate: numberOrNull(String(session?.max_heart_rate ?? '')),
    cadence: rawCadence === null ? null : normalizeCadence(rawCadence),
    activeEnergyKcal,
    temperature,
    humidity,
    windMps,
    elevationGainM,
    elevationLossM,
    courseType: inferCourseType({ distanceKm: totalDistanceKm, elevationGainM, elevationLossM, routePoints }),
    rpe,
    laps: mappedLaps,
    metricSamples,
    routePoints,
    memo: 'FIT 세션 요약 기반 로컬 추출. 저장 전 실제 값을 확인하세요.'
  }
}

export function createEmptyRun(): ExtractedRunData {
  return {
    externalId: null,
    sessionTitle: '',
    date: new Date().toISOString().slice(0, 10),
    type: 'Unknown',
    distanceKm: 0,
    durationSec: null,
    avgPaceSec: null,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    activeEnergyKcal: null,
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
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: []
  }
}

function buildMetricSamples(records: any[], startValue: unknown): RunMetricSample[] {
  const startDate = startValue instanceof Date ? startValue : new Date(String(startValue ?? ''))
  if (!Number.isFinite(startDate.getTime())) return []

  const rawSamples = records
    .map((record: any) => {
      const timestamp = record.timestamp instanceof Date ? record.timestamp : new Date(String(record.timestamp ?? ''))
      if (!Number.isFinite(timestamp.getTime())) return null
      const offsetSec = Math.max(0, Math.round((timestamp.getTime() - startDate.getTime()) / 1000))
      const speed = numberOrNull(String(record.enhanced_speed ?? record.speed ?? ''))
      const rawCadence = numberOrNull(String(record.cadence ?? ''))
      const sample: RunMetricSample = {
        offsetSec,
        heartRate: numberOrNull(String(record.heart_rate ?? '')),
        paceSec: speed && speed > 0 ? Math.round(1000 / speed) : null,
        cadence: rawCadence === null ? null : normalizeCadence(rawCadence)
      }
      return sample.heartRate !== null || sample.paceSec !== null || sample.cadence !== null ? sample : null
    })
    .filter((sample): sample is RunMetricSample => Boolean(sample))

  return downsampleMetricSamples(rawSamples)
}

function downsampleMetricSamples(samples: RunMetricSample[]) {
  if (samples.length <= 120) return samples
  const stride = Math.ceil(samples.length / 120)
  return samples.filter((_, index) => index % stride === 0)
}

function buildRoutePoints(records: any[], startValue: unknown): RunRoutePoint[] {
  const startDate = startValue instanceof Date ? startValue : new Date(String(startValue ?? ''))
  if (!Number.isFinite(startDate.getTime())) return []

  const rawPoints = records
    .map((record: any) => {
      const timestamp = record.timestamp instanceof Date ? record.timestamp : new Date(String(record.timestamp ?? ''))
      if (!Number.isFinite(timestamp.getTime())) return null
      const latitude = decodeCoordinate(record.position_lat ?? record.latitude)
      const longitude = decodeCoordinate(record.position_long ?? record.longitude)
      if (latitude === null || longitude === null) return null
      const altitude = numberOrNull(String(record.enhanced_altitude ?? record.altitude ?? ''))
      return {
        offsetSec: Math.max(0, Math.round((timestamp.getTime() - startDate.getTime()) / 1000)),
        latitude,
        longitude,
        altitude
      }
    })
    .filter((point): point is RunRoutePoint => Boolean(point))

  return downsampleRoutePoints(rawPoints)
}

function downsampleRoutePoints(points: RunRoutePoint[]) {
  if (points.length <= 240) return points
  const stride = Math.ceil(points.length / 240)
  const sampled = points.filter((_, index) => index % stride === 0)
  const last = points.at(-1)
  if (last && sampled.at(-1) !== last) sampled.push(last)
  return sampled
}

function decodeCoordinate(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  if (Math.abs(number) <= 180) return number
  return (number * 180) / 2147483648
}

function toIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
}

function toIsoDateTime(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function numberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRpe(value: number | null) {
  if (value === null || value <= 0) return null
  return Math.max(1, Math.min(10, Math.round(value)))
}

function normalizeCadence(value: number): number {
  return Math.round(value < 120 ? value * 2 : value)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

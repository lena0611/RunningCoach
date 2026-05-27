import type { ExtractedRunData, FastSegment, Lap, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { createSessionTitle } from '@/features/create-session-title/createSessionTitle'
import { inferCourseType } from '@/features/infer-course-type/inferCourseType'
import { inferRunType } from '@/features/infer-run-type/inferRunType'

export type HealthKitRunCandidate = {
  externalId: string
  sourceName: string | null
  date: string
  startAt: string
  endAt: string
  durationSec: number | null
  distanceKm: number | null
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
  rpe: number | null
  routeAvailable: boolean
  laps: Lap[]
  fastSegments: FastSegment[]
  metricSamples: RunMetricSample[]
  routePoints: RunRoutePoint[]
  rawAvailability: {
    workout: boolean
    heartRate: boolean
    route: boolean
    cadence: boolean
    runningDynamics: boolean
  }
}

type HealthKitBridgeHandlers = {
  onRuns: (runs: HealthKitRunCandidate[]) => void
  onRunUpdate: (run: HealthKitRunCandidate) => void
  onError: (message: string) => void
  onRunUpdateError: (externalId: string | null, message: string) => void
}

declare global {
  interface Window {
    RunContextHealthKit?: {
      receiveRuns: (runs: HealthKitRunCandidate[]) => void
      receiveRunUpdate: (run: HealthKitRunCandidate) => void
      receiveError: (message: string) => void
      receiveRunUpdateError: (externalId: string | null, message: string) => void
    }
    webkit?: {
      messageHandlers?: {
        runContextHealthKit?: {
          postMessage: (message: unknown) => void
        }
        runContextWeatherKit?: {
          postMessage: (message: unknown) => void
        }
        runContextHaptics?: {
          postMessage: (message: unknown) => void
        }
      }
    }
  }
}

export function registerHealthKitBridge(handlers: HealthKitBridgeHandlers) {
  window.RunContextHealthKit = {
    receiveRuns(runs) {
      handlers.onRuns(runs.map(normalizeCandidate))
    },
    receiveRunUpdate(run) {
      handlers.onRunUpdate(normalizeCandidate(run))
    },
    receiveError(message) {
      handlers.onError(message || 'HealthKit 가져오기 실패')
    },
    receiveRunUpdateError(externalId, message) {
      handlers.onRunUpdateError(externalId, message || 'HealthKit 세션 갱신 실패')
    }
  }
}

export function unregisterHealthKitBridge() {
  delete window.RunContextHealthKit
}

export function requestHealthKitRuns(days = 14) {
  const handler = window.webkit?.messageHandlers?.runContextHealthKit
  if (!handler) {
    throw new Error('iOS HealthKit 브리지가 연결되어 있지 않습니다. 웹에서는 FIT 업로드를 사용하세요.')
  }

  handler.postMessage({
    type: 'requestRecentRunningWorkouts',
    days
  })
}

export function requestHealthKitRunUpdate(externalId: string) {
  const handler = window.webkit?.messageHandlers?.runContextHealthKit
  if (!handler) {
    throw new Error('iOS HealthKit 브리지가 연결되어 있지 않습니다. 웹에서는 FIT 업로드를 사용하세요.')
  }

  handler.postMessage({
    type: 'requestRunningWorkoutByExternalId',
    externalId
  })
}

export function toExtractedRunData(candidate: HealthKitRunCandidate, weeklyPattern: string[] = []): ExtractedRunData {
  const distanceKm = candidate.distanceKm ?? 0
  const durationSec = candidate.durationSec
  const type = inferRunType({
    distanceKm,
    avgPaceSec: candidate.avgPaceSec ?? (distanceKm > 0 && durationSec ? Math.round(durationSec / distanceKm) : null),
    avgHeartRate: candidate.avgHeartRate,
    laps: candidate.laps ?? [],
    fastSegments: candidate.fastSegments ?? [],
    metricSamples: candidate.metricSamples ?? [],
    routePoints: candidate.routePoints ?? [],
    weeklyPattern,
    date: candidate.date
  })
  const elevationGainM = candidate.elevationGainM
  const elevationLossM = candidate.elevationLossM
  return {
    externalId: candidate.externalId,
    sessionTitle: createSessionTitle({
      date: candidate.date || new Date().toISOString().slice(0, 10),
      startAt: candidate.startAt,
      type,
      weeklyPattern
    }),
    date: candidate.date || new Date().toISOString().slice(0, 10),
    type,
    distanceKm,
    durationSec,
    avgPaceSec: candidate.avgPaceSec ?? (distanceKm > 0 && durationSec ? Math.round(durationSec / distanceKm) : null),
    avgHeartRate: candidate.avgHeartRate,
    maxHeartRate: candidate.maxHeartRate,
    cadence: candidate.cadence,
    activeEnergyKcal: candidate.activeEnergyKcal,
    temperature: candidate.temperature,
    humidity: candidate.humidity,
    windMps: candidate.windMps,
    elevationGainM,
    elevationLossM,
    courseType: inferCourseType({ distanceKm, elevationGainM, elevationLossM, routePoints: candidate.routePoints ?? [] }),
    rpe: candidate.rpe,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: createMemo(candidate),
    laps: candidate.laps ?? [],
    fastSegments: candidate.fastSegments ?? [],
    metricSamples: candidate.metricSamples ?? [],
    routePoints: candidate.routePoints ?? [],
    tags: ['healthkit', 'type:auto']
  }
}

function normalizeCandidate(candidate: HealthKitRunCandidate): HealthKitRunCandidate {
  return {
    ...candidate,
    distanceKm: normalizeNumber(candidate.distanceKm),
    durationSec: normalizeNumber(candidate.durationSec),
    avgPaceSec: normalizeNumber(candidate.avgPaceSec),
    avgHeartRate: normalizeNumber(candidate.avgHeartRate),
    maxHeartRate: normalizeNumber(candidate.maxHeartRate),
    cadence: normalizeNumber(candidate.cadence),
    activeEnergyKcal: normalizeNumber(candidate.activeEnergyKcal),
    temperature: normalizeNumber(candidate.temperature),
    humidity: normalizeNumber(candidate.humidity),
    windMps: normalizeNumber(candidate.windMps),
    elevationGainM: normalizeNumber(candidate.elevationGainM),
    elevationLossM: normalizeNumber(candidate.elevationLossM),
    rpe: normalizeNumber(candidate.rpe),
    laps: candidate.laps ?? [],
    fastSegments: candidate.fastSegments ?? [],
    metricSamples: normalizeMetricSamples(candidate.metricSamples ?? []),
    routePoints: normalizeRoutePoints(candidate.routePoints ?? []),
    rawAvailability: {
      workout: Boolean(candidate.rawAvailability?.workout),
      heartRate: Boolean(candidate.rawAvailability?.heartRate),
      route: Boolean(candidate.rawAvailability?.route),
      cadence: Boolean(candidate.rawAvailability?.cadence),
      runningDynamics: Boolean(candidate.rawAvailability?.runningDynamics)
    }
  }
}

function normalizeMetricSamples(samples: RunMetricSample[]) {
  return samples
    .map((sample) => ({
      offsetSec: normalizeNumber(sample.offsetSec) ?? 0,
      heartRate: normalizeNumber(sample.heartRate),
      paceSec: normalizeNumber(sample.paceSec),
      cadence: normalizeNumber(sample.cadence)
    }))
    .filter((sample) => Number.isFinite(sample.offsetSec) && (sample.heartRate !== null || sample.paceSec !== null || sample.cadence !== null))
}

function normalizeRoutePoints(points: RunRoutePoint[]) {
  return points
    .map((point) => ({
      offsetSec: normalizeNumber(point.offsetSec) ?? 0,
      latitude: normalizeNumber(point.latitude) ?? Number.NaN,
      longitude: normalizeNumber(point.longitude) ?? Number.NaN,
      altitude: normalizeNumber(point.altitude)
    }))
    .filter((point) => Number.isFinite(point.offsetSec) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
}

function normalizeNumber(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function createMemo(candidate: HealthKitRunCandidate): string {
  const source = candidate.sourceName ? ` (${candidate.sourceName})` : ''
  const missing = []
  if (!candidate.rawAvailability.heartRate) missing.push('심박')
  if (!candidate.rawAvailability.cadence) missing.push('케이던스')
  if (!candidate.rawAvailability.route) missing.push('route')

  const suffix = missing.length ? ` 누락 가능: ${missing.join(', ')}.` : ''
  return `HealthKit 러닝 기록${source} 기반 후보. 저장 전 실제 값을 확인하세요.${suffix}`
}

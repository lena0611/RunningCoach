import type { ExtractedRunData, FastSegment, Lap } from '@/entities/run/model'
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
  routeAvailable: boolean
  laps: Lap[]
  fastSegments: FastSegment[]
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
  onError: (message: string) => void
}

declare global {
  interface Window {
    RunContextHealthKit?: {
      receiveRuns: (runs: HealthKitRunCandidate[]) => void
      receiveError: (message: string) => void
    }
    webkit?: {
      messageHandlers?: {
        runContextHealthKit?: {
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
    receiveError(message) {
      handlers.onError(message || 'HealthKit 가져오기 실패')
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

export function toExtractedRunData(candidate: HealthKitRunCandidate): ExtractedRunData {
  const distanceKm = candidate.distanceKm ?? 0
  const durationSec = candidate.durationSec
  return {
    externalId: candidate.externalId,
    sessionTitle: '',
    date: candidate.date || new Date().toISOString().slice(0, 10),
    type: inferRunType({
      distanceKm,
      avgPaceSec: candidate.avgPaceSec ?? (distanceKm > 0 && durationSec ? Math.round(durationSec / distanceKm) : null),
      avgHeartRate: candidate.avgHeartRate,
      laps: candidate.laps ?? [],
      fastSegments: candidate.fastSegments ?? [],
      date: candidate.date
    }),
    distanceKm,
    durationSec,
    avgPaceSec: candidate.avgPaceSec ?? (distanceKm > 0 && durationSec ? Math.round(durationSec / distanceKm) : null),
    avgHeartRate: candidate.avgHeartRate,
    maxHeartRate: candidate.maxHeartRate,
    cadence: candidate.cadence,
    temperature: candidate.temperature,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: candidate.routeAvailable ? 'Mixed' : 'Unknown',
    rpe: null,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: createMemo(candidate),
    laps: candidate.laps ?? [],
    fastSegments: candidate.fastSegments ?? [],
    tags: ['healthkit']
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
    laps: candidate.laps ?? [],
    fastSegments: candidate.fastSegments ?? [],
    rawAvailability: {
      workout: Boolean(candidate.rawAvailability?.workout),
      heartRate: Boolean(candidate.rawAvailability?.heartRate),
      route: Boolean(candidate.rawAvailability?.route),
      cadence: Boolean(candidate.rawAvailability?.cadence),
      runningDynamics: Boolean(candidate.rawAvailability?.runningDynamics)
    }
  }
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

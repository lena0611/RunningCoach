import type { ExtractedRunData, FastSegment, Lap, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { createSessionTitle } from '@/features/create-session-title/createSessionTitle'
import { inferCourseType } from '@/features/infer-course-type/inferCourseType'
import { inferRunType } from '@/features/infer-run-type/inferRunType'
import { sanitizeCadence } from '@/shared/lib/cadence'
import { sanitizeAltitudeSeries } from '@/shared/lib/altitude'
import type { HeartRateModel } from '@/shared/lib/heartRateZones'
import { SELF_RACE_TAG } from '@/entities/competition/model'

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
  /**
   * #235/§10: 네이티브가 workout metadata(PaceLABCompetition=="self-race")로 채운 레이싱 플래그.
   * 구버전 네이티브는 이 필드를 안 보내므로 normalize 가 Boolean(undefined)=false 로 안전 흡수한다.
   */
  isSelfRace: boolean
}

export type HealthKitRunUpdateRequest = {
  externalId: string | null
  date: string
  startAt: string | null
  endAt: string | null
  distanceKm: number
  durationSec: number | null
}

export type HealthKitRunRangeRequest = {
  startDate: string
  endDate: string
}

// VO2max는 워크아웃에 묶이지 않는 프로필 레벨 최신 샘플이라 러닝 후보 흐름과 분리한다.
export type HealthKitVo2MaxSample = {
  value: number | null
  unit: string | null
  sampleDate: string | null
  sourceName: string | null
}

type HealthKitBridgeHandlers = {
  onRuns: (runs: HealthKitRunCandidate[]) => void
  onRunUpdate: (run: HealthKitRunCandidate) => void
  onHealthKitChanged: (reason?: string) => void
  onError: (message: string) => void
  onRunUpdateError: (externalId: string | null, message: string) => void
  onVo2Max?: (sample: HealthKitVo2MaxSample) => void
  onVo2MaxError?: (message: string) => void
}

declare global {
  interface Window {
    RunContextHealthKit?: {
      receiveRuns: (runs: HealthKitRunCandidate[]) => void
      receiveRunUpdate: (run: HealthKitRunCandidate) => void
      receiveHealthKitChanged: (reason?: string) => void
      receiveError: (message: string) => void
      receiveRunUpdateError: (externalId: string | null, message: string) => void
      receiveVo2Max: (sample: HealthKitVo2MaxSample) => void
      receiveVo2MaxError: (message: string) => void
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
        runContextNotifications?: {
          postMessage: (message: unknown) => void
        }
        runContextAppSecurity?: {
          postMessage: (message: unknown) => void
        }
        runContextAuth?: {
          postMessage: (message: unknown) => void
        }
        runContextLiveRun?: {
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
    receiveHealthKitChanged(reason) {
      handlers.onHealthKitChanged(reason)
    },
    receiveError(message) {
      handlers.onError(message || 'HealthKit 가져오기 실패')
    },
    receiveRunUpdateError(externalId, message) {
      handlers.onRunUpdateError(externalId, message || 'HealthKit 세션 갱신 실패')
    },
    receiveVo2Max(sample) {
      handlers.onVo2Max?.(normalizeVo2MaxSample(sample))
    },
    receiveVo2MaxError(message) {
      handlers.onVo2MaxError?.(message || 'HealthKit VO2max 조회 실패')
    }
  }
}

function normalizeVo2MaxSample(sample: HealthKitVo2MaxSample | null | undefined): HealthKitVo2MaxSample {
  return {
    value: normalizeNumber(sample?.value ?? null),
    unit: typeof sample?.unit === 'string' ? sample.unit : null,
    sampleDate: typeof sample?.sampleDate === 'string' ? sample.sampleDate : null,
    sourceName: typeof sample?.sourceName === 'string' ? sample.sourceName : null
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

export function requestHealthKitRunsInRange(range: HealthKitRunRangeRequest) {
  const handler = window.webkit?.messageHandlers?.runContextHealthKit
  if (!handler) {
    throw new Error('iOS HealthKit 브리지가 연결되어 있지 않습니다. 웹에서는 FIT 업로드를 사용하세요.')
  }

  handler.postMessage({
    type: 'requestRunningWorkoutsInRange',
    startDate: range.startDate,
    endDate: range.endDate
  })
}

export function requestHealthKitRunUpdate(run: HealthKitRunUpdateRequest) {
  const handler = window.webkit?.messageHandlers?.runContextHealthKit
  if (!handler) {
    throw new Error('iOS HealthKit 브리지가 연결되어 있지 않습니다. 웹에서는 FIT 업로드를 사용하세요.')
  }

  handler.postMessage({
    type: 'requestRunningWorkoutByExternalId',
    externalId: run.externalId || null,
    date: run.date,
    startAt: run.startAt || null,
    endAt: run.endAt || null,
    distanceKm: run.distanceKm,
    durationSec: run.durationSec
  })
}

export function requestLatestVo2Max() {
  const handler = window.webkit?.messageHandlers?.runContextHealthKit
  if (!handler) {
    throw new Error('iOS HealthKit 브리지가 연결되어 있지 않습니다. VO2max는 iOS 앱에서만 가져올 수 있습니다.')
  }

  handler.postMessage({ type: 'requestLatestVo2Max' })
}

export function isHealthKitBridgeAvailable(): boolean {
  return Boolean(window.webkit?.messageHandlers?.runContextHealthKit)
}

export function toExtractedRunData(
  candidate: HealthKitRunCandidate,
  weeklyPattern: string[] = [],
  heartRateModel: HeartRateModel | null = null
): ExtractedRunData {
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
    heartRateModel,
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
    startAt: candidate.startAt || null,
    endAt: candidate.endAt || null,
    type,
    distanceKm,
    durationSec,
    avgPaceSec: candidate.avgPaceSec ?? (distanceKm > 0 && durationSec ? Math.round(durationSec / distanceKm) : null),
    avgHeartRate: candidate.avgHeartRate,
    maxHeartRate: candidate.maxHeartRate,
    cadence: sanitizeCadence(candidate.cadence),
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
    // #235/§10: 레이싱 워크아웃은 '생성 시점부터' self-race 태그를 박아, 저장 직후 matchSessionIntent 의
    // 세션·의도 매칭에서 제외되게 한다(linkSelfRaceResults 지연 부착은 이미 처방 세션을 소비한 뒤라 늦음).
    tags: candidate.isSelfRace ? ['healthkit', 'type:auto', SELF_RACE_TAG] : ['healthkit', 'type:auto']
  }
}

function normalizeCandidate(candidate: HealthKitRunCandidate): HealthKitRunCandidate {
  return {
    ...candidate,
    startAt: typeof candidate.startAt === 'string' ? candidate.startAt : '',
    endAt: typeof candidate.endAt === 'string' ? candidate.endAt : '',
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
    laps: (candidate.laps ?? []).map((lap) => ({ ...lap, cadence: sanitizeCadence(lap.cadence) })),
    fastSegments: candidate.fastSegments ?? [],
    metricSamples: normalizeMetricSamples(candidate.metricSamples ?? []),
    routePoints: normalizeRoutePoints(candidate.routePoints ?? []),
    rawAvailability: {
      workout: Boolean(candidate.rawAvailability?.workout),
      heartRate: Boolean(candidate.rawAvailability?.heartRate),
      route: Boolean(candidate.rawAvailability?.route),
      cadence: Boolean(candidate.rawAvailability?.cadence),
      runningDynamics: Boolean(candidate.rawAvailability?.runningDynamics)
    },
    // 구버전 네이티브 하위호환: 필드 미전송 → Boolean(undefined)=false 로 흡수(레이싱 아님).
    isSelfRace: Boolean(candidate.isSelfRace)
  }
}

function normalizeMetricSamples(samples: RunMetricSample[]) {
  return samples
    .map((sample) => ({
      offsetSec: normalizeNumber(sample.offsetSec) ?? 0,
      heartRate: normalizeNumber(sample.heartRate),
      paceSec: normalizeNumber(sample.paceSec),
      cadence: sanitizeCadence(sample.cadence)
    }))
    .filter((sample) => Number.isFinite(sample.offsetSec) && (sample.heartRate !== null || sample.paceSec !== null || sample.cadence !== null))
}

function normalizeRoutePoints(points: RunRoutePoint[]) {
  const normalized = points
    .map((point) => ({
      offsetSec: normalizeNumber(point.offsetSec) ?? 0,
      latitude: normalizeNumber(point.latitude) ?? Number.NaN,
      longitude: normalizeNumber(point.longitude) ?? Number.NaN,
      altitude: normalizeNumber(point.altitude)
    }))
    .filter((point) => Number.isFinite(point.offsetSec) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  // GPS 고도 스파이크 방어: 차트 범위·course type(altitudeRange) 왜곡 방지(#244).
  return sanitizeAltitudeSeries(normalized)
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

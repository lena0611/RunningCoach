/**
 * 스플릿/랩 구분 — 순수 로직.
 *
 * 용어(그릴 확정 2026-07-10):
 * - 스플릿 = 1km 균등 구간(계산본, 페이스 흐름 비교용)
 * - 랩 = 기기/파일이 끊은 실제 구간(인터벌 수행 확인용)
 *
 * run.laps가 사실상 1km 균등(일반 러닝·HealthKit 1km 재분할)이면 스플릿 단일 뷰로 접고,
 * 비균등(인터벌·마일 오토랩)이면 랩 뷰와 함께 1km 스플릿을 여기서 파생 계산한다(저장하지 않음).
 *
 * #397 래칫: shared 는 entities 를 import 하지 않는다 — 아래 구조적 타입은 entities/run/model 의
 * Lap/RunMetricSample/RunRoutePoint 와 구조 호환이라 호출부는 도메인 타입을 그대로 넘긴다.
 */
export type LapLike = {
  index: number
  distanceKm: number | null
  paceSec: number | null
  avgHeartRate: number | null
  cadence: number | null
}

type MetricSampleLike = {
  offsetSec: number
  heartRate: number | null
  paceSec: number | null
  cadence: number | null
}

type RoutePointLike = {
  offsetSec: number
  latitude: number
  longitude: number
}

const UNIFORM_MIN_KM = 0.95
const UNIFORM_MAX_KM = 1.05
// 마지막 부분 구간 하한 — 네이티브 buildRouteLaps(100m)와 동일 기준.
const MIN_PARTIAL_SPLIT_M = 100
const SPLIT_M = 1000

/** run.laps가 "1km 균등 스플릿과 사실상 동일"한가. true면 랩 탭을 접는다. */
export function areLapsUniformKm(laps: ReadonlyArray<Pick<LapLike, 'distanceKm'>>): boolean {
  if (laps.length < 2) return true
  const body = laps.slice(0, -1)
  if (body.some((lap) => lap.distanceKm === null)) return true
  if (!body.every((lap) => (lap.distanceKm as number) >= UNIFORM_MIN_KM && (lap.distanceKm as number) <= UNIFORM_MAX_KM)) {
    return false
  }
  const last = laps[laps.length - 1]
  return last.distanceKm === null || last.distanceKm <= UNIFORM_MAX_KM
}

type TrackPoint = { offsetSec: number; cumMeter: number }

/**
 * 1km 균등 스플릿을 경로(우선) 또는 페이스 샘플(fallback)에서 파생 계산한다.
 * 계산 불가(경로·페이스 샘플 없음)면 빈 배열 — 호출부는 탭 없이 랩 단일 뷰로 처리한다.
 */
export function computeKmSplits(input: {
  routePoints?: ReadonlyArray<RoutePointLike> | null
  metricSamples?: ReadonlyArray<MetricSampleLike> | null
}): LapLike[] {
  const route = input.routePoints ?? []
  const samples = input.metricSamples ?? []
  const track = route.length >= 2 ? trackFromRoute(route) : trackFromSamples(samples)
  if (track.length < 2) return []
  return splitsFromTrack(track, samples)
}

function trackFromRoute(route: ReadonlyArray<RoutePointLike>): TrackPoint[] {
  const track: TrackPoint[] = [{ offsetSec: route[0].offsetSec, cumMeter: 0 }]
  let cum = 0
  for (let i = 1; i < route.length; i += 1) {
    cum += haversineMeters(route[i - 1], route[i])
    track.push({ offsetSec: route[i].offsetSec, cumMeter: cum })
  }
  return track
}

function trackFromSamples(samples: ReadonlyArray<MetricSampleLike>): TrackPoint[] {
  const paced = samples.filter((sample) => sample.paceSec !== null && sample.paceSec > 0)
  if (paced.length < 2) return []
  const track: TrackPoint[] = [{ offsetSec: paced[0].offsetSec, cumMeter: 0 }]
  let cum = 0
  for (let i = 1; i < paced.length; i += 1) {
    const dt = paced[i].offsetSec - paced[i - 1].offsetSec
    if (dt <= 0) continue
    // paceSec = 초/km → 속도 m/s = 1000/paceSec. 구간 페이스는 구간 끝 샘플 기준.
    cum += dt * (SPLIT_M / (paced[i].paceSec as number))
    track.push({ offsetSec: paced[i].offsetSec, cumMeter: cum })
  }
  return track
}

function splitsFromTrack(track: TrackPoint[], samples: ReadonlyArray<MetricSampleLike>): LapLike[] {
  const splits: LapLike[] = []
  let startOffset = track[0].offsetSec
  let startMeter = 0
  for (const point of track) {
    if (point.cumMeter - startMeter >= SPLIT_M) {
      splits.push(buildSplit(splits.length + 1, startOffset, point.offsetSec, point.cumMeter - startMeter, samples))
      startOffset = point.offsetSec
      startMeter = point.cumMeter
    }
  }
  const last = track[track.length - 1]
  if (last.cumMeter - startMeter >= MIN_PARTIAL_SPLIT_M) {
    splits.push(buildSplit(splits.length + 1, startOffset, last.offsetSec, last.cumMeter - startMeter, samples))
  }
  return splits
}

function buildSplit(index: number, startOffset: number, endOffset: number, meters: number, samples: ReadonlyArray<MetricSampleLike>): LapLike {
  const distanceKm = Math.round((meters / 1000) * 100) / 100
  const durationSec = Math.max(endOffset - startOffset, 1)
  return {
    index,
    distanceKm,
    paceSec: distanceKm > 0 ? Math.round(durationSec / distanceKm) : null,
    avgHeartRate: averageInRange(samples, 'heartRate', startOffset, endOffset),
    cadence: averageInRange(samples, 'cadence', startOffset, endOffset)
  }
}

function averageInRange(samples: ReadonlyArray<MetricSampleLike>, key: 'heartRate' | 'cadence', startOffset: number, endOffset: number): number | null {
  const values = samples
    .filter((sample) => sample.offsetSec > startOffset && sample.offsetSec <= endOffset)
    .map((sample) => sample[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function haversineMeters(a: RoutePointLike, b: RoutePointLike): number {
  const radiusM = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return radiusM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

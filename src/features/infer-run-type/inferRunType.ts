import type { FastSegment, Lap, RunMetricSample, RunRoutePoint, RunType } from '@/entities/run/model'
import {
  isHeartRateAtOrBelowZone2,
  isRecoveryHeartRateZone,
  type HeartRateModel,
  type HeartRateZoneDefinition
} from '@/shared/lib/heartRateZones'

type InferRunTypeInput = {
  date: string
  distanceKm: number
  avgPaceSec: number | null
  avgHeartRate: number | null
  laps: Lap[]
  fastSegments: FastSegment[]
  metricSamples?: RunMetricSample[]
  routePoints?: RunRoutePoint[]
  weeklyPattern?: string[]
  // 개인 심박 모델. 자동 유형 판정의 HR 기준은 상수 대신 이 모델에서 파생한다.
  // 미제공/근거부족(zones 비어있음)이면 HR 기반 분기를 건너뛰고 페이스/거리/스트라이드 패턴으로만 판정한다.
  heartRateModel?: HeartRateModel | null
}

// inferRunType 내부에서 HR 판정에 쓰는 개인 기준 컨텍스트. easyCeilingBpm/z4MinBpm이 null이면 해당 HR 분기를 건너뛴다.
type HrContext = {
  zones: HeartRateZoneDefinition[]
  easyCeilingBpm: number | null
  z4MinBpm: number | null
}

function toHrContext(model: HeartRateModel | null | undefined): HrContext {
  const zones = model?.zones ?? []
  return {
    zones,
    easyCeilingBpm: model?.easyCeilingBpm ?? null,
    z4MinBpm: zones.find((zone) => zone.zone === 'Z4')?.minBpm ?? null
  }
}

const strideTimingTolerance = {
  minDurationSec: 6,
  maxDurationSec: 45,
  minGapSec: 55,
  maxGapSec: 210,
  minWarmupSec: 240
}

export function inferRunType(input: InferRunTypeInput): RunType {
  const distanceKm = Number(input.distanceKm || 0)
  const avgPaceSec = input.avgPaceSec
  const hr = toHrContext(input.heartRateModel)
  const easyRatio = getEasyRatio(input.laps, distanceKm, avgPaceSec, input.avgHeartRate, hr)
  const fastSegments = [...input.fastSegments, ...deriveRouteFastSegments(input.routePoints ?? [])]
  const fastSegmentCount = countUsefulFastSegments(fastSegments)
  const hasStridesPattern = hasStrideIntervalPattern(fastSegments)
  const hasMetricStridesPattern = hasStrideMetricPattern(input.metricSamples ?? [], avgPaceSec, input.avgHeartRate, hr)
  const hasStrideSplitsPattern = hasStrideLapPattern(input.laps, hr)
  const tempoDistanceKm = getSustainedTempoDistance(input.laps, distanceKm, avgPaceSec)
  const isSaturday = getWeekday(input.date) === 6
  const scheduledWorkout = getScheduledWorkout(input.date, input.weeklyPattern ?? [])

  if (distanceKm <= 0) return 'Unknown'

  if (distanceKm >= 10) {
    if (isSaturday || distanceKm >= 12) {
      return isSteadyLong(input.laps, avgPaceSec, input.avgHeartRate, hr) ? 'Steady Long' : 'LSD'
    }
  }

  if (distanceKm <= 10 && easyRatio >= 0.45 && (hasStridesPattern || hasMetricStridesPattern || hasStrideSplitsPattern || (fastSegmentCount >= 4 && isScheduledStrides(scheduledWorkout)))) {
    return 'Easy + Strides'
  }

  if (isHeartRateEasy(input.avgHeartRate, hr) && easyRatio >= 0.65) {
    return isRecoveryHeartRate(input.avgHeartRate, hr) && (avgPaceSec === null || avgPaceSec >= 480) ? 'Recovery' : 'Easy'
  }

  if (tempoDistanceKm >= 3 || (distanceKm >= 4 && avgPaceSec !== null && avgPaceSec <= 390)) return 'Tempo'

  if (avgPaceSec !== null && avgPaceSec >= 480 && (input.avgHeartRate === null || hr.easyCeilingBpm === null || input.avgHeartRate <= hr.easyCeilingBpm - 5)) return 'Recovery'

  if (easyRatio >= 0.65 || (avgPaceSec !== null && avgPaceSec >= 390)) return 'Easy'

  return 'Unknown'
}

function countUsefulFastSegments(segments: FastSegment[]) {
  return segments.filter((segment) => {
    const durationSec = Number(segment.durationSec)
    const paceSec = Number(segment.avgPaceSec ?? segment.bestPaceSec)
    const distanceKm = Number(segment.distanceKm)
    return (
      Number.isFinite(durationSec) &&
      durationSec >= strideTimingTolerance.minDurationSec &&
      durationSec <= strideTimingTolerance.maxDurationSec &&
      Number.isFinite(distanceKm) &&
      distanceKm >= 0.02 &&
      Number.isFinite(paceSec) &&
      paceSec <= 345
    )
  }).length
}

function getEasyRatio(laps: Lap[], distanceKm: number, avgPaceSec: number | null, avgHeartRate: number | null, hr: HrContext) {
  const segments = getLapSegments(laps)
  if (segments.length) {
    const total = segments.reduce((sum, lap) => sum + lap.distanceKm, 0)
    const easy = segments
      .filter((lap) => isLapEasy(lap, avgHeartRate, hr))
      .reduce((sum, lap) => sum + lap.distanceKm, 0)
    return total > 0 ? easy / total : 0
  }

  if (isHeartRateEasy(avgHeartRate, hr)) return 1
  if (distanceKm > 0 && avgPaceSec !== null) return avgPaceSec >= 390 ? 1 : 0
  return 0
}

function isLapEasy(lap: { paceSec: number; avgHeartRate: number | null }, fallbackHeartRate: number | null, hr: HrContext) {
  const heartRate = lap.avgHeartRate ?? fallbackHeartRate
  if (isHeartRateEasy(heartRate, hr)) return true
  if (hr.easyCeilingBpm !== null && heartRate !== null && heartRate > hr.easyCeilingBpm + 5) return false
  return lap.paceSec >= 390
}

// 개인 심박 존이 없으면(근거 부족) HR로 Easy를 단정하지 않는다.
function isHeartRateEasy(value: number | null, hr: HrContext) {
  if (!hr.zones.length) return false
  return isHeartRateAtOrBelowZone2(value, hr.zones)
}

function isRecoveryHeartRate(value: number | null, hr: HrContext) {
  if (!hr.zones.length) return false
  return isRecoveryHeartRateZone(value, hr.zones)
}

function hasStrideIntervalPattern(segments: FastSegment[]) {
  const useful = segments
    .filter((segment) => {
      const durationSec = Number(segment.durationSec)
      const startSec = Number(segment.startSec)
      const paceSec = Number(segment.avgPaceSec ?? segment.bestPaceSec)
      return (
        Number.isFinite(startSec) &&
        Number.isFinite(durationSec) &&
        durationSec >= strideTimingTolerance.minDurationSec &&
        durationSec <= strideTimingTolerance.maxDurationSec &&
        Number.isFinite(paceSec) &&
        paceSec <= 345
      )
    })
    .sort((a, b) => Number(a.startSec) - Number(b.startSec))

  if (useful.length < 4) return false
  const warmupStart = Number(useful[0].startSec)
  const gaps = useful.slice(1).map((segment, index) => Number(segment.startSec) - Number(useful[index].startSec))
  const intervalLikeGaps = gaps.filter((gap) => gap >= strideTimingTolerance.minGapSec && gap <= strideTimingTolerance.maxGapSec).length
  const hasWorkoutWarmup = Number.isFinite(warmupStart) && warmupStart >= strideTimingTolerance.minWarmupSec

  return hasWorkoutWarmup && intervalLikeGaps >= Math.min(4, gaps.length)
}

function hasStrideMetricPattern(samples: RunMetricSample[], avgPaceSec: number | null, avgHeartRate: number | null, hr: HrContext) {
  const clean = samples
    .filter((sample) => Number.isFinite(sample.offsetSec) && (isUsablePace(sample.paceSec) || isUsableCadence(sample.cadence)))
    .sort((a, b) => a.offsetSec - b.offsetSec)
  if (clean.length < 12) return false

  const paceValues = clean.map((sample) => sample.paceSec).filter(isUsablePace)
  if (paceValues.length < Math.max(8, clean.length * 0.25)) return false

  const medianPace = median(paceValues)
  const paceThreshold = medianPace === null
    ? 360
    : Math.min(365, Math.max(300, medianPace - 35))

  const fastSamples = clean.filter((sample) => {
    const paceFast = isUsablePace(sample.paceSec) && sample.paceSec <= paceThreshold
    const heartRateOk = sample.heartRate === null || hr.easyCeilingBpm === null || sample.heartRate <= hr.easyCeilingBpm + 12
    return heartRateOk && paceFast
  })
  if (fastSamples.length < 4) return false

  const clusters = clusterFastSamples(fastSamples)
  if (clusters.length < 4) return false

  const firstStart = clusters[0].startSec
  const starts = clusters.map((cluster) => cluster.startSec)
  const gaps = starts.slice(1).map((start, index) => start - starts[index])
  const intervalLikeGaps = gaps.filter((gap) => gap >= 40 && gap <= 260).length
  const hasWarmup = firstStart >= strideTimingTolerance.minWarmupSec
  const notTempo = avgHeartRate === null || hr.easyCeilingBpm === null || avgHeartRate <= hr.easyCeilingBpm
  const easyAveragePace = avgPaceSec === null || avgPaceSec >= 390

  return hasWarmup && notTempo && easyAveragePace && intervalLikeGaps >= Math.min(4, gaps.length)
}

function clusterFastSamples(samples: RunMetricSample[]) {
  const clusters: Array<{ startSec: number; endSec: number; count: number }> = []
  for (const sample of samples) {
    const last = clusters.at(-1)
    if (last && sample.offsetSec - last.endSec <= 55) {
      last.endSec = sample.offsetSec
      last.count += 1
    } else {
      clusters.push({ startSec: sample.offsetSec, endSec: sample.offsetSec, count: 1 })
    }
  }
  return clusters.filter((cluster) => {
    const duration = cluster.endSec - cluster.startSec
    return duration <= 80 || cluster.count <= 3
  })
}

function hasStrideLapPattern(laps: Lap[], hr: HrContext) {
  const segments = getLapSegments(laps)
    .map((lap) => ({
      ...lap,
      durationSec: lap.distanceKm * lap.paceSec
    }))
    .filter((lap) => Number.isFinite(lap.durationSec) && lap.durationSec > 0)

  if (segments.length < 8) return false

  const shortFastIndexes = segments
    .map((lap, index) => ({ lap, index }))
    .filter(({ lap }) => {
      const isShort = lap.durationSec >= strideTimingTolerance.minDurationSec && lap.durationSec <= strideTimingTolerance.maxDurationSec
      const isFast = lap.paceSec <= 345
      return isShort && isFast
    })

  if (shortFastIndexes.length < 4) return false

  const hasEasyBookends = segments.some((lap, index) => index < 3 && lap.durationSec >= 180 && isLapEasy(lap, null, hr)) ||
    segments.some((lap, index) => index >= segments.length - 3 && lap.durationSec >= 180 && isLapEasy(lap, null, hr))

  const alternatingRecoveries = shortFastIndexes.filter(({ index }) => {
    const next = segments[index + 1]
    if (!next) return false
    return next.durationSec >= 45 && next.durationSec <= 150 && next.paceSec > segments[index].paceSec + 40
  }).length

  return hasEasyBookends && alternatingRecoveries >= Math.min(4, shortFastIndexes.length)
}

function deriveRouteFastSegments(points: RunRoutePoint[]): FastSegment[] {
  const sorted = points
    .filter((point) => Number.isFinite(point.offsetSec) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .sort((a, b) => a.offsetSec - b.offsetSec)
  if (sorted.length < 8) return []

  const paceSamples: Array<{ startSec: number; endSec: number; distanceKm: number; paceSec: number }> = []
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const point = sorted[index]
    const deltaSec = point.offsetSec - previous.offsetSec
    if (deltaSec < 5 || deltaSec > 35) continue
    const distanceKm = distanceMeters(previous.latitude, previous.longitude, point.latitude, point.longitude) / 1000
    if (distanceKm < 0.015) continue
    const paceSec = deltaSec / distanceKm
    if (!isUsablePace(paceSec)) continue
    paceSamples.push({
      startSec: previous.offsetSec,
      endSec: point.offsetSec,
      distanceKm,
      paceSec
    })
  }

  if (paceSamples.length < 12) return []
  const medianPace = median(paceSamples.map((sample) => sample.paceSec))
  if (medianPace === null) return []
  const fastThreshold = Math.min(350, Math.max(285, medianPace - 55))
  const fastSamples = paceSamples.filter((sample) => sample.paceSec <= fastThreshold)
  if (fastSamples.length < 4) return []

  const clusters: Array<{ startSec: number; endSec: number; distanceKm: number; weightedSec: number; bestPaceSec: number }> = []
  for (const sample of fastSamples) {
    const last = clusters.at(-1)
    if (last && sample.startSec - last.endSec <= 30) {
      last.endSec = sample.endSec
      last.distanceKm += sample.distanceKm
      last.weightedSec += sample.distanceKm * sample.paceSec
      last.bestPaceSec = Math.min(last.bestPaceSec, sample.paceSec)
    } else {
      clusters.push({
        startSec: sample.startSec,
        endSec: sample.endSec,
        distanceKm: sample.distanceKm,
        weightedSec: sample.distanceKm * sample.paceSec,
        bestPaceSec: sample.paceSec
      })
    }
  }

  return clusters
    .map((cluster, index) => {
      const durationSec = cluster.endSec - cluster.startSec
      return {
        index: index + 1,
        startSec: Math.round(cluster.startSec),
        durationSec: Math.round(durationSec),
        distanceKm: Math.round(cluster.distanceKm * 1000) / 1000,
        avgPaceSec: cluster.distanceKm > 0 ? Math.round(cluster.weightedSec / cluster.distanceKm) : null,
        bestPaceSec: Math.round(cluster.bestPaceSec)
      }
    })
    .filter((segment) => {
      const durationSec = Number(segment.durationSec)
      return durationSec >= strideTimingTolerance.minDurationSec && durationSec <= strideTimingTolerance.maxDurationSec
    })
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radiusM = 6371000
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getSustainedTempoDistance(laps: Lap[], distanceKm: number, avgPaceSec: number | null) {
  const segments = getLapSegments(laps)
  if (!segments.length) return avgPaceSec !== null && avgPaceSec <= 390 ? distanceKm : 0

  let best = 0
  let current = 0
  for (const lap of segments) {
    if (lap.paceSec <= 390) {
      current += lap.distanceKm
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

function isSteadyLong(laps: Lap[], avgPaceSec: number | null, avgHeartRate: number | null, hr: HrContext) {
  const easyCeiling = hr.easyCeilingBpm
  const z4Min = hr.z4MinBpm
  const segments = getLapSegments(laps)
  if (!segments.length) {
    if (avgHeartRate !== null && easyCeiling !== null) {
      if (avgHeartRate >= easyCeiling + 5) return true
      if (isHeartRateEasy(avgHeartRate, hr)) return false
    }
    return avgPaceSec !== null && avgPaceSec <= 400
  }

  const total = segments.reduce((sum, lap) => sum + lap.distanceKm, 0)
  const firstHalf = segments.slice(0, Math.ceil(segments.length / 2))
  const secondHalf = segments.slice(Math.floor(segments.length / 2))
  const firstPace = weightedPace(firstHalf)
  const secondPace = weightedPace(secondHalf)
  const paceGainSec = firstPace !== null && secondPace !== null ? firstPace - secondPace : 0
  const firstHeartRate = weightedHeartRate(firstHalf)
  const secondHeartRate = weightedHeartRate(secondHalf)
  const heartRateDrift = firstHeartRate !== null && secondHeartRate !== null ? secondHeartRate - firstHeartRate : 0
  const sessionHeartRate = weightedHeartRate(segments) ?? avgHeartRate
  // 개인 심박 상한이 없으면 HR 기반 비율 신호는 0으로 두고 페이스 신호만 본다.
  const z3PlusRatio = total > 0 && easyCeiling !== null
    ? segments
      .filter((lap) => (lap.avgHeartRate ?? sessionHeartRate ?? 0) >= easyCeiling + 1)
      .reduce((sum, lap) => sum + lap.distanceKm, 0) / total
    : 0
  const z4PlusRatio = total > 0 && z4Min !== null
    ? segments
      .filter((lap) => (lap.avgHeartRate ?? sessionHeartRate ?? 0) >= z4Min)
      .reduce((sum, lap) => sum + lap.distanceKm, 0) / total
    : 0
  const steadyPaceRatio = total > 0
    ? segments
      .filter((lap) => lap.paceSec <= 420)
      .reduce((sum, lap) => sum + lap.distanceKm, 0) / total
    : 0

  if (sessionHeartRate !== null && easyCeiling !== null && sessionHeartRate <= easyCeiling && z3PlusRatio < 0.25 && heartRateDrift <= 8) {
    return false
  }

  if (z4PlusRatio >= 0.15) return true
  if (z3PlusRatio >= 0.45) return true
  if (sessionHeartRate !== null && easyCeiling !== null && sessionHeartRate >= easyCeiling + 4 && paceGainSec >= 8) return true
  if (heartRateDrift >= 10 && paceGainSec >= 8) return true

  if (sessionHeartRate === null && steadyPaceRatio >= 0.55 && paceGainSec >= 15) return true

  return false
}

function getLapSegments(laps: Lap[]) {
  return laps
    .map((lap) => ({
      distanceKm: Number(lap.distanceKm),
      paceSec: Number(lap.paceSec),
      avgHeartRate: typeof lap.avgHeartRate === 'number' && Number.isFinite(lap.avgHeartRate) ? lap.avgHeartRate : null
    }))
    .filter((lap) => Number.isFinite(lap.distanceKm) && lap.distanceKm > 0 && Number.isFinite(lap.paceSec))
}

function isUsablePace(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 180 && value <= 900
}

function isUsableCadence(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 120 && value <= 230
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function weightedPace(laps: Array<{ distanceKm: number; paceSec: number }>) {
  const totalDistance = laps.reduce((sum, lap) => sum + lap.distanceKm, 0)
  if (!totalDistance) return null
  const totalSeconds = laps.reduce((sum, lap) => sum + lap.distanceKm * lap.paceSec, 0)
  return totalSeconds / totalDistance
}

function weightedHeartRate(laps: Array<{ distanceKm: number; avgHeartRate: number | null }>) {
  const heartRateLaps = laps.filter((lap) => lap.avgHeartRate !== null)
  const totalDistance = heartRateLaps.reduce((sum, lap) => sum + lap.distanceKm, 0)
  if (!totalDistance) return null
  return heartRateLaps.reduce((sum, lap) => sum + lap.distanceKm * Number(lap.avgHeartRate), 0) / totalDistance
}

function getWeekday(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay()
}

function getScheduledWorkout(date: string, weeklyPattern: string[]) {
  const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const weekday = getWeekday(date)
  if (weekday === null) return ''
  const dayName = weekdays[weekday]
  const pattern = weeklyPattern.find((item) => item.trim().toLowerCase().startsWith(dayName.toLowerCase()))
  return pattern?.toLowerCase() ?? ''
}

function isScheduledStrides(value: string | undefined) {
  if (!value) return false
  return value.includes('strides') || value.includes('스트라이드')
}

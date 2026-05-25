import type { FastSegment, Lap, RunType } from '@/entities/run/model'

type InferRunTypeInput = {
  date: string
  distanceKm: number
  avgPaceSec: number | null
  avgHeartRate: number | null
  laps: Lap[]
  fastSegments: FastSegment[]
  weeklyPattern?: string[]
}

const easyHeartRateCeiling = 145
const recoveryHeartRateCeiling = 130
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
  const easyRatio = getEasyRatio(input.laps, distanceKm, avgPaceSec, input.avgHeartRate)
  const fastSegmentCount = countUsefulFastSegments(input.fastSegments)
  const hasStridesPattern = hasStrideIntervalPattern(input.fastSegments)
  const tempoDistanceKm = getSustainedTempoDistance(input.laps, distanceKm, avgPaceSec)
  const isSaturday = getWeekday(input.date) === 6
  const scheduledWorkout = getScheduledWorkout(input.date, input.weeklyPattern ?? [])

  if (distanceKm <= 0) return 'Unknown'

  if (distanceKm >= 10) {
    if (isSaturday || distanceKm >= 12) {
      return isSteadyLong(input.laps, avgPaceSec) ? 'Steady Long' : 'LSD'
    }
  }

  if (distanceKm <= 10 && easyRatio >= 0.45 && (hasStridesPattern || (fastSegmentCount >= 4 && isScheduledStrides(scheduledWorkout)))) {
    return 'Easy + Strides'
  }

  if (isHeartRateEasy(input.avgHeartRate) && easyRatio >= 0.65) {
    return isRecoveryHeartRate(input.avgHeartRate) && (avgPaceSec === null || avgPaceSec >= 480) ? 'Recovery' : 'Easy'
  }

  if (tempoDistanceKm >= 3 || (distanceKm >= 4 && avgPaceSec !== null && avgPaceSec <= 390)) return 'Tempo'

  if (avgPaceSec !== null && avgPaceSec >= 480 && (input.avgHeartRate === null || input.avgHeartRate <= 140)) return 'Recovery'

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

function getEasyRatio(laps: Lap[], distanceKm: number, avgPaceSec: number | null, avgHeartRate: number | null) {
  const segments = getLapSegments(laps)
  if (segments.length) {
    const total = segments.reduce((sum, lap) => sum + lap.distanceKm, 0)
    const easy = segments
      .filter((lap) => isLapEasy(lap, avgHeartRate))
      .reduce((sum, lap) => sum + lap.distanceKm, 0)
    return total > 0 ? easy / total : 0
  }

  if (isHeartRateEasy(avgHeartRate)) return 1
  if (distanceKm > 0 && avgPaceSec !== null) return avgPaceSec >= 390 ? 1 : 0
  return 0
}

function isLapEasy(lap: { paceSec: number; avgHeartRate: number | null }, fallbackHeartRate: number | null) {
  const heartRate = lap.avgHeartRate ?? fallbackHeartRate
  if (isHeartRateEasy(heartRate)) return true
  if (heartRate !== null && heartRate > easyHeartRateCeiling + 5) return false
  return lap.paceSec >= 390
}

function isHeartRateEasy(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value <= easyHeartRateCeiling
}

function isRecoveryHeartRate(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value <= recoveryHeartRateCeiling
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

function isSteadyLong(laps: Lap[], avgPaceSec: number | null) {
  const segments = getLapSegments(laps)
  if (!segments.length) return avgPaceSec !== null && avgPaceSec <= 420

  const steadyDistance = segments
    .filter((lap) => lap.paceSec <= 420)
    .reduce((sum, lap) => sum + lap.distanceKm, 0)
  const total = segments.reduce((sum, lap) => sum + lap.distanceKm, 0)
  if (total > 0 && steadyDistance / total >= 0.45) return true

  const firstHalf = segments.slice(0, Math.ceil(segments.length / 2))
  const secondHalf = segments.slice(Math.floor(segments.length / 2))
  const firstPace = weightedPace(firstHalf)
  const secondPace = weightedPace(secondHalf)
  return firstPace !== null && secondPace !== null && secondPace + 10 < firstPace
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

function weightedPace(laps: Array<{ distanceKm: number; paceSec: number }>) {
  const totalDistance = laps.reduce((sum, lap) => sum + lap.distanceKm, 0)
  if (!totalDistance) return null
  const totalSeconds = laps.reduce((sum, lap) => sum + lap.distanceKm * lap.paceSec, 0)
  return totalSeconds / totalDistance
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

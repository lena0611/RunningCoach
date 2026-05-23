import type { FastSegment, Lap, RunType } from '@/entities/run/model'

type InferRunTypeInput = {
  date: string
  distanceKm: number
  avgPaceSec: number | null
  avgHeartRate: number | null
  laps: Lap[]
  fastSegments: FastSegment[]
}

export function inferRunType(input: InferRunTypeInput): RunType {
  const distanceKm = Number(input.distanceKm || 0)
  const avgPaceSec = input.avgPaceSec
  const easyRatio = getEasyDistanceRatio(input.laps, distanceKm, avgPaceSec)
  const fastSegmentCount = countUsefulFastSegments(input.fastSegments)
  const tempoDistanceKm = getSustainedTempoDistance(input.laps, distanceKm, avgPaceSec)
  const isSaturday = getWeekday(input.date) === 6

  if (distanceKm <= 0) return 'Unknown'

  if (distanceKm >= 10) {
    if (isSaturday || distanceKm >= 12) {
      return isSteadyLong(input.laps, avgPaceSec) ? 'Steady Long' : 'LSD'
    }
  }

  if (fastSegmentCount >= 4 && easyRatio >= 0.55 && distanceKm <= 10) return 'Easy + Strides'

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
      durationSec >= 8 &&
      Number.isFinite(distanceKm) &&
      distanceKm >= 0.03 &&
      Number.isFinite(paceSec) &&
      paceSec <= 330
    )
  }).length
}

function getEasyDistanceRatio(laps: Lap[], distanceKm: number, avgPaceSec: number | null) {
  const segments = getLapSegments(laps)
  if (segments.length) {
    const total = segments.reduce((sum, lap) => sum + lap.distanceKm, 0)
    const easy = segments.filter((lap) => lap.paceSec >= 390).reduce((sum, lap) => sum + lap.distanceKm, 0)
    return total > 0 ? easy / total : 0
  }

  if (distanceKm > 0 && avgPaceSec !== null) return avgPaceSec >= 390 ? 1 : 0
  return 0
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
      paceSec: Number(lap.paceSec)
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

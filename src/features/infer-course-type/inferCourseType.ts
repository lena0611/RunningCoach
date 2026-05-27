import type { CourseType, RunRoutePoint } from '@/entities/run/model'

type InferCourseTypeInput = {
  distanceKm: number | null
  elevationGainM: number | null
  elevationLossM?: number | null
  routePoints?: RunRoutePoint[]
}

const flatGainPerKm = 6
const hillyGainPerKm = 18
const trailGainPerKm = 35
const trailUndulationPerKm = 45
const trailAltitudeRangeM = 120

export function inferCourseType(input: InferCourseTypeInput): CourseType {
  const distanceKm = normalizePositive(input.distanceKm)
  const routeStats = getRouteElevationStats(input.routePoints ?? [])
  const elevationGainM = normalizeNonNegative(input.elevationGainM) ?? routeStats?.gainM ?? null
  const elevationLossM = normalizeNonNegative(input.elevationLossM) ?? routeStats?.lossM ?? null

  if (distanceKm === null || distanceKm < 0.5 || (elevationGainM === null && elevationLossM === null)) {
    return 'Unknown'
  }

  const elevationM = Math.max(elevationGainM ?? 0, elevationLossM ?? 0)
  const gainPerKm = elevationM / distanceKm
  const undulationPerKm = routeStats ? routeStats.undulationM / distanceKm : null
  const altitudeRangeM = routeStats?.rangeM ?? null

  if (
    gainPerKm >= trailGainPerKm ||
    (undulationPerKm !== null && undulationPerKm >= trailUndulationPerKm) ||
    (altitudeRangeM !== null && altitudeRangeM >= trailAltitudeRangeM)
  ) {
    return 'Trail'
  }

  if (gainPerKm >= hillyGainPerKm || (altitudeRangeM !== null && altitudeRangeM >= 60)) return 'Hilly'
  if (gainPerKm < flatGainPerKm && (altitudeRangeM === null || altitudeRangeM < 25)) return 'Flat'
  return 'Mixed'
}

function normalizePositive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function normalizeNonNegative(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function getRouteElevationStats(routePoints: RunRoutePoint[]) {
  const altitudes = routePoints
    .map((point) => point.altitude)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (altitudes.length < 2) return null

  let gainM = 0
  let lossM = 0
  let undulationM = 0
  let previous = altitudes[0]

  for (const altitude of altitudes.slice(1)) {
    const delta = altitude - previous
    if (Math.abs(delta) >= 1) {
      undulationM += Math.abs(delta)
      if (delta > 0) gainM += delta
      if (delta < 0) lossM += Math.abs(delta)
    }
    previous = altitude
  }

  return {
    gainM,
    lossM,
    undulationM,
    rangeM: Math.max(...altitudes) - Math.min(...altitudes)
  }
}

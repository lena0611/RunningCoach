import type { CourseType } from '@/entities/run/model'

type InferCourseTypeInput = {
  distanceKm: number | null
  elevationGainM: number | null
  elevationLossM?: number | null
}

const flatGainPerKm = 6
const hillyGainPerKm = 18

export function inferCourseType(input: InferCourseTypeInput): CourseType {
  const distanceKm = normalizePositive(input.distanceKm)
  const elevationGainM = normalizeNonNegative(input.elevationGainM)
  const elevationLossM = normalizeNonNegative(input.elevationLossM)

  if (distanceKm === null || distanceKm < 0.5 || (elevationGainM === null && elevationLossM === null)) {
    return 'Unknown'
  }

  const elevationM = Math.max(elevationGainM ?? 0, elevationLossM ?? 0)
  const gainPerKm = elevationM / distanceKm

  if (gainPerKm < flatGainPerKm) return 'Flat'
  if (gainPerKm >= hillyGainPerKm) return 'Hilly'
  return 'Mixed'
}

function normalizePositive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function normalizeNonNegative(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

import { describe, expect, it } from 'vitest'
import { inferCourseType } from './inferCourseType'

describe('inferCourseType', () => {
  it('returns Unknown when elevation data is missing', () => {
    expect(inferCourseType({ distanceKm: 10, elevationGainM: null, elevationLossM: null })).toBe('Unknown')
  })

  it('infers Flat from low elevation per km', () => {
    expect(inferCourseType({ distanceKm: 10, elevationGainM: 35, elevationLossM: 30 })).toBe('Flat')
  })

  it('infers Mixed from moderate elevation per km', () => {
    expect(inferCourseType({ distanceKm: 10, elevationGainM: 90, elevationLossM: 80 })).toBe('Mixed')
  })

  it('infers Hilly from high elevation per km', () => {
    expect(inferCourseType({ distanceKm: 10, elevationGainM: 210, elevationLossM: 190 })).toBe('Hilly')
  })

  it('infers Trail from very high elevation density', () => {
    expect(inferCourseType({ distanceKm: 10, elevationGainM: 420, elevationLossM: 380 })).toBe('Trail')
  })

  it('uses route altitude range when summary gain is low', () => {
    expect(inferCourseType({
      distanceKm: 8,
      elevationGainM: 20,
      elevationLossM: 20,
      routePoints: [
        { offsetSec: 0, latitude: 37, longitude: 127, altitude: 10 },
        { offsetSec: 300, latitude: 37.001, longitude: 127.001, altitude: 145 }
      ]
    })).toBe('Trail')
  })

  it('does not infer Track or Treadmill from elevation alone', () => {
    expect(inferCourseType({ distanceKm: 5, elevationGainM: 0, elevationLossM: 0, routePoints: [] })).toBe('Flat')
  })
})

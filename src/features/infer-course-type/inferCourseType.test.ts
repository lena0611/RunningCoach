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
})

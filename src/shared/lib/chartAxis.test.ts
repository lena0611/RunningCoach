import { describe, expect, it } from 'vitest'
import { getChartDomain, inferChartMetricKind } from './chartAxis'

describe('chartAxis', () => {
  it('adds readable padding around heart rate charts', () => {
    const domain = getChartDomain([136, 156], 'heartRate')

    expect(domain).toEqual(expect.objectContaining({ dataMin: 136, dataMax: 156 }))
    expect(domain?.min).toBeLessThanOrEqual(130)
    expect(domain?.max).toBeGreaterThanOrEqual(160)
  })

  it('keeps pace charts from using raw dataMin/dataMax', () => {
    const domain = getChartDomain([420, 450], 'pace')

    expect(domain?.min).toBeLessThan(420)
    expect(domain?.max).toBeGreaterThan(450)
    expect((domain?.min ?? 0) % 15).toBe(0)
    expect((domain?.max ?? 0) % 15).toBe(0)
  })

  it('uses a robust display range for pace charts with GPS outliers', () => {
    const values = [
      433, 435, 436, 438, 439, 441, 442, 443, 444, 445, 446, 447,
      353, 698
    ]
    const domain = getChartDomain(values, 'pace')

    expect(domain).toEqual(expect.objectContaining({ dataMin: 353, dataMax: 698 }))
    expect(domain?.min).toBeGreaterThan(330)
    expect(domain?.max).toBeLessThan(520)
  })

  it('gives constant cadence values a non-flat domain', () => {
    const domain = getChartDomain([164, 164, 164], 'cadence')

    expect(domain?.min).toBeLessThan(164)
    expect(domain?.max).toBeGreaterThan(164)
  })

  it('uses fixed percent scale for probability-like values', () => {
    expect(getChartDomain([75, 90], 'percent')).toEqual({ min: 0, max: 100, dataMin: 75, dataMax: 90 })
  })

  it('infers known metric kinds from display units', () => {
    expect(inferChartMetricKind('km')).toBe('distance')
    expect(inferChartMetricKind('°')).toBe('temperature')
    expect(inferChartMetricKind('%')).toBe('percent')
    expect(inferChartMetricKind('회')).toBe('count')
  })
})

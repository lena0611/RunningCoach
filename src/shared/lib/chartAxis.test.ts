import { describe, expect, it } from 'vitest'
import { getChartDomain, inferChartMetricKind } from './chartAxis'

describe('chartAxis', () => {
  it('adds readable padding around heart rate charts', () => {
    const domain = getChartDomain([136, 156], 'heartRate')

    expect(domain).toEqual(expect.objectContaining({ min: 0, max: 210, dataMin: 136, dataMax: 156, interval: 10 }))
  })

  it('keeps pace charts from using raw dataMin/dataMax', () => {
    const domain = getChartDomain([420, 450], 'pace')

    expect(domain).toEqual(expect.objectContaining({ min: 210, max: 720, dataMin: 420, dataMax: 450, interval: 30 }))
  })

  it('keeps pace charts on a fixed comparable domain even with GPS outliers', () => {
    const values = [
      433, 435, 436, 438, 439, 441, 442, 443, 444, 445, 446, 447,
      353, 698
    ]
    const domain = getChartDomain(values, 'pace')

    expect(domain).toEqual(expect.objectContaining({ min: 210, max: 720, dataMin: 353, dataMax: 698, displayMin: 353, displayMax: 698 }))
    expect(domain?.interval).toBe(30)
  })

  it('keeps moderate pace variation inside the display domain', () => {
    const values = [
      361, 402, 420, 432, 438, 441, 444, 449, 453, 458, 466, 482, 510, 546
    ]
    const domain = getChartDomain(values, 'pace')

    expect(domain).toEqual(expect.objectContaining({ min: 210, max: 720, dataMin: 361, dataMax: 546, displayMin: 361, displayMax: 546 }))
  })

  it('gives constant cadence values a non-flat domain', () => {
    const domain = getChartDomain([164, 164, 164], 'cadence')

    expect(domain?.min).toBeLessThan(164)
    expect(domain?.max).toBeGreaterThan(164)
  })

  it('uses fixed percent scale for probability-like values', () => {
    expect(getChartDomain([75, 90], 'percent')).toEqual({
      min: 0,
      max: 100,
      dataMin: 75,
      dataMax: 90,
      displayMin: 75,
      displayMax: 90
    })
  })

  it('infers known metric kinds from display units', () => {
    expect(inferChartMetricKind('km')).toBe('distance')
    expect(inferChartMetricKind('°')).toBe('temperature')
    expect(inferChartMetricKind('%')).toBe('percent')
    expect(inferChartMetricKind('회')).toBe('count')
  })
})

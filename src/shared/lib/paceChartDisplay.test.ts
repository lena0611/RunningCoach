import { describe, expect, it } from 'vitest'
import { preparePaceChartDisplayValues } from './paceChartDisplay'

describe('paceChartDisplay', () => {
  const domain = { minSec: 210, maxSec: 720 }

  it('clips slow pace outliers into the visible display range without changing normal values', () => {
    const values = preparePaceChartDisplayValues([480, 1295, 510], domain)

    expect(values).toEqual([480, 702, 510])
  })

  it('interpolates short missing gaps only for display continuity', () => {
    const values = preparePaceChartDisplayValues([480, null, undefined, 540], domain)

    expect(values).toEqual([480, 500, 520, 540])
  })

  it('keeps long missing gaps empty so stopped or absent data is not over-smoothed', () => {
    const values = preparePaceChartDisplayValues([480, null, null, null, 540], domain)

    expect(values).toEqual([480, null, null, null, 540])
  })

  it('clips fast GPS outliers to the comparable pace domain', () => {
    const values = preparePaceChartDisplayValues([180, 360], domain)

    expect(values).toEqual([210, 360])
  })
})

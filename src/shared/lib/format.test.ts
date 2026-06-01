import { describe, expect, it } from 'vitest'
import { formatInteger, formatNumberWithCommas } from './format'

describe('number display formatting', () => {
  it('adds thousands separators to rounded integers', () => {
    expect(formatInteger(10338)).toBe('10,338')
    expect(formatInteger(10338.4)).toBe('10,338')
    expect(formatInteger(null)).toBe('-')
  })

  it('keeps fixed decimal digits while adding thousands separators', () => {
    expect(formatNumberWithCommas(12345.678, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('12,345.68')
  })
})

import { describe, expect, it } from 'vitest'
import { formatDateTimeWithWeekday, formatDateWithWeekday, formatDuration, formatPace, formatTimeRange } from '@/shared/lib/format'

describe('format helpers', () => {
  it('rounds fractional pace seconds and never leaks decimals', () => {
    expect(formatPace(433.271471813598737)).toBe('7\'13"')
    expect(formatPace(584.61891942784405)).toBe('9\'45"')
  })

  it('rounds fractional duration seconds into clock text', () => {
    expect(formatDuration(5580.536556959152217)).toBe('1:33:01')
    expect(formatDuration(2020.38527202606201)).toBe('33:40')
  })

  it('renders displayed dates with weekday', () => {
    expect(formatDateWithWeekday('2026-05-24')).toBe('2026-05-24(일)')
    expect(formatDateTimeWithWeekday('2026-05-24T19:36:12+09:00')).toBe('2026-05-24(일) 19:36')
  })

  it('renders a compact local time range for session detail', () => {
    expect(formatTimeRange('2026-05-24T06:05:12+09:00', '2026-05-24T06:45:52+09:00')).toBe('06:05-06:45')
  })
})

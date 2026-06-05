import { describe, expect, it } from 'vitest'
import { getSunTimes, isDaylightAt } from './sunTimes'

// 서울(37.5665, 126.9780)
const SEOUL = { lat: 37.5665, lon: 126.978 }

function kstHour(date: Date): number {
  return (date.getUTCHours() + 9) % 24
}

describe('getSunTimes (서울)', () => {
  it('하지 무렵(6월 5일)은 일출 새벽, 일몰 저녁', () => {
    const { sunrise, sunset } = getSunTimes(new Date(2026, 5, 5), SEOUL.lat, SEOUL.lon)
    expect(sunrise).not.toBeNull()
    expect(sunset).not.toBeNull()
    expect(kstHour(sunrise as Date)).toBeGreaterThanOrEqual(4)
    expect(kstHour(sunrise as Date)).toBeLessThanOrEqual(6)
    expect(kstHour(sunset as Date)).toBeGreaterThanOrEqual(19)
    expect(kstHour(sunset as Date)).toBeLessThanOrEqual(20)
  })

  it('일출은 일몰보다 앞선다', () => {
    const { sunrise, sunset } = getSunTimes(new Date(2026, 11, 21), SEOUL.lat, SEOUL.lon)
    expect((sunrise as Date).getTime()).toBeLessThan((sunset as Date).getTime())
  })

  it('동지 무렵 낮이 더 짧다', () => {
    const summer = getSunTimes(new Date(2026, 5, 21), SEOUL.lat, SEOUL.lon)
    const winter = getSunTimes(new Date(2026, 11, 21), SEOUL.lat, SEOUL.lon)
    const summerLen = (summer.sunset as Date).getTime() - (summer.sunrise as Date).getTime()
    const winterLen = (winter.sunset as Date).getTime() - (winter.sunrise as Date).getTime()
    expect(summerLen).toBeGreaterThan(winterLen)
  })
})

describe('isDaylightAt', () => {
  it('정오는 주간', () => {
    // KST 정오 = UTC 03:00
    expect(isDaylightAt(new Date(Date.UTC(2026, 5, 5, 3, 0)), SEOUL.lat, SEOUL.lon)).toBe(true)
  })
  it('자정은 야간', () => {
    expect(isDaylightAt(new Date(Date.UTC(2026, 5, 5, 15, 0)), SEOUL.lat, SEOUL.lon)).toBe(false)
  })
})

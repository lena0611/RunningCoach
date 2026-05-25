import { describe, expect, it } from 'vitest'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import { getRainWindowText, getRunningWeatherAdvice } from '@/shared/lib/weather'

function createSnapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  const now = new Date('2026-05-26T06:00:00+09:00')
  return {
    locationName: 'Seoul',
    observedAt: now.toISOString(),
    current: {
      temperatureC: 22,
      apparentTemperatureC: 21,
      humidity: 0.52,
      windMps: 2,
      precipitationIntensityMmPerHour: 0,
      condition: 'cloudy',
      symbolName: 'cloud',
      isDaylight: true
    },
    hourly: Array.from({ length: 8 }, (_, index) => ({
      time: new Date(now.getTime() + index * 60 * 60 * 1000).toISOString(),
      temperatureC: 22 + index,
      apparentTemperatureC: 21 + index,
      precipitationChance: 0.1,
      precipitationAmountMm: 0,
      precipitationIntensityMmPerHour: 0,
      condition: 'cloudy',
      symbolName: 'cloud',
      isDaylight: true
    })),
    daily: [],
    ...overrides
  }
}

describe('weather advice', () => {
  it('flags hot apparent temperature as bad for running', () => {
    const advice = getRunningWeatherAdvice(createSnapshot({
      current: {
        ...createSnapshot().current,
        temperatureC: 29,
        apparentTemperatureC: 31
      }
    }))

    expect(advice.level).toBe('bad')
    expect(advice.title).toContain('더위')
  })

  it('prioritizes rain chance and amount', () => {
    const snapshot = createSnapshot()
    snapshot.hourly[1].precipitationChance = 0.7
    snapshot.hourly[1].precipitationAmountMm = 2.4

    const advice = getRunningWeatherAdvice(snapshot)

    expect(advice.level).toBe('caution')
    expect(advice.bullets.join(' ')).toContain('강수')
  })

  it('summarizes rain window from hourly forecast', () => {
    const snapshot = createSnapshot()
    snapshot.hourly[2].precipitationChance = 0.5
    snapshot.hourly[4].precipitationAmountMm = 0.2

    expect(getRainWindowText(snapshot.hourly)).toContain('비 가능')
  })
})

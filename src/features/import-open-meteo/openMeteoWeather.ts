import type { WeatherDailyPoint, WeatherHourlyPoint, WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'

type OpenMeteoForecastResponse = {
  latitude?: number
  longitude?: number
  timezone?: string
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    precipitation?: number
    weather_code?: number
    is_day?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    apparent_temperature?: number[]
    precipitation_probability?: number[]
    precipitation?: number[]
    weather_code?: number[]
    is_day?: number[]
  }
  daily?: {
    time?: string[]
    temperature_2m_min?: number[]
    temperature_2m_max?: number[]
    precipitation_probability_max?: number[]
    precipitation_sum?: number[]
    weather_code?: number[]
  }
}

type PositionLike = {
  coords: {
    latitude: number
    longitude: number
  }
}

export async function requestOpenMeteoForecast(): Promise<WeatherSnapshot> {
  const position = await getCurrentPosition()
  const latitude = roundCoordinate(position.coords.latitude)
  const longitude = roundCoordinate(position.coords.longitude)
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'precipitation',
      'weather_code',
      'is_day'
    ].join(','),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'is_day'
    ].join(','),
    daily: [
      'temperature_2m_min',
      'temperature_2m_max',
      'precipitation_probability_max',
      'precipitation_sum',
      'weather_code'
    ].join(','),
    forecast_days: '7',
    timezone: 'auto'
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!response.ok) throw new Error(`날씨 요청 실패 (${response.status})`)
  const data = (await response.json()) as OpenMeteoForecastResponse
  return toWeatherSnapshot(data)
}

function getCurrentPosition(): Promise<PositionLike> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('이 환경에서 위치 권한을 사용할 수 없습니다.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 12_000
    })
  })
}

function toWeatherSnapshot(data: OpenMeteoForecastResponse): WeatherSnapshot {
  const currentCode = data.current?.weather_code ?? null
  return {
    locationName: '현재 위치',
    observedAt: data.current?.time ? toIso(data.current.time) : new Date().toISOString(),
    current: {
      temperatureC: normalizeNumber(data.current?.temperature_2m),
      apparentTemperatureC: normalizeNumber(data.current?.apparent_temperature),
      humidity: normalizePercentFromWhole(data.current?.relative_humidity_2m),
      windMps: kmhToMps(data.current?.wind_speed_10m),
      precipitationIntensityMmPerHour: normalizeNumber(data.current?.precipitation),
      condition: weatherCodeToCondition(currentCode),
      symbolName: weatherCodeToSymbol(currentCode, data.current?.is_day !== 0),
      isDaylight: data.current?.is_day !== 0
    },
    hourly: mapHourly(data),
    daily: mapDaily(data)
  }
}

function mapHourly(data: OpenMeteoForecastResponse): WeatherHourlyPoint[] {
  const hourly = data.hourly ?? {}
  return (hourly.time ?? []).map((time, index) => {
    const code = hourly.weather_code?.[index] ?? null
    return {
      time: toIso(time),
      temperatureC: normalizeNumber(hourly.temperature_2m?.[index]),
      apparentTemperatureC: normalizeNumber(hourly.apparent_temperature?.[index]),
      precipitationChance: normalizePercentFromWhole(hourly.precipitation_probability?.[index]),
      precipitationAmountMm: normalizeNumber(hourly.precipitation?.[index]),
      precipitationIntensityMmPerHour: normalizeNumber(hourly.precipitation?.[index]),
      condition: weatherCodeToCondition(code),
      symbolName: weatherCodeToSymbol(code, hourly.is_day?.[index] !== 0),
      isDaylight: hourly.is_day?.[index] !== 0
    }
  })
}

function mapDaily(data: OpenMeteoForecastResponse): WeatherDailyPoint[] {
  const daily = data.daily ?? {}
  return (daily.time ?? []).map((date, index) => {
    const code = daily.weather_code?.[index] ?? null
    return {
      date,
      minTemperatureC: normalizeNumber(daily.temperature_2m_min?.[index]),
      maxTemperatureC: normalizeNumber(daily.temperature_2m_max?.[index]),
      precipitationChance: normalizePercentFromWhole(daily.precipitation_probability_max?.[index]),
      precipitationAmountMm: normalizeNumber(daily.precipitation_sum?.[index]),
      symbolName: weatherCodeToSymbol(code, true),
      condition: weatherCodeToCondition(code)
    }
  })
}

function weatherCodeToCondition(code: number | null) {
  if (code === null) return '정보 없음'
  if (code === 0) return '맑음'
  if ([1, 2].includes(code)) return '대체로 맑음'
  if (code === 3) return '흐림'
  if ([45, 48].includes(code)) return '안개'
  if ([51, 53, 55, 56, 57].includes(code)) return '이슬비'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '비'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '눈'
  if ([95, 96, 99].includes(code)) return '뇌우'
  return '날씨 변화'
}

function weatherCodeToSymbol(code: number | null, isDaylight: boolean) {
  if (code === null) return 'cloud'
  if (code === 0) return isDaylight ? 'sun.max' : 'moon'
  if ([1, 2].includes(code)) return isDaylight ? 'cloud.sun' : 'cloud.moon'
  if (code === 3) return 'cloud'
  if ([45, 48].includes(code)) return 'cloud.fog'
  if ([51, 53, 55, 56, 57].includes(code)) return 'cloud.drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'cloud.rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'cloud.snow'
  if ([95, 96, 99].includes(code)) return 'cloud.bolt.rain'
  return 'cloud'
}

function toIso(value: string) {
  const date = new Date(value)
  if (Number.isFinite(date.getTime())) return date.toISOString()
  const localDate = new Date(`${value}:00`)
  return Number.isFinite(localDate.getTime()) ? localDate.toISOString() : value
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePercentFromWhole(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : null
}

function kmhToMps(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round((value / 3.6) * 10) / 10 : null
}

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100
}

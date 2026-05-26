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

type CachedPosition = {
  latitude: number
  longitude: number
  savedAt: number
}

type CachedWeather = {
  snapshot: WeatherSnapshot
  savedAt: number
}

const positionCacheKey = 'runcontext.weather.position.v1'
const weatherCacheKey = 'runcontext.weather.snapshot.v1'
const freshPositionMaxAgeMs = 30 * 60 * 1000
const fallbackPositionMaxAgeMs = 7 * 24 * 60 * 60 * 1000
const fallbackWeatherMaxAgeMs = 6 * 60 * 60 * 1000
const positionLookupTimeoutMs = 10_000
const forecastFetchTimeoutMs = 12_000

export async function requestOpenMeteoForecast(): Promise<WeatherSnapshot> {
  try {
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

    const data = await fetchForecastWithRetry(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
    const snapshot = toWeatherSnapshot(data)
    saveCachedWeather(snapshot)
    return snapshot
  } catch (err) {
    const cached = getCachedWeather(fallbackWeatherMaxAgeMs)
    if (cached) return cached.snapshot
    throw err
  }
}

async function getCurrentPosition(): Promise<PositionLike> {
  const freshCached = getCachedPosition(freshPositionMaxAgeMs)
  if (freshCached) return toPositionLike(freshCached)

  if (!navigator.geolocation) {
    const cached = getCachedPosition(fallbackPositionMaxAgeMs)
    if (cached) return toPositionLike(cached)
    throw new Error('이 환경에서 위치 권한을 사용할 수 없습니다.')
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition((position) => {
      saveCachedPosition(position.coords.latitude, position.coords.longitude)
      resolve(position)
    }, (error) => {
      const cached = getCachedPosition(fallbackPositionMaxAgeMs)
      if (cached && (error.code === 2 || error.code === 3)) {
        resolve(toPositionLike(cached))
        return
      }
      reject(error)
    }, {
      enableHighAccuracy: false,
      maximumAge: freshPositionMaxAgeMs,
      timeout: positionLookupTimeoutMs
    })
  })
}

async function fetchForecastWithRetry(url: string): Promise<OpenMeteoForecastResponse> {
  try {
    return await fetchForecast(url)
  } catch (err) {
    await delay(500)
    try {
      return await fetchForecast(url)
    } catch {
      throw err
    }
  }
}

async function fetchForecast(url: string): Promise<OpenMeteoForecastResponse> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), forecastFetchTimeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`날씨 요청 실패 (${response.status})`)
    return (await response.json()) as OpenMeteoForecastResponse
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('날씨 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

function getCachedPosition(maxAgeMs: number): CachedPosition | null {
  try {
    const raw = localStorage.getItem(positionCacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPosition
    if (!Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude) || !Number.isFinite(parsed.savedAt)) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedPosition(latitude: number, longitude: number) {
  try {
    localStorage.setItem(positionCacheKey, JSON.stringify({ latitude, longitude, savedAt: Date.now() }))
  } catch {
    // 위치 캐시는 편의 기능이다. 저장 실패가 날씨 조회 자체를 막으면 안 된다.
  }
}

function getCachedWeather(maxAgeMs: number): CachedWeather | null {
  try {
    const raw = localStorage.getItem(weatherCacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedWeather
    if (!parsed.snapshot || !Number.isFinite(parsed.savedAt)) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

function saveCachedWeather(snapshot: WeatherSnapshot) {
  try {
    localStorage.setItem(weatherCacheKey, JSON.stringify({ snapshot, savedAt: Date.now() }))
  } catch {
    // 날씨 캐시는 편의 기능이다. 저장 실패가 예보 조회 자체를 막으면 안 된다.
  }
}

function toPositionLike(position: CachedPosition): PositionLike {
  return {
    coords: {
      latitude: position.latitude,
      longitude: position.longitude
    }
  }
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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

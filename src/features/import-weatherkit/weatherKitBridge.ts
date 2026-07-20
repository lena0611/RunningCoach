import { feltTemperatureC } from '@/shared/lib/runningWeather'

export type WeatherHourlyPoint = {
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  precipitationChance: number | null
  precipitationAmountMm: number | null
  precipitationIntensityMmPerHour: number | null
  condition: string
  symbolName: string
  isDaylight: boolean
  // 기상청(weather-run) 경유에서 채워진다. WeatherKit/Open-Meteo 경로에서는 선택값.
  humidity?: number | null
  precipitationType?: number | null
}

export type WeatherDailyPoint = {
  date: string
  minTemperatureC: number | null
  maxTemperatureC: number | null
  precipitationChance: number | null
  precipitationAmountMm: number | null
  symbolName: string
  condition: string
}

export type WeatherSnapshot = {
  locationName: string | null
  observedAt: string
  current: {
    temperatureC: number | null
    apparentTemperatureC: number | null
    humidity: number | null
    windMps: number | null
    precipitationIntensityMmPerHour: number | null
    condition: string
    symbolName: string
    isDaylight: boolean
  }
  hourly: WeatherHourlyPoint[]
  daily: WeatherDailyPoint[]
  // 기상청 격자(nx/ny). weather-run 경유에서만 채워진다.
  grid?: { nx: number; ny: number }
}

type WeatherKitBridgeHandlers = {
  onForecast: (snapshot: WeatherSnapshot) => void
  onError: (message: string) => void
}

declare global {
  interface Window {
    RunContextWeatherKit?: {
      receiveForecast: (snapshot: WeatherSnapshot) => void
      receiveError: (message: string) => void
    }
  }
}

export function registerWeatherKitBridge(handlers: WeatherKitBridgeHandlers) {
  window.RunContextWeatherKit = {
    receiveForecast(snapshot) {
      handlers.onForecast(normalizeSnapshot(snapshot))
    },
    receiveError(message) {
      handlers.onError(message || '날씨 가져오기 실패')
    }
  }
}

export function unregisterWeatherKitBridge() {
  delete window.RunContextWeatherKit
}

export function requestWeatherForecast() {
  const handler = window.webkit?.messageHandlers?.runContextWeatherKit
  if (!handler) {
    throw new Error('iOS WeatherKit 브리지가 연결되어 있지 않습니다.')
  }

  handler.postMessage({
    type: 'requestWeatherForecast',
    hours: 24,
    days: 7
  })
}

export function hasWeatherKitBridge() {
  return Boolean(window.webkit?.messageHandlers?.runContextWeatherKit)
}

function normalizeSnapshot(snapshot: WeatherSnapshot): WeatherSnapshot {
  // iOS 브리지 경로는 Open-Meteo apparent_temperature(태양복사 과대반영)를 그대로 실어보내
  // 기온 대비 체감이 비현실적으로 높게 뜬다(예: 15℃에 체감 30℃). KMA/웹 경로와 동일하게
  // 우리 계절분기 공식(feltTemperatureC)으로 재계산해 통일한다. humidity는 0~1 → 0~100 환산.
  const curTemp = normalizeNumber(snapshot.current?.temperatureC)
  const curHumidity = normalizeNumber(snapshot.current?.humidity)
  const curWind = normalizeNumber(snapshot.current?.windMps)
  return {
    locationName: typeof snapshot.locationName === 'string' && snapshot.locationName ? snapshot.locationName : null,
    observedAt: typeof snapshot.observedAt === 'string' ? snapshot.observedAt : new Date().toISOString(),
    current: {
      temperatureC: curTemp,
      apparentTemperatureC: feltTemperatureC(curTemp, curHumidity !== null ? curHumidity * 100 : null, curWind),
      humidity: curHumidity,
      windMps: curWind,
      precipitationIntensityMmPerHour: normalizeNumber(snapshot.current?.precipitationIntensityMmPerHour),
      condition: typeof snapshot.current?.condition === 'string' ? snapshot.current.condition : '',
      symbolName: typeof snapshot.current?.symbolName === 'string' ? snapshot.current.symbolName : 'cloud',
      isDaylight: Boolean(snapshot.current?.isDaylight)
    },
    hourly: Array.isArray(snapshot.hourly) ? snapshot.hourly.map(normalizeHourlyPoint) : [],
    daily: Array.isArray(snapshot.daily) ? snapshot.daily.map(normalizeDailyPoint) : []
  }
}

function normalizeHourlyPoint(point: WeatherHourlyPoint): WeatherHourlyPoint {
  const temp = normalizeNumber(point.temperatureC)
  const hum = normalizeNumber(point.humidity ?? null)
  return {
    time: typeof point.time === 'string' ? point.time : '',
    temperatureC: temp,
    // current와 동일 이유로 체감을 자체 공식으로 재계산(브리지 hourly엔 풍속 없음 → 습도 기반).
    apparentTemperatureC: feltTemperatureC(temp, hum !== null ? hum * 100 : null, null),
    precipitationChance: normalizePercent(point.precipitationChance),
    precipitationAmountMm: normalizeNumber(point.precipitationAmountMm),
    precipitationIntensityMmPerHour: normalizeNumber(point.precipitationIntensityMmPerHour),
    condition: typeof point.condition === 'string' ? point.condition : '',
    symbolName: typeof point.symbolName === 'string' ? point.symbolName : 'cloud',
    isDaylight: Boolean(point.isDaylight)
  }
}

function normalizeDailyPoint(point: WeatherDailyPoint): WeatherDailyPoint {
  return {
    date: typeof point.date === 'string' ? point.date : '',
    minTemperatureC: normalizeNumber(point.minTemperatureC),
    maxTemperatureC: normalizeNumber(point.maxTemperatureC),
    precipitationChance: normalizePercent(point.precipitationChance),
    precipitationAmountMm: normalizeNumber(point.precipitationAmountMm),
    symbolName: typeof point.symbolName === 'string' ? point.symbolName : 'cloud',
    condition: typeof point.condition === 'string' ? point.condition : ''
  }
}

function normalizePercent(value: number | null): number | null {
  const next = normalizeNumber(value)
  if (next === null) return null
  return next > 1 ? Math.min(Math.max(next / 100, 0), 1) : Math.min(Math.max(next, 0), 1)
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

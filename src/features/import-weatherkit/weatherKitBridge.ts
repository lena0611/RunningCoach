// 날씨 스냅샷 데이터 계약 타입(SSOT).
// KMA(weather-run) 경로와 웹 카드·코치 리포트가 공유하는 스냅샷 형태를 정의한다.
// iOS도 이제 위치만 네이티브(native-location 브리지)에서 받고 날씨는 KMA로 통일하므로,
// 여기에는 브리지 로직이 없다 — 순수 타입만 둔다.

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
  // 기상청(weather-run) 경유에서 채워진다.
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

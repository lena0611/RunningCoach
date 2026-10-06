/**
 * 지나간 런의 날씨 추정(#838) — Open-Meteo historical-forecast API(키 불필요, 과거~오늘 시간별).
 *
 * 왜 필요한가: 날씨는 기록한 앱이 메타로 넣어줄 때만 있었다. Apple Watch 운동 앱도 워치 단독이면 대부분
 * 빠지고 WorkOutDoors 같은 서드파티는 아예 안 넣는다(실측 225런 중 79건). 그래서 기온 칩이 들쭉날쭉했고,
 * 사후 평가의 더위 감안(`weatherStress`)이 가장 더운 런들에서 꺼져 있었다.
 *
 * 정확도(2026-10-06 실측): 워치 기온이 있는 76런과 대조 — 기온 MAE 1.1°C(2°C 이내 66건), 습도 MAE 9%p.
 * 추정이라 저장할 때 `weather_estimated=true` 를 같이 남기고 화면도 "추정"으로 구분한다.
 *
 * 기상청 ASOS 과거 관측을 쓰지 않은 이유: 현재 서비스키에 활용신청이 없다(SERVICE_KEY_IS_NOT_REGISTERED_ERROR).
 * 날씨 카드(예보)의 기상청 정책은 그대로다 — 이건 지나간 시각의 값을 메우는 용도뿐이다.
 */

export type RunWeatherQuery = { id: string; startAt: string; latitude: number; longitude: number }
export type EstimatedRunWeather = { temperature: number; humidity: number | null }

type HourlySeries = { time: string[]; temperature: Array<number | null>; humidity: Array<number | null> }

const ENDPOINT = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
const FETCH_TIMEOUT_MS = 15_000

/**
 * 좌표를 0.1°(약 10km) 격자로 묶는다 — 같은 동네 런들은 요청 한 번으로 받는다.
 * 모델 격자가 그보다 거칠어서 묶어도 값이 달라지지 않는다.
 */
export function groupByArea(queries: RunWeatherQuery[]): Map<string, RunWeatherQuery[]> {
  const groups = new Map<string, RunWeatherQuery[]>()
  for (const query of queries) {
    const key = `${query.latitude.toFixed(1)},${query.longitude.toFixed(1)}`
    const list = groups.get(key) ?? []
    list.push(query)
    groups.set(key, list)
  }
  return groups
}

/**
 * 시작 시각의 값을 앞뒤 정시 사이 선형보간으로 뽑는다. 시간축은 UTC(`timezone=GMT`)라
 * 타임존 변환이 끼지 않는다. 기온이 없으면 null(습도만 있는 추정은 저장하지 않는다).
 */
export function pickAtStart(series: HourlySeries, startAt: string): EstimatedRunWeather | null {
  const startMs = Date.parse(startAt)
  if (!Number.isFinite(startMs)) return null
  const hourMs = Math.floor(startMs / 3_600_000) * 3_600_000
  const index = series.time.indexOf(new Date(hourMs).toISOString().slice(0, 13) + ':00')
  if (index < 0) return null
  const fraction = (startMs - hourMs) / 3_600_000
  const interpolate = (values: Array<number | null>) => {
    const from = values[index]
    if (typeof from !== 'number') return null
    const to = values[index + 1]
    return typeof to === 'number' ? from + (to - from) * fraction : from
  }
  const temperature = interpolate(series.temperature)
  if (temperature === null) return null
  const humidity = interpolate(series.humidity)
  return {
    temperature: Math.round(temperature * 10) / 10,
    humidity: humidity === null ? null : Math.round(humidity)
  }
}

/** 런들의 시작 시각 날씨를 추정한다. 실패한 지역은 건너뛴다(다음 로드에 다시 시도된다). */
export async function estimateRunWeather(queries: RunWeatherQuery[]): Promise<Map<string, EstimatedRunWeather>> {
  const result = new Map<string, EstimatedRunWeather>()
  for (const group of groupByArea(queries).values()) {
    const dates = group.map((query) => query.startAt).filter((value) => Number.isFinite(Date.parse(value)))
      .map((value) => new Date(value).toISOString().slice(0, 10)).sort()
    if (!dates.length) continue
    let series: HourlySeries
    try {
      series = await fetchHourly(group[0].latitude, group[0].longitude, dates[0], dates[dates.length - 1])
    } catch {
      continue
    }
    for (const query of group) {
      const weather = pickAtStart(series, query.startAt)
      if (weather) result.set(query.id, weather)
    }
  }
  return result
}

async function fetchHourly(latitude: number, longitude: number, startDate: string, endDate: string): Promise<HourlySeries> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: 'temperature_2m,relative_humidity_2m',
    timezone: 'GMT',
    start_date: startDate,
    end_date: endDate
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`)
    const data = (await response.json()) as {
      hourly?: { time?: string[]; temperature_2m?: Array<number | null>; relative_humidity_2m?: Array<number | null> }
    }
    return {
      time: data.hourly?.time ?? [],
      temperature: data.hourly?.temperature_2m ?? [],
      humidity: data.hourly?.relative_humidity_2m ?? []
    }
  } finally {
    clearTimeout(timer)
  }
}

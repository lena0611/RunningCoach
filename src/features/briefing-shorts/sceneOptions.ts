import type { RunType } from '@/entities/run/model'
import type { AthleteProfile } from '@/entities/training-memory/model'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import type { BriefingSceneOptions, SceneBand, SceneRunKind, SceneWeather } from './scene/briefingScene'

/**
 * 앱 데이터 → 3D 장면 옵션(#898). 전부 **표현**이다 — 처방·판정에는 쓰지 않는다.
 * - 성별: 모델만 고른다. 여성이면 여자 모델, 그 외(남성·기타·선택 안 함)는 남자 모델(사용자 결정 2026-11-04).
 * - 러닝 동작: 세션 유형. 날씨·옷·악세사리: 지금 날씨(체감온도). 해·가로등: 지금 날짜·시각.
 */
export function sceneSex(sex: AthleteProfile['sex']): BriefingSceneOptions['sx'] {
  return sex === 'female' ? 'f' : 'm'
}

export function sceneRunKind(type: RunType): SceneRunKind {
  switch (type) {
    case 'Tempo':
      return 'tempo'
    case 'LSD':
    case 'Steady Long':
      return 'lsd'
    case 'Race':
      return 'race'
    default:
      return 'easy'
  }
}

/** 기상청 상태 문구·아이콘 이름에서 장면 날씨 4종으로. 구름많음은 하늘이 거의 덮인 장면(흐림)으로 본다. */
export function sceneWeather(current: Pick<WeatherSnapshot['current'], 'condition' | 'symbolName'> | null): SceneWeather {
  if (!current) return 'clear'
  const text = `${current.condition} ${current.symbolName}`.toLowerCase()
  if (/눈|진눈깨비|snow|sleet/.test(text)) return 'snow'
  if (/비|소나기|빗방울|rain|drizzle/.test(text)) return 'rain'
  if (/흐림|구름|cloud|fog/.test(text)) return 'cloudy'
  return 'clear'
}

/**
 * 옷 단계 = 체감온도 5°C 단위 10단계(-10 … 35, 경계 ±2.5°C — 사용자 요청 2026-11-06).
 * 어떤 단계에 무엇을 입는지는 `.harness/project/running-apparel-style-guide.md` 1장 매트릭스(러너는 얇은 옷을 겹쳐 입는다).
 * 날씨를 아직 못 받았으면 달로: 6~9월 25°C · 12~2월 0°C · 그 밖 15°C.
 */
export function sceneBand(feltC: number | null, month: number): SceneBand {
  if (feltC === null) return month >= 6 && month <= 9 ? 25 : month === 12 || month <= 2 ? 0 : 15
  return Math.max(-10, Math.min(35, Math.round(feltC / 5) * 5)) as SceneBand
}

/** 강한 바람(m/s) — 체감 11°C 이상이면 체감온도에 바람이 안 들어가 겉옷을 따로 더한다(10°C 이하는 이미 반영). 출처: 가이드 6.3 */
export const WIND_SHELL_MPS = 5.5
/** 아주 강한 바람 — 모자 위로 후드를 올려 쓴다(사용자 요청 2026-11-06 "바람 세면 모자 쓰고 그 위에 후드") */
export const WIND_HOOD_MPS = 8

/**
 * 겉옷 한 벌(후드 달린 겉옷만 후드를 올릴 수 있다):
 * - thermo(보온 재킷 — 후드·가슴 V 반사): 0°C 이하, 눈
 * - jacket(얇은 바람막이 — 후드): 5°C, 비(25°C 미만), 강풍(10~20°C)
 * - padvest(경량 패딩 조끼): 10°C (바람·비면 바람막이로)
 */
export function sceneOuterwear(input: { band: SceneBand; weather: SceneWeather; windMps: number | null }): 'thermo' | 'jacket' | 'padvest' | null {
  const { band, weather } = input
  const windy = (input.windMps ?? 0) >= WIND_SHELL_MPS
  if (band <= 0 || weather === 'snow') return 'thermo'
  if (band === 5) return 'jacket'
  if (band >= 25) return null // 더운 비는 그냥 맞는다(안에 땀이 찬다)
  if (weather === 'rain' || windy) return 'jacket'
  return band === 10 ? 'padvest' : null
}

/** 후드를 올린다: 아주 강한 바람 · -10°C · 영하 바람 · 추운 비(10°C 미만) · 영하 눈 — 후드 달린 겉옷일 때만 */
export function sceneHoodUp(input: { band: SceneBand; weather: SceneWeather; windMps: number | null; outer: ReturnType<typeof sceneOuterwear> }): boolean {
  if (input.outer !== 'thermo' && input.outer !== 'jacket') return false
  const wind = input.windMps ?? 0
  if (wind >= WIND_HOOD_MPS || input.band <= -10) return true
  if (input.band <= -5 && (wind >= 4 || input.weather === 'snow')) return true
  return input.weather === 'rain' && input.band < 10
}

/**
 * 머리·눈·손·목 + 겉옷:
 * - 모자: 5°C 이하 비니(귀 위까지 덮는 니트), 그 위는 러닝캡. 바람 세면 그 위로 후드(hood)
 * - 선글라스: 맑은 낮(9~17시)이면 겨울에도 — 비니·선글라스·장갑을 함께 쓰는 겨울 러너(사용자 참고 사진 2026-11-06)
 * - 장갑 5°C 이하, 넥워머 0°C 이하
 */
export function sceneAccessories(input: { band: SceneBand; weather: SceneWeather; windMps: number | null; hour: number; run: SceneRunKind }): string {
  const items = [input.band <= 5 ? 'beanie' : 'cap', 'watch']
  if (input.weather === 'clear' && input.hour >= 9 && input.hour < 17) items.push('sun')
  if (input.band <= 5) items.push('glove')
  if (input.band <= 0) items.push('buff')
  const outer = sceneOuterwear(input)
  if (outer) items.push(outer)
  if (sceneHoodUp({ ...input, outer })) items.push('hood')
  if (input.run === 'lsd') items.push('vest') // 물병 조끼는 겉옷 위에
  return items.join('-')
}

export function buildSceneOptions(input: {
  sex: AthleteProfile['sex']
  sessionType: RunType
  weather: Pick<WeatherSnapshot['current'], 'condition' | 'symbolName' | 'apparentTemperatureC' | 'temperatureC' | 'windMps'> | null
  now: Date
}): BriefingSceneOptions {
  const { now } = input
  const run = sceneRunKind(input.sessionType)
  const weather = sceneWeather(input.weather)
  const feltC = input.weather?.apparentTemperatureC ?? input.weather?.temperatureC ?? null
  const band = sceneBand(feltC, now.getMonth() + 1)
  const windMps = input.weather?.windMps ?? null
  const hour = Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.min(365, Math.floor((now.getTime() - start.getTime()) / 86_400_000))
  return {
    sx: sceneSex(input.sex),
    rn: run,
    dy: dayOfYear,
    tm: hour,
    wx: weather,
    tp: band,
    ac: sceneAccessories({ band, weather, windMps, hour, run })
  }
}

/** 영상 오른쪽 아이콘 줄(쇼츠식)의 날씨 — label = 기상청 상태 문구(없으면 빈 문자열), feltC = 체감온도(반올림) */
export type BriefingWeather = { label: string; feltC: number | null }

const WEATHER_WORD: Record<SceneWeather, string> = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' }

/**
 * 다른 날(코치 탭 다시 보기)의 날씨 = 그날 예보. 예보엔 체감온도가 없어 아이콘 줄엔 날씨만(없는 체감을 지어내지 않는다),
 * 옷은 그날 최저·최고 가운데로 고른다. 예보 범위 밖이면 날씨 없음(장면은 달로 옷을 고른다).
 */
export function forecastWeather(
  daily: WeatherSnapshot['daily'],
  date: string
): { scene: Pick<WeatherSnapshot['current'], 'condition' | 'symbolName' | 'apparentTemperatureC' | 'temperatureC' | 'windMps'> | null; badge: BriefingWeather | null } {
  const day = daily.find((point) => point.date === date)
  if (!day) return { scene: null, badge: null }
  const temps = [day.minTemperatureC, day.maxTemperatureC].filter((t): t is number => t !== null)
  const temperatureC = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null
  return {
    scene: { condition: day.condition, symbolName: day.symbolName, apparentTemperatureC: null, temperatureC, windMps: null }, // 예보엔 풍속이 없다
    badge: { label: day.condition && day.condition !== '정보 없음' ? day.condition : '', feltC: null }
  }
}

/** 아이콘 줄 날씨 아이콘·글자. 맑은 밤은 달. 상태 문구가 없으면 장면 날씨 이름으로 */
export function weatherBadge(weather: BriefingWeather | null, wx: SceneWeather, hour: number): { icon: SceneWeather | 'night'; label: string } {
  const night = hour < 6 || hour >= 19
  return { icon: wx === 'clear' && night ? 'night' : wx, label: weather?.label || WEATHER_WORD[wx] }
}

/** 타이틀 옆 효과음 글자(러닝 타입별, PoC 그대로) */
export function sceneSfx(run: SceneRunKind): string {
  return { easy: 'GO!', tempo: 'STEADY!', lsd: 'LONG!', race: 'RACE!', interval: 'PUSH!' }[run]
}

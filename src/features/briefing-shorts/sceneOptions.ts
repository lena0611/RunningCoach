import type { RunType } from '@/entities/run/model'
import type { AthleteProfile } from '@/entities/training-memory/model'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import type { BriefingSceneOptions, SceneOutfit, SceneRunKind, SceneWeather } from './scene/briefingScene'

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

/** 체감온도로 계절 옷. 날씨를 아직 못 받았으면 달로 고른다. */
export function sceneOutfit(feltC: number | null, month: number): SceneOutfit {
  if (feltC === null) return month >= 6 && month <= 9 ? 'summer' : month === 12 || month <= 2 ? 'winter' : 'mild'
  if (feltC >= 20) return 'summer'
  if (feltC < 8) return 'winter'
  return 'mild'
}

export function sceneAccessories(input: { feltC: number | null; weather: SceneWeather; hour: number; run: SceneRunKind; outfit: SceneOutfit }): string {
  const items = ['cap', 'watch']
  if (input.weather === 'clear' && input.outfit !== 'winter' && input.hour >= 9 && input.hour < 17) items.push('sun')
  if (input.feltC !== null && input.feltC <= 5) items.push('glove')
  if (input.feltC !== null && input.feltC <= 0) items.push('buff')
  if (input.run === 'lsd') items.push('vest')
  return items.join('-')
}

export function buildSceneOptions(input: {
  sex: AthleteProfile['sex']
  sessionType: RunType
  weather: Pick<WeatherSnapshot['current'], 'condition' | 'symbolName' | 'apparentTemperatureC' | 'temperatureC'> | null
  now: Date
}): BriefingSceneOptions {
  const { now } = input
  const run = sceneRunKind(input.sessionType)
  const weather = sceneWeather(input.weather)
  const feltC = input.weather?.apparentTemperatureC ?? input.weather?.temperatureC ?? null
  const outfit = sceneOutfit(feltC, now.getMonth() + 1)
  const hour = Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.min(365, Math.floor((now.getTime() - start.getTime()) / 86_400_000))
  return {
    sx: sceneSex(input.sex),
    rn: run,
    dy: dayOfYear,
    tm: hour,
    wx: weather,
    tp: outfit,
    ac: sceneAccessories({ feltC, weather, hour, run, outfit })
  }
}

/** 타이틀 옆 효과음 글자(러닝 타입별, PoC 그대로) */
export function sceneSfx(run: SceneRunKind): string {
  return { easy: 'GO!', tempo: 'STEADY!', lsd: 'LONG!', race: 'RACE!', interval: 'PUSH!' }[run]
}

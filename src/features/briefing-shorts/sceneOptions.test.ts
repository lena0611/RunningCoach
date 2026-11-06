import { describe, expect, it } from 'vitest'
import { buildSceneOptions, forecastWeather, sceneBand, sceneHoodUp, sceneOuterwear, sceneRunKind, sceneSex, sceneWeather } from './sceneOptions'

describe('sceneOptions', () => {
  it('성별: 여성만 여자 모델, 나머지(남성·기타·선택 안 함)는 남자 모델', () => {
    expect(sceneSex('female')).toBe('f')
    expect(sceneSex('male')).toBe('m')
    expect(sceneSex('other')).toBe('m')
    expect(sceneSex('unknown')).toBe('m')
  })

  it('세션 유형 → 러닝 동작', () => {
    expect(sceneRunKind('Easy')).toBe('easy')
    expect(sceneRunKind('Recovery')).toBe('easy')
    expect(sceneRunKind('Easy + Strides')).toBe('easy')
    expect(sceneRunKind('Tempo')).toBe('tempo')
    expect(sceneRunKind('LSD')).toBe('lsd')
    expect(sceneRunKind('Steady Long')).toBe('lsd')
    expect(sceneRunKind('Race')).toBe('race')
  })

  it('기상청 상태 → 장면 날씨', () => {
    expect(sceneWeather({ condition: '맑음', symbolName: 'sun.max' })).toBe('clear')
    expect(sceneWeather({ condition: '구름많음', symbolName: 'cloud.sun' })).toBe('cloudy')
    expect(sceneWeather({ condition: '흐림', symbolName: 'cloud' })).toBe('cloudy')
    expect(sceneWeather({ condition: '빗방울', symbolName: 'cloud.rain' })).toBe('rain')
    expect(sceneWeather({ condition: '진눈깨비', symbolName: 'cloud.snow' })).toBe('snow')
    expect(sceneWeather(null)).toBe('clear')
  })

  it('체감온도 → 5°C 단위 옷 단계(경계 ±2.5), 끝은 -10·35 로 묶고, 날씨 없으면 달로', () => {
    expect(sceneBand(27.4, 11)).toBe(25)
    expect(sceneBand(27.5, 11)).toBe(30)
    expect(sceneBand(2.4, 7)).toBe(0)
    expect(sceneBand(-2.6, 7)).toBe(-5)
    expect(sceneBand(-18, 1)).toBe(-10)
    expect(sceneBand(41, 8)).toBe(35)
    expect(sceneBand(null, 8)).toBe(25)
    expect(sceneBand(null, 1)).toBe(0)
    expect(sceneBand(null, 4)).toBe(15)
  })

  it('추운 밤 템포(체감 -3 → -5단계): 비니·장갑·넥워머·보온 재킷, 밤이라 선글라스 없음, 바람 없으면 후드 내림', () => {
    const o = buildSceneOptions({
      sex: 'unknown',
      sessionType: 'Tempo',
      weather: { condition: '맑음', symbolName: 'moon', apparentTemperatureC: -3, temperatureC: 1, windMps: 2 },
      now: new Date(2026, 0, 15, 20, 30)
    })
    expect(o).toMatchObject({ sx: 'm', rn: 'tempo', wx: 'clear', tp: -5, tm: 20.5, dy: 15 })
    expect(o.ac.split('-')).toEqual(['beanie', 'watch', 'glove', 'buff', 'thermo'])
  })

  it('맑은 겨울 낮(체감 3 → 5단계): 비니에 선글라스·장갑·바람막이', () => {
    const o = buildSceneOptions({
      sex: 'male',
      sessionType: 'Easy',
      weather: { condition: '맑음', symbolName: 'sun.max', apparentTemperatureC: 3, temperatureC: 5, windMps: 1 },
      now: new Date(2026, 11, 20, 11, 0)
    })
    expect(o.tp).toBe(5)
    expect(o.ac).toBe('beanie-watch-sun-glove-jacket')
  })

  it('겉옷: 0°C 이하·눈 보온 재킷, 5°C 바람막이, 10°C 조끼(바람·비면 바람막이), 15~20°C 는 비·강풍만, 25°C 이상 없음', () => {
    const calm = { weather: 'clear' as const, windMps: 2 }
    expect(sceneOuterwear({ band: -10, ...calm })).toBe('thermo')
    expect(sceneOuterwear({ band: 0, ...calm })).toBe('thermo')
    expect(sceneOuterwear({ band: 5, weather: 'snow', windMps: null })).toBe('thermo')
    expect(sceneOuterwear({ band: 5, ...calm })).toBe('jacket')
    expect(sceneOuterwear({ band: 10, ...calm })).toBe('padvest')
    expect(sceneOuterwear({ band: 10, weather: 'clear', windMps: 6 })).toBe('jacket')
    expect(sceneOuterwear({ band: 15, ...calm })).toBeNull()
    expect(sceneOuterwear({ band: 20, weather: 'rain', windMps: null })).toBe('jacket')
    expect(sceneOuterwear({ band: 15, weather: 'cloudy', windMps: 5.5 })).toBe('jacket')
    expect(sceneOuterwear({ band: 25, weather: 'rain', windMps: 9 })).toBeNull()
  })

  it('후드 올림: 아주 센 바람(모자 위로)·-10°C·영하 바람·추운 비 — 후드 없는 조끼면 안 올린다', () => {
    expect(sceneHoodUp({ band: 15, weather: 'cloudy', windMps: 9, outer: 'jacket' })).toBe(true)
    expect(sceneHoodUp({ band: -10, weather: 'clear', windMps: 0, outer: 'thermo' })).toBe(true)
    expect(sceneHoodUp({ band: -5, weather: 'clear', windMps: 4, outer: 'thermo' })).toBe(true)
    expect(sceneHoodUp({ band: -5, weather: 'clear', windMps: 2, outer: 'thermo' })).toBe(false)
    expect(sceneHoodUp({ band: 5, weather: 'rain', windMps: 1, outer: 'jacket' })).toBe(true)
    expect(sceneHoodUp({ band: 15, weather: 'rain', windMps: 1, outer: 'jacket' })).toBe(false)
    expect(sceneHoodUp({ band: 10, weather: 'clear', windMps: 9, outer: 'padvest' })).toBe(false)
  })

  it('바람 센 쌀쌀한 날(체감 15·풍속 9): 캡 위로 후드 올린 바람막이', () => {
    const o = buildSceneOptions({
      sex: 'female',
      sessionType: 'Easy',
      weather: { condition: '흐림', symbolName: 'cloud', apparentTemperatureC: 15, temperatureC: 15, windMps: 9 },
      now: new Date(2026, 3, 10, 7, 0)
    })
    expect(o.ac).toBe('cap-watch-jacket-hood')
  })

  it('쌀쌀한 아침 LSD(체감 10): 조끼 위에 물병 조끼', () => {
    const o = buildSceneOptions({
      sex: 'male',
      sessionType: 'LSD',
      weather: { condition: '흐림', symbolName: 'cloud', apparentTemperatureC: 10, temperatureC: 12, windMps: null },
      now: new Date(2026, 9, 25, 7, 0)
    })
    expect(o.ac).toBe('cap-watch-padvest-vest')
  })

  it('맑은 낮 이지(체감 16 → 15단계): 선글라스, 겉옷 없음', () => {
    const o = buildSceneOptions({
      sex: 'female',
      sessionType: 'Easy',
      weather: { condition: '맑음', symbolName: 'sun.max', apparentTemperatureC: 16, temperatureC: 16, windMps: 1 },
      now: new Date(2026, 4, 15, 10, 0)
    })
    expect(o).toMatchObject({ sx: 'f', rn: 'easy', tp: 15, tm: 10 })
    expect(o.ac).toBe('cap-watch-sun')
  })
})

describe('forecastWeather — 코치 탭에서 다른 날 다시 보기', () => {
  const daily = [
    { date: '2026-11-08', minTemperatureC: 4, maxTemperatureC: 14, precipitationChance: 60, precipitationAmountMm: 2, symbolName: 'cloud.rain', condition: '비' }
  ]
  it('그날 예보: 옷은 최저·최고 가운데, 아이콘 줄엔 체감온도를 지어내지 않는다', () => {
    expect(forecastWeather(daily, '2026-11-08')).toEqual({
      scene: { condition: '비', symbolName: 'cloud.rain', apparentTemperatureC: null, temperatureC: 9, windMps: null },
      badge: { label: '비', feltC: null }
    })
  })
  it('예보 밖이면 날씨 없음', () => {
    expect(forecastWeather(daily, '2026-11-20')).toEqual({ scene: null, badge: null })
  })
})

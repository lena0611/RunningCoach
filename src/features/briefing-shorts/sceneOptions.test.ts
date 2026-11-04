import { describe, expect, it } from 'vitest'
import { buildSceneOptions, sceneOutfit, sceneRunKind, sceneSex, sceneWeather } from './sceneOptions'

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

  it('체감온도 → 옷, 날씨 없으면 달로', () => {
    expect(sceneOutfit(25, 11)).toBe('summer')
    expect(sceneOutfit(12, 7)).toBe('mild')
    expect(sceneOutfit(3, 7)).toBe('winter')
    expect(sceneOutfit(null, 8)).toBe('summer')
    expect(sceneOutfit(null, 1)).toBe('winter')
    expect(sceneOutfit(null, 4)).toBe('mild')
  })

  it('추운 밤 템포: 겨울 옷·장갑·넥워머, 밤이라 선글라스 없음', () => {
    const o = buildSceneOptions({
      sex: 'unknown',
      sessionType: 'Tempo',
      weather: { condition: '맑음', symbolName: 'moon', apparentTemperatureC: -3, temperatureC: 1 },
      now: new Date(2026, 0, 15, 20, 30)
    })
    expect(o).toMatchObject({ sx: 'm', rn: 'tempo', wx: 'clear', tp: 'winter', tm: 20.5, dy: 15 })
    expect(o.ac.split('-')).toEqual(['cap', 'watch', 'glove', 'buff'])
  })

  it('맑은 낮 이지: 선글라스', () => {
    const o = buildSceneOptions({
      sex: 'female',
      sessionType: 'Easy',
      weather: { condition: '맑음', symbolName: 'sun.max', apparentTemperatureC: 16, temperatureC: 16 },
      now: new Date(2026, 4, 15, 10, 0)
    })
    expect(o).toMatchObject({ sx: 'f', rn: 'easy', tp: 'mild', tm: 10 })
    expect(o.ac).toBe('cap-watch-sun')
  })
})

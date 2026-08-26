import { describe, expect, it } from 'vitest'
import {
  feltTemperatureC,
  getHumidityLoad,
  getOutfitRecommendation,
  getRunningSafety,
  outfitBucketIndex
} from './runningWeather'

describe('feltTemperatureC (계절분기)', () => {
  it('여름 고온다습은 기온보다 높게 느껴진다', () => {
    const felt = feltTemperatureC(31, 75, 1)
    expect(felt).not.toBeNull()
    expect(felt as number).toBeGreaterThan(31)
  })

  it('겨울 강풍은 풍속냉각으로 기온보다 낮다', () => {
    const felt = feltTemperatureC(0, 50, 5)
    expect(felt as number).toBeLessThan(0)
  })

  it('겨울이라도 바람이 약하면(<=1.3m/s) 기온 그대로', () => {
    expect(feltTemperatureC(5, 50, 1)).toBe(5)
  })

  it('중간 구간(10~20℃)은 기온 그대로', () => {
    expect(feltTemperatureC(15, 50, 2)).toBe(15)
  })

  it('기온이 없으면 null', () => {
    expect(feltTemperatureC(null, 50, 2)).toBeNull()
  })
})

describe('outfitBucketIndex (5℃ 단위 10버킷)', () => {
  it.each([
    [-15, 0],
    [-10, 1],
    [-3, 2],
    [0, 3],
    [12, 5],
    [17, 6],
    [27, 8],
    [30, 9],
    [40, 9]
  ])('felt %p -> bucket %p', (felt, expected) => {
    expect(outfitBucketIndex(felt)).toBe(expected)
  })

  it('null이면 -1', () => {
    expect(outfitBucketIndex(null)).toBe(-1)
  })
})

describe('getOutfitRecommendation', () => {
  it('체감온도로 버킷 추천을 만든다', () => {
    const rec = getOutfitRecommendation(12)
    expect(rec).not.toBeNull()
    expect(rec?.bucketIndex).toBe(5)
    expect(rec?.top).toContain('반팔')
  })

  it('비/강풍이면 액세서리를 추가한다', () => {
    const rec = getOutfitRecommendation(8, { rain: true, windy: true })
    expect(rec?.accessories.some((a) => a.includes('방수'))).toBe(true)
    expect(rec?.accessories.some((a) => a.includes('바람막이'))).toBe(true)
  })

  it('체감온도가 없으면 null', () => {
    expect(getOutfitRecommendation(null)).toBeNull()
  })
})

describe('getRunningSafety', () => {
  it('체감 고온은 더위 위험', () => {
    const s = getRunningSafety({ temperatureC: 33, apparentTemperatureC: 35, humidity: 70, windMps: 1, precipitationChance: 0, precipitationAmountMm: 0 })
    expect(s.level).toBe('bad')
    expect(s.kind).toBe('heat')
  })

  it('체감 혹한은 추위 위험', () => {
    const s = getRunningSafety({ temperatureC: -10, apparentTemperatureC: -12, humidity: 50, windMps: 4, precipitationChance: 0, precipitationAmountMm: 0 })
    expect(s.level).toBe('bad')
    expect(s.kind).toBe('cold')
  })

  it('높은 강수확률은 비 주의', () => {
    const s = getRunningSafety(
      { temperatureC: 15, apparentTemperatureC: 15, humidity: 60, windMps: 2, precipitationChance: 0.7, precipitationAmountMm: 1 },
      [{ temperatureC: 15, apparentTemperatureC: 15, humidity: 60, windMps: 2, precipitationChance: 0.8, precipitationAmountMm: 2 }]
    )
    expect(s.level).toBe('caution')
    expect(s.kind).toBe('rain')
  })

  it('무난한 조건은 good', () => {
    const s = getRunningSafety({ temperatureC: 15, apparentTemperatureC: 15, humidity: 55, windMps: 2, precipitationChance: 0.1, precipitationAmountMm: 0 })
    expect(s.level).toBe('good')
    expect(s.kind).toBe('mild')
  })

  it('데이터 없으면 unknown', () => {
    expect(getRunningSafety(null).level).toBe('unknown')
  })
})

describe('getHumidityLoad', () => {
  it('높은 습도 경고', () => {
    expect(getHumidityLoad(85)?.level).toBe('high')
  })
  it('null이면 null', () => {
    expect(getHumidityLoad(null)).toBeNull()
  })
})

describe('환경 안내는 안전을 보증하지 않는다 (#712 SSOT 정합)', () => {
  it('무난한 조건에서도 "안전/무난합니다" 식 보증 문구를 쓰지 않는다', () => {
    // 체감온도는 복사열·개인 상태(질환·약물·열순응)를 모른다. "무난합니다"는 안전 보증으로 읽힌다.
    const safety = getRunningSafety({
      temperatureC: 15, apparentTemperatureC: 15, humidity: 0.5,
      windMps: 1, precipitationChance: 0, precipitationAmountMm: 0
    })
    expect(safety.level).toBe('good')
    expect(safety.summary).not.toMatch(/무난합니다|안전합니다|괜찮습니다/)
    expect(safety.summary).toMatch(/몸 상태/)
  })

  it('더위 안내는 페이스 저하를 정상으로 말하고 중단 신호를 함께 준다', () => {
    // SSOT §외부 조건: 심박 상한을 올리지 않고, 페이스는 낮추며, 증상은 숫자보다 우선한다.
    const safety = getRunningSafety({
      temperatureC: 31, apparentTemperatureC: 33, humidity: 0.8,
      windMps: 1, precipitationChance: 0, precipitationAmountMm: 0
    })
    expect(safety.kind).toBe('heat')
    expect(safety.summary).toMatch(/느려지는 게 정상/)
    expect(safety.bullets.join(' ')).toMatch(/즉시 중단/)
  })
})

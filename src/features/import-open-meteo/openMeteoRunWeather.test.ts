import { describe, expect, it } from 'vitest'
import { groupByArea, pickAtStart } from './openMeteoRunWeather'

const series = {
  time: ['2026-08-10T05:00', '2026-08-10T06:00', '2026-08-10T07:00'],
  temperature: [23.9, 23.7, 25.7],
  humidity: [82, 81, 79]
}

describe('openMeteoRunWeather (#838)', () => {
  it('시작 시각 값을 앞뒤 정시 사이 선형보간으로 뽑는다 — 시간축은 UTC', () => {
    // 06:30Z → 23.7 과 25.7 의 가운데
    expect(pickAtStart(series, '2026-08-10T06:30:00Z')).toEqual({ temperature: 24.7, humidity: 80 })
    // 같은 순간을 KST 로 줘도 같은 값이다(타임존 변환이 끼지 않는다)
    expect(pickAtStart(series, '2026-08-10T15:30:00+09:00')).toEqual({ temperature: 24.7, humidity: 80 })
  })

  it('정시면 그 값 그대로, 마지막 칸이면 다음 칸 없이 그 값', () => {
    expect(pickAtStart(series, '2026-08-10T05:00:00Z')).toEqual({ temperature: 23.9, humidity: 82 })
    expect(pickAtStart(series, '2026-08-10T07:20:00Z')).toEqual({ temperature: 25.7, humidity: 79 })
  })

  it('범위 밖이거나 기온이 비면 추정하지 않는다 — 습도만 있는 추정은 저장하지 않는다', () => {
    expect(pickAtStart(series, '2026-08-11T06:00:00Z')).toBeNull()
    expect(pickAtStart({ ...series, temperature: [null, null, null] }, '2026-08-10T06:00:00Z')).toBeNull()
    expect(pickAtStart(series, 'not-a-date')).toBeNull()
  })

  it('같은 동네(0.1° 격자) 런은 요청 하나로 묶는다', () => {
    const groups = groupByArea([
      { id: 'a', startAt: '2026-08-10T06:00:00Z', latitude: 37.441, longitude: 126.888 },
      { id: 'b', startAt: '2026-09-10T06:00:00Z', latitude: 37.447, longitude: 126.891 },
      { id: 'c', startAt: '2026-09-10T06:00:00Z', latitude: 35.1, longitude: 129.0 }
    ])
    expect(groups.size).toBe(2)
    expect(groups.get('37.4,126.9')?.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

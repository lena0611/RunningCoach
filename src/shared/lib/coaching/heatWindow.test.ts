import { describe, expect, it } from 'vitest'
import { assessHeatWindow, deriveHabitualRunHour, type HeatHourPoint } from './heatWindow'
import { HEAT_CONFOUND_FELT_C } from './weatherStress'

// (#729) "오늘 체감 31도" 한 줄은 아무에게도 안 맞는 숫자다 — 조회한 순간의 값이고, 혹서기
// 하루는 아침 26도에서 오후 34도까지 벌어진다. 시간대별로 읽어야 한다.

function hour(h: number, feltC: number, humidity: number | null = 70): HeatHourPoint {
  const hh = String(h).padStart(2, '0')
  return { time: `2026-08-01T${hh}:00:00`, temperatureC: feltC, apparentTemperatureC: feltC, humidity }
}

/** 아침은 서늘하고 한낮에 치솟는 전형적 혹서기 하루. */
const summerDay: HeatHourPoint[] = [
  hour(5, 24), hour(6, 25), hour(7, 26), hour(8, 28), hour(9, 30),
  hour(10, 32), hour(11, 33), hour(12, 34), hour(13, 35), hour(14, 35),
  hour(15, 34), hour(16, 33), hour(17, 31), hour(18, 29), hour(19, 27),
  hour(20, 26), hour(21, 25)
]

describe('deriveHabitualRunHour (#729)', () => {
  it('가장 자주 뛴 시각을 습관 시간대로 본다', () => {
    const runs = [{ startAt: '2026-07-01T19:10:00' }, { startAt: '2026-07-03T19:40:00' }, { startAt: '2026-07-05T19:05:00' }]
    expect(deriveHabitualRunHour(runs)).toBe(19)
  })

  it('표본이 얇으면 null — 추측하지 않는다', () => {
    expect(deriveHabitualRunHour([{ startAt: '2026-07-01T19:10:00' }])).toBeNull()
    expect(deriveHabitualRunHour([])).toBeNull()
  })

  it('시간대가 흩어져 있으면 null — 특정 시각을 우겨넣지 않는다', () => {
    const scattered = [
      { startAt: '2026-07-01T06:00:00' }, { startAt: '2026-07-02T12:00:00' },
      { startAt: '2026-07-03T15:00:00' }, { startAt: '2026-07-04T19:00:00' },
      { startAt: '2026-07-05T21:00:00' }, { startAt: '2026-07-06T09:00:00' },
      { startAt: '2026-07-07T17:00:00' }, { startAt: '2026-07-08T08:00:00' }
    ]
    expect(deriveHabitualRunHour(scattered)).toBeNull()
  })

  it('아침·저녁 두 봉우리여도 최빈 시각을 고른다 — 중앙값이면 아무도 안 뛰는 한낮이 나온다', () => {
    const bimodal = [
      { startAt: '2026-07-01T06:00:00' }, { startAt: '2026-07-02T06:00:00' }, { startAt: '2026-07-03T06:00:00' },
      { startAt: '2026-07-04T20:00:00' }, { startAt: '2026-07-05T20:00:00' }
    ]
    expect(deriveHabitualRunHour(bimodal)).toBe(6)
  })

  // 정시 버킷만 세면 "늘 7시쯤 뛰는 사람"이 6시와 7시로 쪼개져 시간대 불명으로 떨어진다.
  // 실제로는 가장 일정한 러너가 조건 안내를 못 받는 결함이라 ±1시간을 한 덩어리로 센다.
  it('6:50·7:10 처럼 정시 경계에 걸쳐도 한 시간대로 본다', () => {
    const runs = [{ startAt: '2026-07-01T06:50:00' }, { startAt: '2026-07-03T07:10:00' }, { startAt: '2026-07-05T06:30:00' }]
    expect(deriveHabitualRunHour(runs)).toBe(6)
  })

  it('startAt 없는 기록은 건너뛴다', () => {
    const runs = [{ startAt: null }, { startAt: '2026-07-01T07:00:00' }, { startAt: '2026-07-02T07:00:00' }, { startAt: '2026-07-03T07:00:00' }]
    expect(deriveHabitualRunHour(runs)).toBe(7)
  })
})

describe('assessHeatWindow (#729)', () => {
  it('한낮에 뛰는 사람은 덥다고, 아침에 뛰는 사람은 안 덥다고 나온다 — 같은 날 같은 예보로', () => {
    const noon = assessHeatWindow(summerDay, 13, 5)!
    const dawn = assessHeatWindow(summerDay, 6, 5)!
    expect(noon.hot).toBe(true)
    expect(dawn.hot).toBe(false)
  })

  it('더위 임계는 사후 채점과 같은 값을 쓴다(SSOT §브리핑↔채점 일관성)', () => {
    const atThreshold = assessHeatWindow([hour(9, HEAT_CONFOUND_FELT_C)], 9, 5)!
    const justBelow = assessHeatWindow([hour(9, HEAT_CONFOUND_FELT_C - 0.1)], 9, 5)!
    expect(atThreshold.hot).toBe(true)
    expect(justBelow.hot).toBe(false)
  })

  it('의미 있게 서늘한 시간대가 있으면 알려준다', () => {
    const noon = assessHeatWindow(summerDay, 13, 12)!
    expect(noon.better).not.toBeNull()
    expect(noon.better!.hour).toBe(21)
    expect(noon.better!.feltC).toBe(25)
  })

  it('지나간 시간은 대안으로 제시하지 않는다 — 아침이 시원했다고 오후에 말해봐야 조언이 아니다', () => {
    const evening = assessHeatWindow(summerDay, 17, 17)!
    expect(evening.better?.hour ?? 99).toBeGreaterThanOrEqual(17)
  })

  it('차이가 미미하면 옮기라고 하지 않는다 — 옮겨봐야 체감이 같다', () => {
    const flat = [hour(18, 30), hour(19, 29), hour(20, 28.5)]
    expect(assessHeatWindow(flat, 18, 18)!.better).toBeNull()
  })

  it('남은 시간대가 전부 임계 초과면 allDayHot — 시간을 옮겨서 풀 문제가 아니다', () => {
    const scorcher = [hour(15, 34), hour(16, 33), hour(17, 32), hour(18, 31), hour(19, 30)]
    const at = assessHeatWindow(scorcher, 15, 15)!
    expect(at.allDayHot).toBe(true)
  })

  it('임계 아래 시간대가 하나라도 남아 있으면 allDayHot 이 아니다', () => {
    expect(assessHeatWindow(summerDay, 13, 12)!.allDayHot).toBe(false)
  })

  it('새벽·심야는 대안으로 제안하지 않는다(러닝 가능 시간대 가드)', () => {
    const withNight = [...summerDay, { ...hour(3, 20), time: '2026-08-01T03:00:00' }]
    const noon = assessHeatWindow(withNight, 13, 5)!
    expect(noon.better!.hour).toBeGreaterThanOrEqual(5)
  })

  it('예보에 해당 시각이 없으면 null — 없는 값을 지어내지 않는다', () => {
    expect(assessHeatWindow(summerDay, 2, 0)).toBeNull()
    expect(assessHeatWindow([], 9, 5)).toBeNull()
  })

  it('체감온도가 없으면 기온·습도로 산출한다', () => {
    const raw: HeatHourPoint[] = [{ time: '2026-08-01T14:00:00', temperatureC: 33, apparentTemperatureC: null, humidity: 80 }]
    const at = assessHeatWindow(raw, 14, 14)
    expect(at).not.toBeNull()
    expect(at!.hot).toBe(true)
  })

  // 2026-08-31 라이브에서 실제로 걸린 버그: 스냅샷 습도는 0~1 분수(강수확률과 같은 규약)인데
  // 그대로 쓰면 브리핑이 "습도 1%"를 찍고, 체감온도 공식(RH를 %로 받음)에 0.9를 먹여 크게 과소평가한다.
  it('0~1 분수 습도를 %로 환산한다', () => {
    const fraction: HeatHourPoint[] = [{ time: '2026-08-01T20:00:00', temperatureC: 24, apparentTemperatureC: 25.6, humidity: 0.9 }]
    expect(assessHeatWindow(fraction, 20, 20)!.humidity).toBe(90)
  })

  it('이미 %로 온 습도는 건드리지 않는다', () => {
    const percent: HeatHourPoint[] = [{ time: '2026-08-01T20:00:00', temperatureC: 24, apparentTemperatureC: 25.6, humidity: 85 }]
    expect(assessHeatWindow(percent, 20, 20)!.humidity).toBe(85)
  })

  it('체감온도가 없을 때 분수 습도로도 더위를 정확히 잡는다(과소평가 회귀)', () => {
    const fraction: HeatHourPoint[] = [{ time: '2026-08-01T14:00:00', temperatureC: 33, apparentTemperatureC: null, humidity: 0.8 }]
    const percent: HeatHourPoint[] = [{ time: '2026-08-01T14:00:00', temperatureC: 33, apparentTemperatureC: null, humidity: 80 }]
    expect(assessHeatWindow(fraction, 14, 14)!.feltC).toBe(assessHeatWindow(percent, 14, 14)!.feltC)
  })
})

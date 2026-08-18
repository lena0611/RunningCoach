import { describe, expect, it } from 'vitest'
import {
  detrainingRetention,
  findRecentLayoff,
  preLayoffWeeklyKm,
  recentCapableWeeklyKm,
  deriveWeeklyVolumeAnchorKm
} from './returnAnchor'

const today = new Date('2026-08-18T12:00:00')
const daysAgo = (n: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const run = (n: number, km: number) => ({ date: daysAgo(n), distanceKm: km })

describe('detrainingRetention (SSOT 디트레이닝 4주 경계)', () => {
  it('2주 미만은 깎지 않는다 — 손실 대부분이 혈장량이고 복귀 며칠 내 회복된다', () => {
    expect(detrainingRetention(0)).toBe(1)
    expect(detrainingRetention(13)).toBe(1)
  })

  it('2~4주 ~-6%, 8주 이상 -16% 로 안정화', () => {
    expect(detrainingRetention(14)).toBe(0.94)
    expect(detrainingRetention(27)).toBe(0.94)
    expect(detrainingRetention(56)).toBe(0.84)
    expect(detrainingRetention(180)).toBe(0.84)
  })

  it('4~8주는 단조 감소로 보간한다', () => {
    const a = detrainingRetention(28)
    const b = detrainingRetention(42)
    const c = detrainingRetention(55)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })
})

describe('findRecentLayoff', () => {
  it('현재 공백이 아니라 **끝난 공백**을 찾는다', () => {
    // 어제 뛰었지만 그 전에 28일을 쉬었다 — 복귀 직후 상황.
    const runs = [run(1, 4), run(2, 4), run(30, 5), run(33, 5)]
    const layoff = findRecentLayoff(runs.map((r) => r.date), today)
    expect(layoff).not.toBeNull()
    expect(layoff!.days).toBe(28)
  })

  it('7일 미만 간격은 공백으로 보지 않는다(평상시 변동)', () => {
    const runs = [run(1, 4), run(4, 4), run(9, 4), run(14, 4)]
    expect(findRecentLayoff(runs.map((r) => r.date), today)).toBeNull()
  })

  it('런이 하나뿐이면 판정하지 않는다', () => {
    expect(findRecentLayoff([daysAgo(3)], today)).toBeNull()
  })
})

describe('preLayoffWeeklyKm', () => {
  it('공백 시작 직전 4주의 주당 평균을 쓴다(시즌 최고가 아니다)', () => {
    // 공백 시작 40일 전. 그 직전 4주에 40km, 훨씬 예전에 큰 볼륨(160km)이 있어도 끌어오지 않는다.
    const layoffStart = new Date(today)
    layoffStart.setDate(layoffStart.getDate() - 40)
    layoffStart.setHours(0, 0, 0, 0)
    const runs = [
      run(45, 10), run(52, 10), run(59, 10), run(66, 10), // 직전 4주 = 40km → 10km/주
      run(120, 80), run(127, 80) // 옛 고볼륨 — 무시돼야 한다
    ]
    expect(preLayoffWeeklyKm(runs, layoffStart.getTime())).toBe(10)
  })
})

describe('recentCapableWeeklyKm', () => {
  it('공백을 섞은 30일 평균이 아니라 최근 3주 최고 7일 합을 쓴다', () => {
    // 최근 6일에 18km, 그 앞은 한 달 공백 → 30일 평균이면 ~4km 로 과소평가된다.
    const runs = [run(1, 3), run(2, 4), run(3, 4), run(5, 3), run(6, 4), run(40, 5)]
    expect(recentCapableWeeklyKm(runs, today)).toBe(18)
  })

  it('런이 없으면 0', () => {
    expect(recentCapableWeeklyKm([], today)).toBe(0)
  })
})

describe('deriveWeeklyVolumeAnchorKm', () => {
  it('공백이 최근 볼륨을 눌렀으면 복원 후보로 끌어올린다', () => {
    // 복귀 직후 아주 조금만 뛴 상태(주 2km). 공백 직전엔 20km/주였다.
    const runs = [
      run(1, 1), run(3, 1), // 최근 = 2km/주
      run(32, 5), run(39, 5), run(46, 5), run(53, 5) // 공백 직전 4주 = 20km → 5km/주
    ]
    const r = deriveWeeklyVolumeAnchorKm(runs, today)
    expect(r.layoffDays).toBeGreaterThanOrEqual(28)
    expect(r.restored).toBe(true)
    // 복원값(5 × 0.93 ≈ 4.7)이 최근(2)보다 크므로 앵커가 올라간다.
    expect(r.anchorKm).toBeGreaterThan(r.recentKm)
  })

  it('최근에 더 많이 뛰고 있으면 그 값을 깎지 않는다', () => {
    const runs = [
      run(1, 6), run(3, 6), run(5, 6), // 최근 18km/주
      run(35, 2), run(42, 2) // 공백 직전은 적었다
    ]
    const r = deriveWeeklyVolumeAnchorKm(runs, today)
    expect(r.restored).toBe(false)
    expect(r.anchorKm).toBe(r.recentKm)
  })

  it('유의미한 공백이 없으면 보정하지 않는다', () => {
    const runs = [run(1, 5), run(4, 5), run(8, 5), run(12, 5)]
    const r = deriveWeeklyVolumeAnchorKm(runs, today)
    expect(r.layoffDays).toBe(0)
    expect(r.restored).toBe(false)
  })

  it('축소 나선을 막는다 — 처방을 작게 뛰어도 앵커가 공백 직전 수준을 기억한다', () => {
    // 실사고 재현: 복귀 후 아주 짧게만 뛰는 상태가 이어져도 앵커가 0 으로 수렴하지 않는다.
    const tiny = [run(1, 0.2), run(3, 0.2), run(5, 0.2)]
    const withHistory = [...tiny, run(35, 4), run(42, 4), run(49, 4), run(56, 4)]
    const r = deriveWeeklyVolumeAnchorKm(withHistory, today)
    expect(r.anchorKm).toBeGreaterThan(1)
  })
})

import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { assessGoalFeasibility, type GoalFeasibilityInput } from '@/shared/lib/coaching/periodizedSchedule'
import { defaultRaceWeeks, earliestFeasibleRaceDate, recommendedRaceDate } from '@/shared/lib/coaching/raceDate'

// 2026-10-27 = 화요일
const today = new Date('2026-10-27T09:00:00')

function goal(distanceKm: number): TrainingGoal {
  return {
    id: 'g1',
    title: '대회',
    category: 'race',
    startDate: null,
    targetDate: null,
    distanceKm,
    targetDurationSec: null,
    priority: 1,
    status: 'active',
    successCriteria: '',
    strategyNotes: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

const profile = { weeklyRunDaysTarget: 4, preferredLongRunDay: '토요일', personalBests: [] } as unknown as AthleteProfile

function input(distanceKm: number, currentWeeklyKm: number): GoalFeasibilityInput {
  return { goal: goal(distanceKm), profile, today, currentWeeklyKm }
}

function feasibleOn(base: GoalFeasibilityInput, date: string): boolean {
  return assessGoalFeasibility({ ...base, goal: { ...base.goal, targetDate: date } }).feasible
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00`).getDay()
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('defaultRaceWeeks — 날짜가 없을 때 준비 기간', () => {
  it('Higdon Novice 플랜 길이: 5K·10K 8주, 하프 12주, 풀 18주', () => {
    expect(defaultRaceWeeks(5, false)).toBe(8)
    expect(defaultRaceWeeks(10, false)).toBe(8)
    expect(defaultRaceWeeks(21.0975, false)).toBe(12)
    expect(defaultRaceWeeks(42.195, false)).toBe(18)
  })

  it('입문: 5K 는 걷기·뛰기 9주가 곧 준비, 더 긴 거리는 9주를 앞에 더한다', () => {
    expect(defaultRaceWeeks(5, true)).toBe(9)
    expect(defaultRaceWeeks(10, true)).toBe(17)
    expect(defaultRaceWeeks(21.0975, true)).toBe(21)
    expect(defaultRaceWeeks(42.195, true)).toBe(27)
  })
})

describe('recommendedRaceDate — 날짜가 아직 없을 때', () => {
  it('입문 5K: 9주 뒤 첫 일요일, 기본 길이 그대로', () => {
    const r = recommendedRaceDate(input(5, 7.2), true)
    expect(dayOfWeek(r.date)).toBe(0)
    expect(r.weeks).toBe(9)
    expect(r.extended).toBe(false)
    // 9주(63일) 뒤 화요일 12/29 → 그 뒤 첫 일요일
    expect(r.date).toBe('2027-01-03')
  })

  it('추천 날짜는 코치 실현가능성 판정을 통과한다(온보딩이 잡아 준 날을 코치가 무리라고 하지 않게)', () => {
    for (const [km, current, entry] of [[5, 7.2, true], [10, 12, false], [21.0975, 16, false], [42.195, 16, false]] as const) {
      const base = input(km, current)
      expect(feasibleOn(base, recommendedRaceDate(base, entry).date)).toBe(true)
    }
  })

  it('기본 길이로는 무리면 안전하게 닿는 날까지 늦춘다', () => {
    const base = input(42.195, 3)
    const r = recommendedRaceDate(base, false)
    expect(r.extended).toBe(true)
    expect(r.weeks).toBeGreaterThan(18)
    expect(feasibleOn(base, r.date)).toBe(true)
  })
})

describe('earliestFeasibleRaceDate — 무리한 날짜를 미룰 곳', () => {
  it('닿는 가장 이른 일요일 — 그 전 일요일은 무리다', () => {
    const base = input(21.0975, 7)
    const r = earliestFeasibleRaceDate(base)
    expect(r).not.toBeNull()
    expect(dayOfWeek(r!.date)).toBe(0)
    expect(feasibleOn(base, r!.date)).toBe(true)
    expect(feasibleOn(base, shift(r!.date, -7))).toBe(false)
  })

  it('이미 충분히 뛰면 다음 주 일요일부터 된다', () => {
    const r = earliestFeasibleRaceDate(input(5, 30))
    expect(r?.date).toBe('2026-11-08')
    expect(r?.weeks).toBe(1)
  })
})

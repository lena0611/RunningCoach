import { describe, expect, it } from 'vitest'
import { createBlankTrainingMemory, type TrainingGoal } from '@/entities/training-memory/model'
import { goalAdjustOptions, goalAdjustStartDate, isGoalDateFeasible, raceDistanceLabel, type GoalAdjustInput } from '@/shared/lib/coaching/goalAdjust'

const profile = createBlankTrainingMemory().athleteProfile
const tenK: TrainingGoal = { ...createBlankTrainingMemory().goals[0], id: 'g', category: 'race', distanceKm: 10, targetDate: '2026-11-30', targetDurationSec: 3599 }
const input = (over: Partial<GoalAdjustInput>): GoalAdjustInput => ({
  goal: tenK,
  profile,
  today: new Date('2026-10-28T09:00:00'),
  currentWeeklyKm: 5.2,
  recentLongestKm: null,
  projectedSec: null,
  restUntil: null,
  ...over
})

describe('goalAdjustOptions (#889)', () => {
  it('부상 휴식 중 10K(주 5km) — 휴식 다음 날부터 세어 미루기·거리 낮추기를 낸다 (실계정 2026-10-28)', () => {
    const o = goalAdjustOptions(input({ restUntil: '2026-10-31' }))
    expect(o.startDate).toBe('2026-11-01')
    expect(o.feasibleNow).toBe(false)
    expect(o.postpone).toEqual({ date: '2027-01-10', weeks: 10 })
    expect(o.shorter).toEqual({ distanceKm: 5, date: '2026-12-20', weeks: 7 })
  })

  it('휴식이 없으면 오늘부터 센다 — 날짜가 더 이르다', () => {
    const o = goalAdjustOptions(input({}))
    expect(o.startDate).toBe('2026-10-28')
    expect(o.postpone!.date < '2027-01-10').toBe(true)
  })

  it('지금 날짜가 안전하면 미루기 대신 같은 날 짧은 거리', () => {
    const o = goalAdjustOptions(input({ currentWeeklyKm: 25, goal: { ...tenK, targetDate: '2027-02-28' } }))
    expect(o.feasibleNow).toBe(true)
    expect(o.postpone).toBeNull()
    expect(o.shorter).toMatchObject({ distanceKm: 5, date: '2027-02-28' })
  })

  it('5K 는 더 짧은 거리가 없다', () => {
    expect(goalAdjustOptions(input({ goal: { ...tenK, distanceKm: 5 } })).shorter).toBeNull()
  })

  it('직접 고른 날짜의 안전 판정도 같은 시작일로', () => {
    const i = input({ restUntil: '2026-10-31' })
    expect(isGoalDateFeasible(i, '2027-01-10')).toBe(true)
    expect(isGoalDateFeasible(i, '2026-12-13')).toBe(false)
  })

  it('지난 휴식은 시작일을 미루지 않는다', () => {
    expect(goalAdjustStartDate(new Date('2026-11-05T09:00:00'), '2026-10-31').getDate()).toBe(5)
  })

  it('거리 이름', () => {
    expect([5, 10, 21.0975, 42.195].map(raceDistanceLabel)).toEqual(['5K', '10K', '하프', '풀'])
  })
})

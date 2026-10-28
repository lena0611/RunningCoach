import { describe, expect, it } from 'vitest'
import { createBlankTrainingMemory, normalizeTrainingMemory, RECOVERY_GOAL_ID, type TrainingMemory } from '@/entities/training-memory/model'
import { applyGoalChange, pausedGoals } from '@/entities/training-memory/goalChanges'

const now = '2026-10-28T03:00:00.000Z'
function memoryWithRace(): TrainingMemory {
  const blank = createBlankTrainingMemory()
  return {
    ...blank,
    goals: [{ ...blank.goals[0], id: 'g10k', title: '11월 레이싱', category: 'race', distanceKm: 10, targetDate: '2026-11-30', targetDurationSec: 3599 }],
    activeGoalId: 'g10k'
  }
}

describe('applyGoalChange (#889)', () => {
  it('미루기 — 날짜만 바꾸고 지난 수락 기록은 지운다', () => {
    const m = applyGoalChange({ ...memoryWithRace(), goals: memoryWithRace().goals.map((g) => ({ ...g, feasibilityAcceptedFor: { targetDate: '2026-11-30', distanceKm: 10 } })) }, 'g10k', { kind: 'postpone', targetDate: '2027-01-10' }, now)
    expect(m.goals[0]).toMatchObject({ targetDate: '2027-01-10', distanceKm: 10, targetDurationSec: 3599, feasibilityAcceptedFor: null })
  })

  it('거리 낮추기 — 거리·날짜를 바꾸고 기록 목표는 뺀다', () => {
    const m = applyGoalChange(memoryWithRace(), 'g10k', { kind: 'shorter', distanceKm: 5, targetDate: '2026-12-20' }, now)
    expect(m.goals[0]).toMatchObject({ distanceKm: 5, targetDate: '2026-12-20', targetDurationSec: null })
  })

  it('그대로 / 완주만 — 지금 날짜·거리를 수락으로 남긴다(#886)', () => {
    expect(applyGoalChange(memoryWithRace(), 'g10k', { kind: 'keep' }, now).goals[0].feasibilityAcceptedFor).toEqual({ targetDate: '2026-11-30', distanceKm: 10 })
    const finish = applyGoalChange(memoryWithRace(), 'g10k', { kind: 'finish-only' }, now).goals[0]
    expect(finish).toMatchObject({ targetDurationSec: null, feasibilityAcceptedFor: { targetDate: '2026-11-30', distanceKm: 10 } })
  })

  it('잠시 내려놓기 — 대회 목표는 쉬는 중, 회복 우선 목표가 활성', () => {
    const m = applyGoalChange(memoryWithRace(), 'g10k', { kind: 'let-go' }, now)
    expect(m.activeGoalId).toBe(RECOVERY_GOAL_ID)
    expect(m.goals.find((g) => g.id === 'g10k')?.status).toBe('paused')
    expect(m.goals.find((g) => g.id === RECOVERY_GOAL_ID)).toMatchObject({ title: '회복 우선', category: 'health', status: 'active' })
    expect(pausedGoals(m).map((g) => g.id)).toEqual(['g10k'])
    // 정규화를 거쳐도 그대로 남는다
    expect(normalizeTrainingMemory(m).activeGoalId).toBe(RECOVERY_GOAL_ID)
    // 두 번 내려놓아도 회복 목표는 하나
    expect(applyGoalChange(m, 'g10k', { kind: 'let-go' }, now).goals.filter((g) => g.id === RECOVERY_GOAL_ID)).toHaveLength(1)
  })

  it('다시 시작 — 새 날짜로 활성, 회복 우선 목표는 걷어낸다', () => {
    const paused = applyGoalChange(memoryWithRace(), 'g10k', { kind: 'let-go' }, now)
    const m = applyGoalChange(paused, 'g10k', { kind: 'resume', targetDate: '2027-02-21' }, now)
    expect(m.activeGoalId).toBe('g10k')
    expect(m.goals.map((g) => g.id)).toEqual(['g10k'])
    expect(m.goals[0]).toMatchObject({ status: 'active', targetDate: '2027-02-21' })
  })

  it('목표에 남긴 플랜·수락 기록은 정규화를 지나도 보존된다', () => {
    const m = normalizeTrainingMemory({ ...memoryWithRace(), goals: memoryWithRace().goals.map((g) => ({ ...g, planBuiltFor: { targetDate: '2026-11-30', distanceKm: 10 } })) })
    expect(m.goals[0].planBuiltFor).toEqual({ targetDate: '2026-11-30', distanceKm: 10 })
    expect(m.goals[0].feasibilityAcceptedFor).toBeNull()
  })
})

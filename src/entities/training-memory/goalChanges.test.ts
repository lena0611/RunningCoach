import { describe, expect, it } from 'vitest'
import { applyGoalChange, goalResumeSignal } from './goalChanges'
import { createBlankTrainingMemory, normalizeTrainingMemory, type TrainingMemory } from './model'

// (#889 → #891 라이브 QA) 쉬던 대회 목표를 다시 정하자고 언제 묻나. 예전엔 부상이 없으면 곧장 참이라
// 부상 없이 내려놓자마자 "몸이 한결 나아졌어요. 다시 정해볼까요?"가 떴다.

const PAUSED_AT = '2026-10-28T04:00:00.000Z'
const QUIET = 14

function pausedRace(over: Partial<TrainingMemory> = {}): TrainingMemory {
  const blank = createBlankTrainingMemory()
  const race = { ...blank.goals[0], id: 'g5k', title: '5K 완주', category: 'race' as const, distanceKm: 5, targetDate: '2027-01-03' }
  const memory = normalizeTrainingMemory({ ...blank, ...over, goals: [race], activeGoalId: 'g5k' })
  return applyGoalChange(memory, 'g5k', { kind: 'let-go' }, PAUSED_AT)
}

function injury(over: Record<string, unknown>) {
  return { id: 'i1', title: '족저근막', area: '발바닥', status: 'active', ...over } as never
}

describe('goalResumeSignal (#891)', () => {
  it('부상 없이 내려놓은 날엔 묻지 않는다', () => {
    expect(goalResumeSignal(pausedRace(), '2026-10-28', QUIET)).toBeNull()
  })

  it('부상 없이 내려놓았으면 2주 뒤에 묻고, 몸 얘기는 하지 않는다', () => {
    expect(goalResumeSignal(pausedRace(), '2026-11-10', QUIET)).toBeNull()
    expect(goalResumeSignal(pausedRace(), '2026-11-11', QUIET)).toEqual({ goalId: 'g5k', areaLabel: null, pausedOnly: true })
  })

  it('부상 중이면 마지막으로 아픈 날에서 2주가 지나야 묻는다', () => {
    const memory = pausedRace({ injuryItems: [injury({ onsetDate: '2026-10-20', lastFlareDate: '2026-10-25' })] })
    expect(goalResumeSignal(memory, '2026-11-07', QUIET)).toBeNull()
    expect(goalResumeSignal(memory, '2026-11-08', QUIET)).toEqual({ goalId: 'g5k', areaLabel: '발바닥' })
  })

  it('내려놓은 뒤 부상이 해소됐으면 2주를 기다리지 않고 묻는다', () => {
    const memory = pausedRace({ injuryItems: [injury({ status: 'resolved', resolvedAt: '2026-10-31T09:00:00.000Z' })] })
    expect(goalResumeSignal(memory, '2026-11-01', QUIET)).toEqual({ goalId: 'g5k', areaLabel: null })
  })

  it('내려놓기 전에 해소된 부상은 신호가 아니다', () => {
    const memory = pausedRace({ injuryItems: [injury({ status: 'resolved', resolvedAt: '2026-10-01T09:00:00.000Z' })] })
    expect(goalResumeSignal(memory, '2026-11-01', QUIET)).toBeNull()
  })

  it('선언한 휴식 중엔 묻지 않는다', () => {
    const memory = pausedRace({ activeRest: { startDate: '2026-11-05', untilDate: '2026-11-20' } as never })
    expect(goalResumeSignal(memory, '2026-11-15', QUIET)).toBeNull()
    expect(goalResumeSignal(memory, '2026-11-21', QUIET)?.pausedOnly).toBe(true)
  })

  it('회복 우선 목표가 활성이 아니면 묻지 않는다', () => {
    const resumed = applyGoalChange(pausedRace(), 'g5k', { kind: 'resume', targetDate: '2027-02-07' }, '2026-11-20T00:00:00.000Z')
    expect(goalResumeSignal(resumed, '2026-12-20', QUIET)).toBeNull()
  })
})

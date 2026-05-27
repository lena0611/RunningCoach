import { describe, expect, it } from 'vitest'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { detectGoalIntent } from './detectGoalIntent'

describe('detectGoalIntent', () => {
  it('detects pace and zone2 subgoal intent', () => {
    const proposal = detectGoalIntent('700페이스로 심박 존2가 되고 싶다', initialTrainingMemory)

    expect(proposal?.title).toBe("7'00/km에서 Zone 2 유지")
    expect(proposal?.successCriteria).toContain("7'00/km")
    expect(proposal?.successCriteria).toContain('Zone 2')
  })

  it('ignores ordinary coaching notes', () => {
    expect(detectGoalIntent('오늘 이 세션 분석해줘', initialTrainingMemory)).toBeNull()
  })
})

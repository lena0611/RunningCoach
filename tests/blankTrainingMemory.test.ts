import { describe, expect, it } from 'vitest'
import { createBlankTrainingMemory, getActiveInjuryItem } from '@/entities/training-memory/model'

describe('createBlankTrainingMemory (#332)', () => {
  it('개발자 예시 루틴/부상/목표를 담지 않는다', () => {
    const memory = createBlankTrainingMemory()
    expect(memory.weeklyPattern).toEqual([])
    expect(memory.injuryItems).toEqual([])
    expect(getActiveInjuryItem(memory)).toBeNull()
    expect(memory.goal).not.toContain('10km 60분')
    expect(memory.knownIssues).toEqual([])
    expect(memory.longRunStrategy).toBe('')
  })

  it('구조 기본값(처방 템플릿·단계)은 유지한다', () => {
    const memory = createBlankTrainingMemory()
    expect(memory.adaptiveTrainingProfile.prescriptionTemplates.length).toBeGreaterThan(0)
    expect(memory.adaptiveTrainingProfile.trainingPhase.currentPhase).toBe('Base')
  })

  it('중립 활성 목표 1개를 가진다(빈 goals 재시드 방지)', () => {
    const memory = createBlankTrainingMemory()
    expect(memory.goals).toHaveLength(1)
    expect(memory.goals[0].status).toBe('active')
    expect(memory.goals[0].title).not.toContain('10km 60분')
  })

  it('injuryItems:[]가 normalize를 거쳐도 햄스트링으로 재시드되지 않는다(#303)', () => {
    const memory = createBlankTrainingMemory()
    expect(memory.injuryItems.some((item) => item.area.includes('햄스트링'))).toBe(false)
  })
})

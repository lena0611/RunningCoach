import { describe, expect, it } from 'vitest'
import { createBlankTrainingMemory } from '@/entities/training-memory/model'
import { evaluateProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'

// #402: 단계 전환 기준의 phase-awareness — Base엔 Tempo 세션이 없어 Tempo 기준은 N/A.
describe('evaluateProgressionCriteria phase-awareness (#402)', () => {
  const memory = createBlankTrainingMemory()

  it('Base 단계: Tempo 상한 준수는 N/A(평가·집계 제외)', () => {
    const r = evaluateProgressionCriteria([], memory, [], 'Base')
    expect(r.statusMap['tempo-ceiling-quality']).toBe('n/a')
    // 4기준 모두 노출(표시용 — "다음 단계" 힌트와 함께)
    expect(r.criteria.length).toBe(4)
  })

  it('Recovery 단계도 Tempo N/A', () => {
    expect(evaluateProgressionCriteria([], memory, [], 'Recovery').statusMap['tempo-ceiling-quality']).toBe('n/a')
  })

  it('Build 단계: Tempo 기준 적용(데이터 없으면 watch — N/A 아님)', () => {
    const r = evaluateProgressionCriteria([], memory, [], 'Build')
    expect(r.statusMap['tempo-ceiling-quality']).not.toBe('n/a')
  })

  it('phase 미지정이면 모든 기준 평가(Tempo 포함)', () => {
    expect(evaluateProgressionCriteria([], memory, []).statusMap['tempo-ceiling-quality']).not.toBe('n/a')
  })

  it('집계(readyCount/allReady)는 N/A 기준을 제외한다', () => {
    const r = evaluateProgressionCriteria([], memory, [], 'Base')
    // 적용 기준은 3개(Tempo 제외). 데이터 부족이라 전부 ready는 아니므로 allReady=false.
    const applicable = r.criteria.filter((c) => c.status !== 'n/a')
    expect(applicable.length).toBe(3)
    expect(r.readyCount).toBeLessThan(3)
    expect(r.allReady).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { CriterionStatus, EvaluatedProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'
import { evaluatePhaseTransition } from '@/shared/lib/coaching/phaseTransition'

const IDS = ['easy-hr-stability', 'tempo-ceiling-quality', 'long-run-durability', 'injury-recovery-gate']

function evaluated(statuses: Partial<Record<string, CriterionStatus>>): EvaluatedProgressionCriteria {
  const statusMap: Record<string, CriterionStatus> = {}
  for (const id of IDS) statusMap[id] = statuses[id] ?? 'watch'
  const criteria = IDS.map((id) => ({ id, label: id, status: statusMap[id], evidence: '', action: '' }))
  const readyCount = criteria.filter((c) => c.status === 'ready').length
  return { criteria, readyCount, statusMap, allReady: readyCount === IDS.length }
}

const allReady = evaluated({
  'easy-hr-stability': 'ready',
  'tempo-ceiling-quality': 'ready',
  'long-run-durability': 'ready',
  'injury-recovery-gate': 'ready'
})

describe('evaluatePhaseTransition (#337)', () => {
  it('항상 requiresUserConfirm=true (자동 변경 금지)', () => {
    const result = evaluatePhaseTransition('Base', allReady)
    expect(result.requiresUserConfirm).toBe(true)
  })

  it('부상 활성 시 어디서든 Recovery로 전환 제안', () => {
    const result = evaluatePhaseTransition('Build', allReady, { injuryActive: true })
    expect(result.shouldTransition).toBe(true)
    expect(result.toPhase).toBe('Recovery')
  })

  it('이미 Recovery + 부상 활성이면 유지', () => {
    const result = evaluatePhaseTransition('Recovery', allReady, { injuryActive: true })
    expect(result.shouldTransition).toBe(false)
    expect(result.toPhase).toBeNull()
  })

  it('Base → Build: easy/long/injury ready + tempo not-blocked', () => {
    const result = evaluatePhaseTransition(
      'Base',
      evaluated({
        'easy-hr-stability': 'ready',
        'tempo-ceiling-quality': 'watch',
        'long-run-durability': 'ready',
        'injury-recovery-gate': 'ready'
      })
    )
    expect(result.shouldTransition).toBe(true)
    expect(result.toPhase).toBe('Build')
  })

  it('Base 유지: tempo blocked면 전환 안 함', () => {
    const result = evaluatePhaseTransition(
      'Base',
      evaluated({
        'easy-hr-stability': 'ready',
        'tempo-ceiling-quality': 'blocked',
        'long-run-durability': 'ready',
        'injury-recovery-gate': 'ready'
      })
    )
    expect(result.shouldTransition).toBe(false)
    expect(result.blockers.some((b) => b.includes('Tempo'))).toBe(true)
  })

  it('Build → Threshold: 4기준 모두 ready', () => {
    expect(evaluatePhaseTransition('Build', allReady).toPhase).toBe('Threshold')
  })

  it('Build 유지: 하나라도 not-ready면 보류', () => {
    const result = evaluatePhaseTransition('Build', evaluated({ 'easy-hr-stability': 'ready' }))
    expect(result.shouldTransition).toBe(false)
  })

  it('Threshold → Race Specific: 모두 ready + 5km TT + 레이스 8주 이내', () => {
    const result = evaluatePhaseTransition('Threshold', allReady, { hadRecent5kTT: true, weeksToRace: 6 })
    expect(result.toPhase).toBe('Race Specific')
  })

  it('Threshold 유지: 레이스 8주 초과면 보류', () => {
    const result = evaluatePhaseTransition('Threshold', allReady, { hadRecent5kTT: true, weeksToRace: 12 })
    expect(result.shouldTransition).toBe(false)
    expect(result.blockers.some((b) => b.includes('8주'))).toBe(true)
  })

  it('Race Specific → Taper: 레이스 2주 이내', () => {
    expect(evaluatePhaseTransition('Race Specific', allReady, { weeksToRace: 2 }).toPhase).toBe('Taper')
  })

  it('Recovery → Base: 부상 게이트 ready 복귀', () => {
    const result = evaluatePhaseTransition('Recovery', evaluated({ 'injury-recovery-gate': 'ready' }))
    expect(result.toPhase).toBe('Base')
  })

  it('Taper는 자동 전진 없음', () => {
    expect(evaluatePhaseTransition('Taper', allReady, { weeksToRace: 1 }).shouldTransition).toBe(false)
  })
})

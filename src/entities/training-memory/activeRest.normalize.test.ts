import { describe, expect, it } from 'vitest'
import { normalizeActiveRest, normalizeTrainingMemory } from '@/entities/training-memory/model'

describe('normalizeActiveRest (#473)', () => {
  it('유효한 휴식 메타는 보존한다(returnRampApplied 기본 false)', () => {
    expect(
      normalizeActiveRest({ startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'injury', declaredAt: '2026-06-22T01:00:00.000Z' })
    ).toEqual({ startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'injury', declaredAt: '2026-06-22T01:00:00.000Z', returnRampApplied: false })
  })

  it('returnRampApplied=true 는 보존(#473 Phase 2 복귀 램프 멱등 가드)', () => {
    const out = normalizeActiveRest({ startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'weather', declaredAt: '2026-06-22T00:00:00.000Z', returnRampApplied: true })
    expect(out?.returnRampApplied).toBe(true)
  })

  it('null/비객체/날짜 누락은 null(휴식 아님)', () => {
    expect(normalizeActiveRest(null)).toBeNull()
    expect(normalizeActiveRest('x')).toBeNull()
    expect(normalizeActiveRest({ startDate: '2026-06-22' })).toBeNull()
    expect(normalizeActiveRest({ startDate: 'bad', untilDate: '2026-06-28', reason: 'weather' })).toBeNull()
  })

  it('untilDate < startDate 면 null(역전 방어)', () => {
    expect(normalizeActiveRest({ startDate: '2026-06-28', untilDate: '2026-06-22', reason: 'weather' })).toBeNull()
  })

  it('이상 reason 은 other 로, declaredAt 누락은 startDate 자정으로 보정', () => {
    const out = normalizeActiveRest({ startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'banana' })
    expect(out).toEqual({ startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'other', declaredAt: '2026-06-22T00:00:00.000Z', returnRampApplied: false })
  })

  it('normalizeTrainingMemory 는 activeRest 기본값 null, 유효값은 통과', () => {
    expect(normalizeTrainingMemory({}).activeRest).toBeNull()
    const withRest = normalizeTrainingMemory({
      activeRest: { startDate: '2026-06-22', untilDate: '2026-06-28', reason: 'personal', declaredAt: '2026-06-22T00:00:00.000Z' }
    })
    expect(withRest.activeRest?.reason).toBe('personal')
  })
})

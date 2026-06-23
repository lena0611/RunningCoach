import { describe, expect, it } from 'vitest'
import type { ActiveRest } from '@/entities/training-memory/model'
import { deriveRestState, isLoadOrInjuryRest } from '@/entities/training-memory/restWindow'

const rest = (o: Partial<ActiveRest> = {}): ActiveRest => ({
  startDate: o.startDate ?? '2026-06-22',
  untilDate: o.untilDate ?? '2026-06-28',
  reason: o.reason ?? 'weather',
  declaredAt: o.declaredAt ?? '2026-06-22T00:00:00.000Z'
})

describe('deriveRestState (#473 휴식 상태 파생)', () => {
  it('휴식 없으면 비활성', () => {
    const s = deriveRestState(null, '2026-06-23')
    expect(s.active).toBe(false)
    expect(s.isReturnDay).toBe(false)
    expect(s.returnDate).toBeNull()
  })

  it('휴식 구간 안이면 active + 복귀 D-N(복귀일=untilDate+1) 계산', () => {
    const s = deriveRestState(rest(), '2026-06-23') // until 06-28 → 복귀 06-29
    expect(s.active).toBe(true)
    expect(s.returnDate).toBe('2026-06-29')
    expect(s.daysUntilReturn).toBe(6)
    expect(s.isReturnDay).toBe(false)
    expect(s.isOver).toBe(false)
  })

  it('마지막 휴식일이면 D-1', () => {
    const s = deriveRestState(rest(), '2026-06-28')
    expect(s.active).toBe(true)
    expect(s.daysUntilReturn).toBe(1)
  })

  it('복귀일이면 isReturnDay + 비활성(휴식 종료)', () => {
    const s = deriveRestState(rest(), '2026-06-29')
    expect(s.active).toBe(false)
    expect(s.isReturnDay).toBe(true)
    expect(s.isOver).toBe(true)
    expect(s.daysUntilReturn).toBe(0)
  })

  it('시작 전이면 비활성(예약된 미래 휴식)', () => {
    const s = deriveRestState(rest({ startDate: '2026-06-25', untilDate: '2026-06-28' }), '2026-06-23')
    expect(s.active).toBe(false)
    expect(s.isOver).toBe(false)
  })

  it('부상성 휴식만 "가벼운 회복주" 대안 조건', () => {
    expect(isLoadOrInjuryRest('injury')).toBe(true)
    expect(isLoadOrInjuryRest('weather')).toBe(false)
    expect(isLoadOrInjuryRest('personal')).toBe(false)
    expect(isLoadOrInjuryRest(null)).toBe(false)
  })
})

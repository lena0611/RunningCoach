import { describe, expect, it } from 'vitest'
import type { ActiveRest } from '@/entities/training-memory/model'
import { deriveRestState, shouldOfferRecoveryRun } from '@/entities/training-memory/restWindow'

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
    expect(s.durationDays).toBe(7) // 06-22..06-28 포함 7일
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

  it('"가벼운 회복주" 대안 게이트(SSOT §휴식과 복귀)', () => {
    // 통제 가능한 비의료 휴식 → 제시(공존 중증 부상 없을 때)
    expect(shouldOfferRecoveryRun('weather', null)).toBe(true)
    expect(shouldOfferRecoveryRun('personal', null)).toBe(true)
    expect(shouldOfferRecoveryRun('weather', 2)).toBe(true)
    // 안전 오버라이드: 공존 활성 부상 severity ≥ 3 이면 이유 불문 미제시(부상 KB 게이트 우선)
    expect(shouldOfferRecoveryRun('weather', 4)).toBe(false)
    expect(shouldOfferRecoveryRun('personal', 3)).toBe(false)
    // 부상 휴식: 부하성 경증(1~2)만 제시, 중증(≥3)·불명은 완전 휴식 존중
    expect(shouldOfferRecoveryRun('injury', 2)).toBe(true)
    expect(shouldOfferRecoveryRun('injury', 1)).toBe(true)
    expect(shouldOfferRecoveryRun('injury', 3)).toBe(false)
    expect(shouldOfferRecoveryRun('injury', 5)).toBe(false)
    expect(shouldOfferRecoveryRun('injury', null)).toBe(false)
    // 불명(other)·미지정은 보수적으로 제시 안 함
    expect(shouldOfferRecoveryRun('other', 1)).toBe(false)
    expect(shouldOfferRecoveryRun(null, 1)).toBe(false)
  })
})

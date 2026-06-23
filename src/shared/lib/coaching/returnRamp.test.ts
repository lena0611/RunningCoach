import { describe, expect, it } from 'vitest'
import { RETURN_EMPTY_WINDOW_CAP_KM, returnRampWindowSessions, returnSessionCapKm } from '@/shared/lib/coaching/returnRamp'

describe('returnSessionCapKm (#473 복귀 초반 세션 거리 상한)', () => {
  it('직전30일 최장 런이 있으면 +10% 상한(소수1자리)', () => {
    expect(returnSessionCapKm(10)).toBe(11)
    expect(returnSessionCapKm(15)).toBe(16.5)
    expect(returnSessionCapKm(7)).toBe(7.7)
  })

  it('직전30일 런이 없으면(긴 완전 휴식) 보수적 기본 상한', () => {
    expect(returnSessionCapKm(0)).toBe(RETURN_EMPTY_WINDOW_CAP_KM)
  })
})

describe('returnRampWindowSessions (#473 디트레이닝 4주 경계 차등)', () => {
  it('단기 휴식(<7일)은 0 — 무램프(원래 계획대로)', () => {
    expect(returnRampWindowSessions(0)).toBe(0)
    expect(returnRampWindowSessions(3)).toBe(0)
    expect(returnRampWindowSessions(6)).toBe(0)
  })
  it('중기(7~27일)는 초반 2개 세션 캡', () => {
    expect(returnRampWindowSessions(7)).toBe(2)
    expect(returnRampWindowSessions(14)).toBe(2)
    expect(returnRampWindowSessions(27)).toBe(2)
  })
  it('장기(≥28일=>4주)는 초반 3개 세션 캡(더 보수적)', () => {
    expect(returnRampWindowSessions(28)).toBe(3)
    expect(returnRampWindowSessions(60)).toBe(3)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { loadMomentDismissals, MOMENT_DISMISS_COOLDOWN_DAYS, persistMomentDismissal } from './momentDismissal'

const KEY = 'runcontext.coachMoments.dismissed'
const NOW = new Date('2026-07-03T12:00:00.000Z')

describe('momentDismissal', () => {
  beforeEach(() => localStorage.removeItem(KEY))

  it('저장 없음/손상이면 빈 맵', () => {
    expect(loadMomentDismissals(NOW)).toEqual({})
    localStorage.setItem(KEY, 'not-json')
    expect(loadMomentDismissals(NOW)).toEqual({})
    localStorage.setItem(KEY, '[1,2]')
    expect(loadMomentDismissals(NOW)).toEqual({})
  })

  it('persist 라운드트립 — 닫은 키가 쿨다운 내 재로드에서 유지된다', () => {
    const map = persistMomentDismissal({}, 'extra-run', NOW)
    expect(map['extra-run']).toBe(NOW.toISOString())
    expect(loadMomentDismissals(new Date(NOW.getTime() + 86400000))).toHaveProperty('extra-run')
  })

  it('쿨다운(7일) 지난 항목은 로드에서 걸러진다', () => {
    persistMomentDismissal({}, 'extra-run', NOW)
    const after = new Date(NOW.getTime() + (MOMENT_DISMISS_COOLDOWN_DAYS * 86400000 + 1))
    expect(loadMomentDismissals(after)).toEqual({})
    const justBefore = new Date(NOW.getTime() + (MOMENT_DISMISS_COOLDOWN_DAYS * 86400000 - 1000))
    expect(loadMomentDismissals(justBefore)).toHaveProperty('extra-run')
  })

  it('무효 timestamp 항목은 무시하고 유효 항목만 남긴다', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 'garbage', b: NOW.toISOString(), c: 42 }))
    expect(Object.keys(loadMomentDismissals(NOW))).toEqual(['b'])
  })
})

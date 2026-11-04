import { describe, expect, it } from 'vitest'
import { briefingVerdict, type BriefingGateInput } from './briefingGate'

const base: BriefingGateInput = {
  supabaseConfigured: true,
  authInitialized: true,
  authenticated: true,
  levelLoaded: true,
  needsOnboarding: false,
  todaySettled: true,
  todayState: 'today',
  healthKitSettled: true,
  shownToday: false
}

describe('briefingVerdict', () => {
  it('오늘 예정 훈련이 있고 아직 안 뛰었으면 띄운다', () => {
    expect(briefingVerdict(base)).toBe('show')
  })

  it.each([
    ['이미 뜀', 'done'],
    ['휴식 선언', 'rested'],
    ['훈련 없는 날', 'rest'],
    ['포기한 세션', 'skipped'],
    ['오늘 브리핑 없음', null]
  ])('%s → 안 띄운다', (_, state) => {
    expect(briefingVerdict({ ...base, todayState: state })).toBe('skip')
  })

  it('하루 한 번 — 오늘 이미 봤으면 안 띄운다', () => {
    expect(briefingVerdict({ ...base, shownToday: true })).toBe('skip')
  })

  it('로그인 안 됨·시작 설정 중이면 안 띄운다', () => {
    expect(briefingVerdict({ ...base, authenticated: false })).toBe('skip')
    expect(briefingVerdict({ ...base, needsOnboarding: true })).toBe('skip')
  })

  it('재료가 덜 왔으면 기다린다(인증 초기화·레벨·오늘 판정·HealthKit 첫 동기화)', () => {
    expect(briefingVerdict({ ...base, authInitialized: false })).toBe('wait')
    expect(briefingVerdict({ ...base, levelLoaded: false })).toBe('wait')
    expect(briefingVerdict({ ...base, todaySettled: false })).toBe('wait')
    expect(briefingVerdict({ ...base, healthKitSettled: false })).toBe('wait')
  })

  it('HealthKit 동기화를 기다리는 건 오늘 훈련이 있을 때뿐 — 훈련 없는 날은 바로 인트로를 걷는다', () => {
    expect(briefingVerdict({ ...base, healthKitSettled: false, todayState: 'rest' })).toBe('skip')
  })

  it('Supabase 미설정(로컬 개발)은 로그인·레벨 조건 없이 오늘 상태만 본다', () => {
    expect(briefingVerdict({ ...base, supabaseConfigured: false, authenticated: false, levelLoaded: false })).toBe('show')
  })
})

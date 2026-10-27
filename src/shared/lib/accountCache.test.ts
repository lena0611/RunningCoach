import { beforeEach, describe, expect, it } from 'vitest'
import { claimLocalCacheFor, releaseLocalCache } from './accountCache'

const TOKEN = 'sb-test-auth-token'
const A = 'user-a'
const B = 'user-b'

function seedUserCache() {
  localStorage.setItem('runcontext.users', JSON.stringify([{ id: 'default', memory: { goal: 'A 의 목표' } }]))
  localStorage.setItem('runcontext.runLogs', '[{"id":"run-a"}]')
}

// #878 B3: 한 기기를 두 사람이 쓸 때 앞 사람 캐시가 다음 사람에게 보이거나 저장되면 안 된다.
describe('claimLocalCacheFor (#878 B3)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(TOKEN, '{"user":{"id":"x"}}')
  })

  it('같은 사람이면 아무것도 지우지 않는다', () => {
    localStorage.setItem('pacelab.cacheOwner', A)
    seedUserCache()
    expect(claimLocalCacheFor(A)).toBe(false)
    expect(localStorage.getItem('runcontext.runLogs')).not.toBeNull()
  })

  it('다른 사람이 들어오면 로그인 토큰만 남기고 비운다 — 새로고침 필요(true)', () => {
    localStorage.setItem('pacelab.cacheOwner', A)
    seedUserCache()
    expect(claimLocalCacheFor(B)).toBe(true)
    expect(localStorage.getItem('runcontext.users')).toBeNull()
    expect(localStorage.getItem('runcontext.runLogs')).toBeNull()
    expect(localStorage.getItem(TOKEN)).not.toBeNull()
    expect(localStorage.getItem('pacelab.cacheOwner')).toBe(B)
  })

  it('이 기능 이전 기기(주인 표시 없음)는 누구 것인지 모르니 비운다', () => {
    seedUserCache()
    expect(claimLocalCacheFor(A)).toBe(true)
    expect(localStorage.getItem('runcontext.users')).toBeNull()
    expect(localStorage.getItem('pacelab.cacheOwner')).toBe(A)
  })

  it('로그아웃 상태로 켜면 캐시를 비우고 깨끗함으로 표시한다', () => {
    localStorage.setItem('pacelab.cacheOwner', A)
    seedUserCache()
    claimLocalCacheFor(null)
    expect(localStorage.getItem('runcontext.users')).toBeNull()
    expect(localStorage.getItem('pacelab.cacheOwner')).toBe('')
  })

  it('깨끗한 상태에서 첫 로그인은 표시만 남긴다 — 새로고침 없음(false)', () => {
    localStorage.setItem('pacelab.cacheOwner', '')
    // 로그인 화면에서 스토어가 써 둔 빈 기본값은 지우지 않는다
    localStorage.setItem('runcontext.users', '[{"id":"default"}]')
    expect(claimLocalCacheFor(A)).toBe(false)
    expect(localStorage.getItem('runcontext.users')).not.toBeNull()
    expect(localStorage.getItem('pacelab.cacheOwner')).toBe(A)
  })

  it('로그아웃하면 캐시를 비우고 다음 로그인은 새로고침 없이 이어진다', () => {
    localStorage.setItem('pacelab.cacheOwner', A)
    seedUserCache()
    releaseLocalCache()
    expect(localStorage.getItem('runcontext.runLogs')).toBeNull()
    expect(localStorage.getItem(TOKEN)).not.toBeNull()
    expect(claimLocalCacheFor(B)).toBe(false)
  })
})

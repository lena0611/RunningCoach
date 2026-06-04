import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearNativeSession,
  hasNativeAuthBridge,
  pushSessionToNative,
  requestStoredSessionFromNative
} from './authBridge'

function installBridge(postMessage: (message: unknown) => void = vi.fn()) {
  window.webkit = { messageHandlers: { runContextAuth: { postMessage } } }
  return postMessage
}

afterEach(() => {
  delete window.webkit
  delete window.RunContextAuth
  vi.useRealTimers()
})

describe('native auth bridge presence', () => {
  it('reports false when the native bridge is absent', () => {
    expect(hasNativeAuthBridge()).toBe(false)
  })

  it('reports true when the native bridge is present', () => {
    installBridge()
    expect(hasNativeAuthBridge()).toBe(true)
  })
})

describe('pushSessionToNative', () => {
  it('posts the session tokens to native', () => {
    const post = vi.fn()
    installBridge(post)
    const ok = pushSessionToNative({ access_token: 'acc', refresh_token: 'ref' })
    expect(ok).toBe(true)
    expect(post).toHaveBeenCalledWith({ type: 'saveSession', accessToken: 'acc', refreshToken: 'ref' })
  })

  it('no-ops without a bridge', () => {
    expect(pushSessionToNative({ access_token: 'acc', refresh_token: 'ref' })).toBe(false)
  })

  it('no-ops when tokens are missing', () => {
    const post = vi.fn()
    installBridge(post)
    expect(pushSessionToNative({ access_token: '', refresh_token: 'ref' })).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('clearNativeSession', () => {
  it('posts a clear message to native', () => {
    const post = vi.fn()
    installBridge(post)
    expect(clearNativeSession()).toBe(true)
    expect(post).toHaveBeenCalledWith({ type: 'clearSession' })
  })

  it('no-ops without a bridge', () => {
    expect(clearNativeSession()).toBe(false)
  })
})

describe('requestStoredSessionFromNative', () => {
  it('resolves null without a bridge', async () => {
    await expect(requestStoredSessionFromNative()).resolves.toBeNull()
  })

  it('resolves the stored session when native responds', async () => {
    installBridge((message: unknown) => {
      if ((message as { type: string }).type === 'requestStoredSession') {
        window.RunContextAuth?.receiveStoredSession({ accessToken: 'acc', refreshToken: 'ref' })
      }
    })
    await expect(requestStoredSessionFromNative()).resolves.toEqual({ accessToken: 'acc', refreshToken: 'ref' })
    // 콜백 핸들러는 사용 후 정리된다
    expect(window.RunContextAuth).toBeUndefined()
  })

  it('resolves null when native returns an incomplete session', async () => {
    installBridge(() => {
      window.RunContextAuth?.receiveStoredSession({ accessToken: 'acc', refreshToken: '' })
    })
    await expect(requestStoredSessionFromNative()).resolves.toBeNull()
  })

  it('resolves null after the timeout when native never responds', async () => {
    vi.useFakeTimers()
    installBridge() // postMessage가 아무 응답도 하지 않음
    const pending = requestStoredSessionFromNative(1500)
    await vi.advanceTimersByTimeAsync(1500)
    await expect(pending).resolves.toBeNull()
  })
})

import type { Session } from '@supabase/supabase-js'

export type StoredNativeSession = {
  accessToken: string
  refreshToken: string
}

declare global {
  interface Window {
    RunContextAuth?: {
      receiveStoredSession: (session: StoredNativeSession | null) => void
    }
  }
}

const requestStoredSessionTimeoutMs = 1500

export function hasNativeAuthBridge() {
  return Boolean(window.webkit?.messageHandlers?.runContextAuth)
}

/**
 * 로그인/토큰 갱신 시 Supabase 세션을 네이티브(iOS Keychain)로 전달한다.
 * refresh token은 사용 시 회전되므로 갱신 이벤트마다 다시 저장해 최신 상태를 유지한다.
 */
export function pushSessionToNative(session: Pick<Session, 'access_token' | 'refresh_token'>) {
  const handler = window.webkit?.messageHandlers?.runContextAuth
  if (!handler) return false
  if (!session.access_token || !session.refresh_token) return false

  handler.postMessage({
    type: 'saveSession',
    accessToken: session.access_token,
    refreshToken: session.refresh_token
  })
  return true
}

/**
 * 로그아웃 시 네이티브에 저장된 세션을 삭제한다.
 */
export function clearNativeSession() {
  const handler = window.webkit?.messageHandlers?.runContextAuth
  if (!handler) return false

  handler.postMessage({ type: 'clearSession' })
  return true
}

/**
 * 부팅 시 네이티브(Keychain)에 저장된 세션을 요청한다.
 * 네이티브가 `window.RunContextAuth.receiveStoredSession`을 호출하면 그 값을 반환하고,
 * 브리지가 없거나 시간 내 응답이 없으면 null로 fallback해 기존 OTP 로그인 흐름을 유지한다.
 */
export function requestStoredSessionFromNative(
  timeoutMs = requestStoredSessionTimeoutMs
): Promise<StoredNativeSession | null> {
  const handler = window.webkit?.messageHandlers?.runContextAuth
  if (!handler) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const finish = (session: StoredNativeSession | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      delete window.RunContextAuth
      resolve(normalizeStoredSession(session))
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs)
    window.RunContextAuth = {
      receiveStoredSession(session) {
        finish(session)
      }
    }

    handler.postMessage({ type: 'requestStoredSession' })
  })
}

function normalizeStoredSession(session: StoredNativeSession | null): StoredNativeSession | null {
  if (!session) return null
  const accessToken = typeof session.accessToken === 'string' ? session.accessToken : ''
  const refreshToken = typeof session.refreshToken === 'string' ? session.refreshToken : ''
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

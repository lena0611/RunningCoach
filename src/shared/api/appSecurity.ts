import { getSupabaseAnonKey, getSupabaseFunctionUrl, requireSupabase } from '@/shared/api/supabase'

type AppSessionResponse = {
  token?: string
  expiresAt?: string
}

declare global {
  interface Window {
    PaceLabAppSecurity?: {
      receiveDeviceCheckToken: (token: string) => void
      receiveError: (message: string) => void
    }
  }
}

const sessionStorageKey = 'pacelab.appSession'
const refreshSkewMs = 2 * 60 * 1000

let pendingDeviceToken:
  | {
      resolve: (token: string) => void
      reject: (error: Error) => void
      timeoutId: number
    }
  | null = null

export async function getAppSessionToken() {
  const cached = readCachedAppSession()
  if (cached) return cached

  const client = requireSupabase()
  const { data } = await client.auth.getSession()
  const authToken = data.session?.access_token
  if (!authToken) throw new Error('로그인이 필요합니다.')

  const deviceToken = await requestDeviceCheckToken()
  const response = await fetch(getSupabaseFunctionUrl('app-session'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      apikey: getSupabaseAnonKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ deviceToken })
  })

  const payload = await response.json().catch(() => ({})) as AppSessionResponse & { error?: string }
  if (!response.ok || !payload.token || !payload.expiresAt) {
    throw new Error(payload.error || `앱 실행 검증 실패: ${response.status}`)
  }

  writeCachedAppSession(payload.token, payload.expiresAt)
  return payload.token
}

function requestDeviceCheckToken() {
  const handlers = window.webkit?.messageHandlers as
    | {
        runContextAppSecurity?: {
          postMessage: (message: unknown) => void
        }
      }
    | undefined
  const handler = handlers?.runContextAppSecurity
  if (!handler) throw new Error('iOS 앱 실행 검증 브리지가 연결되어 있지 않습니다.')

  installAppSecurityReceiver()
  if (pendingDeviceToken) {
    window.clearTimeout(pendingDeviceToken.timeoutId)
    pendingDeviceToken.reject(new Error('새 앱 실행 검증 요청으로 교체되었습니다.'))
    pendingDeviceToken = null
  }

  return new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingDeviceToken = null
      reject(new Error('iOS 앱 실행 검증 시간이 초과되었습니다.'))
    }, 8000)
    pendingDeviceToken = { resolve, reject, timeoutId }
    handler.postMessage({ type: 'requestDeviceCheckToken' })
  })
}

function installAppSecurityReceiver() {
  window.PaceLabAppSecurity = {
    receiveDeviceCheckToken(token) {
      if (!pendingDeviceToken) return
      window.clearTimeout(pendingDeviceToken.timeoutId)
      pendingDeviceToken.resolve(token)
      pendingDeviceToken = null
    },
    receiveError(message) {
      if (!pendingDeviceToken) return
      window.clearTimeout(pendingDeviceToken.timeoutId)
      pendingDeviceToken.reject(new Error(message || 'iOS 앱 실행 검증 실패'))
      pendingDeviceToken = null
    }
  }
}

function readCachedAppSession() {
  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { token?: string, expiresAt?: string }
    if (!parsed.token || !parsed.expiresAt) return ''
    if (Date.parse(parsed.expiresAt) - Date.now() <= refreshSkewMs) return ''
    return parsed.token
  } catch {
    return ''
  }
}

function writeCachedAppSession(token: string, expiresAt: string) {
  try {
    window.sessionStorage.setItem(sessionStorageKey, JSON.stringify({ token, expiresAt }))
  } catch {
    // 앱 실행 검증 토큰은 짧은 수명이다. 캐시 실패 시 다음 요청에서 다시 발급받는다.
  }
}

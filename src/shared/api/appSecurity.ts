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
const deviceCheckUnavailableMessage = 'iOS 앱 실행 검증 브리지가 연결되어 있지 않습니다.'

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

  const deviceToken = await requestDeviceCheckToken().catch((error) => {
    if (error instanceof Error && error.message === deviceCheckUnavailableMessage) return ''
    throw error
  })
  const response = await fetch(getSupabaseFunctionUrl('app-session'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      apikey: getSupabaseAnonKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(deviceToken ? { deviceToken } : {})
  })

  const payload = await response.json().catch(() => ({})) as AppSessionResponse & { error?: string }
  if (!response.ok || !payload.token || !payload.expiresAt) {
    throw new Error(appSessionErrorMessage(response.status, payload.error))
  }

  writeCachedAppSession(payload.token, payload.expiresAt)
  return payload.token
}

/**
 * 서버 영어 원문을 사용자 문장으로(#866). 허용 목록 밖 계정은 코치·날씨처럼 서버를 거치는 기능을 아직 못 쓴다 —
 * 신규 계정이 코치에게 첫 질문을 하자 "User is not approved for app access" 가 그대로 떴다(2026-10-26).
 */
function appSessionErrorMessage(status: number, error?: string): string {
  if (status === 403 && error?.includes('not approved')) {
    return '아직 코치·날씨 기능이 열리지 않은 계정이에요. 지금은 초대받은 계정만 쓸 수 있어요.'
  }
  return error || `앱 실행 검증 실패: ${status}`
}

function requestDeviceCheckToken(): Promise<string> {
  const handlers = window.webkit?.messageHandlers as
    | {
        runContextAppSecurity?: {
          postMessage: (message: unknown) => void
        }
      }
    | undefined
  const handler = handlers?.runContextAppSecurity
  // 브리지가 없으면 동기 throw 대신 rejected Promise로 돌려보내, 호출부의 .catch() 폴백(allowlist 모드에서 deviceToken 없이 진행)이 실제로 동작하게 한다.
  if (!handler) return Promise.reject(new Error(deviceCheckUnavailableMessage))

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

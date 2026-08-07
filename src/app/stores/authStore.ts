import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/shared/api/supabase'
import {
  clearNativeSession,
  hasNativeAuthBridge,
  pushSessionToNative,
  requestStoredSessionFromNative
} from '@/features/restore-native-session/authBridge'

export const useAuthStore = defineStore('authStore', {
  state: () => ({
    initialized: false,
    loading: false,
    error: '',
    session: null as Session | null,
    user: null as User | null
  }),
  getters: {
    isConfigured: () => isSupabaseConfigured,
    isAuthenticated: (state) => Boolean(state.user)
  },
  actions: {
    async init() {
      if (!supabase) {
        this.initialized = true
        return
      }

      const { data } = await supabase.auth.getSession()
      let session = data.session

      // WebView localStorage가 비어 있어도(예: iOS 재설치) 네이티브 Keychain에
      // 저장된 세션이 있으면 OTP 재입력 없이 복원한다.
      if (!session && hasNativeAuthBridge()) {
        session = await this.restoreFromNative()
      }

      this.session = session
      this.user = session?.user ?? null

      supabase.auth.onAuthStateChange((_event, nextSession) => {
        this.session = nextSession
        this.user = nextSession?.user ?? null
        if (nextSession) {
          // SIGNED_IN / TOKEN_REFRESHED: 회전된 refresh token까지 네이티브에 최신화
          pushSessionToNative(nextSession)
        } else {
          clearNativeSession()
        }
      })
      this.initialized = true
    },
    async restoreFromNative(): Promise<Session | null> {
      if (!supabase) return null
      const stored = await requestStoredSessionFromNative()
      if (!stored) return null

      const { data, error } = await supabase.auth.setSession({
        access_token: stored.accessToken,
        refresh_token: stored.refreshToken
      })
      if (error) {
        // 만료/회전 등으로 복원 실패하면 조용히 기존 OTP 로그인 흐름으로 fallback
        clearNativeSession()
        return null
      }
      return data.session
    },
    /**
     * 이메일 + 비밀번호 로그인(2026-08-07 도입).
     *
     * 기존엔 OTP 하나뿐이라 **로그인할 때마다 메일함을 열어 코드를 옮겨 적어야** 했다. 세션이 유지되는
     * 동안엔 안 겪지만, 새 기기·앱 재설치·저장소 정리 뒤엔 매번 그 마찰을 만난다. 비밀번호를 1순위로
     * 두고 OTP 는 폴백(비밀번호를 안 만든 계정·복구용)으로 남긴다.
     */
    async signInWithPassword(email: string, password: string) {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return false
      }
      this.loading = true
      this.error = ''
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      this.loading = false
      if (error) {
        this.error = authErrorMessage(error.message)
        return false
      }
      this.session = data.session
      this.user = data.user
      return true
    },
    /**
     * 회원가입. 프로젝트 설정이 이메일 확인을 요구하면 세션이 바로 안 나오므로, 그 경우를 호출부가
     * 구분할 수 있게 `needsEmailConfirm` 로 알려준다(가입은 됐는데 로그인이 안 된 것처럼 보이는 혼란 방지).
     */
    async signUpWithPassword(email: string, password: string): Promise<{ ok: boolean; needsEmailConfirm?: boolean }> {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return { ok: false }
      }
      this.loading = true
      this.error = ''
      const { data, error } = await supabase.auth.signUp({ email, password })
      this.loading = false
      if (error) {
        this.error = authErrorMessage(error.message)
        return { ok: false }
      }
      if (data.session) {
        this.session = data.session
        this.user = data.user
        return { ok: true }
      }
      return { ok: true, needsEmailConfirm: true }
    },
    /** 비밀번호 재설정 메일. OTP 를 없애지 않는 또 하나의 이유 — 비밀번호를 잊었을 때의 유일한 복구 경로다. */
    async sendPasswordReset(email: string) {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return false
      }
      this.loading = true
      this.error = ''
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}#/auth`
      })
      this.loading = false
      if (error) {
        this.error = authErrorMessage(error.message)
        return false
      }
      return true
    },
    /** 로그인 후 비밀번호 설정/변경. OTP 로 가입한 기존 계정이 비밀번호를 갖게 하는 경로. */
    async updatePassword(password: string) {
      if (!supabase) return false
      this.loading = true
      this.error = ''
      const { error } = await supabase.auth.updateUser({ password })
      this.loading = false
      if (error) {
        this.error = authErrorMessage(error.message)
        return false
      }
      return true
    },
    /**
     * 소셜 로그인(구글·카카오). 공급자 키가 없으면 버튼을 아예 노출하지 않는다(`enabledAuthProviders`).
     *
     * ⚠️ iOS 앱(WKWebView)에서는 구글이 임베디드 웹뷰 로그인을 차단한다(`disallowed_useragent`).
     * 앱 안에서 쓰려면 네이티브 ASWebAuthenticationSession 브리지가 필요하므로, 지금은 **웹 전용**이다.
     */
    async signInWithProvider(provider: 'google' | 'kakao') {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return
      }
      this.loading = true
      this.error = ''
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` }
      })
      if (error) {
        this.loading = false
        this.error = authErrorMessage(error.message)
      }
      // 성공 시 브라우저가 공급자로 이동하므로 여기서 loading 을 내리지 않는다.
    },
    async signInWithEmail(email: string) {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return
      }

      this.loading = true
      this.error = ''
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      this.loading = false
      if (error) this.error = error.message
    },
    async verifyEmailOtp(email: string, token: string) {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return false
      }

      this.loading = true
      this.error = ''
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email'
      })
      this.loading = false
      if (error) {
        this.error = error.message
        return false
      }
      this.session = data.session
      this.user = data.user
      return true
    },
    async signOut() {
      if (!supabase) return
      await supabase.auth.signOut()
      this.session = null
      this.user = null
      clearNativeSession()
    }
  }
})

/**
 * Supabase 인증 에러를 사용자 말로 옮긴다. 원문은 영어이고 "Invalid login credentials" 처럼
 * 무엇을 고쳐야 할지 알려주지 않는다.
 */
function authErrorMessage(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (text.includes('email not confirmed')) return '메일함에서 이메일 확인을 먼저 마쳐주세요.'
  if (text.includes('user already registered')) return '이미 가입된 이메일입니다. 로그인해 주세요.'
  if (text.includes('password should be at least')) return '비밀번호는 6자 이상으로 만들어주세요.'
  if (text.includes('for security purposes') || text.includes('rate limit')) return '요청이 잠시 몰렸어요. 잠시 후 다시 시도해 주세요.'
  if (text.includes('provider is not enabled')) return '이 로그인 방식은 아직 준비 중입니다.'
  return message
}

/**
 * 쓸 수 있는 소셜 로그인 목록. 공급자 키(Supabase 대시보드 + 공급자 콘솔)가 준비된 것만 켠다 —
 * 준비 안 된 버튼을 보여주면 눌렀을 때 오류가 나서 "고장난 앱"으로 보인다.
 * 예: `VITE_AUTH_PROVIDERS=google,kakao`
 */
export const enabledAuthProviders: Array<'google' | 'kakao'> = String(import.meta.env.VITE_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter((item): item is 'google' | 'kakao' => item === 'google' || item === 'kakao')

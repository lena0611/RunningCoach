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

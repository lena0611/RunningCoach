import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/shared/api/supabase'

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
      this.session = data.session
      this.user = data.session?.user ?? null
      supabase.auth.onAuthStateChange((_event, session) => {
        this.session = session
        this.user = session?.user ?? null
      })
      this.initialized = true
    },
    async signInWithEmail(email: string) {
      if (!supabase) {
        this.error = 'Supabase 환경변수가 설정되지 않았습니다.'
        return
      }

      this.loading = true
      this.error = ''
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      })
      this.loading = false
      if (error) this.error = error.message
    },
    async signOut() {
      if (!supabase) return
      await supabase.auth.signOut()
      this.session = null
      this.user = null
    }
  }
})

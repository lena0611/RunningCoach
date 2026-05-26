import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.')
  }
  return supabase
}

export function getSupabaseFunctionUrl(functionName: string) {
  if (!supabaseUrl) {
    throw new Error('Supabase URL이 설정되지 않았습니다.')
  }
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`
}

export function getSupabaseAnonKey() {
  if (!supabaseAnonKey) {
    throw new Error('Supabase anon key가 설정되지 않았습니다.')
  }
  return supabaseAnonKey
}

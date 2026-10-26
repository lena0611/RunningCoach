import { requireSupabase } from '@/shared/api/supabase'

/**
 * 테스트 계정 데이터 초기화 (migration 202610260001).
 * 계정·로그인은 남기고 데이터만 지워, 다음 접속을 신규 사용자의 첫 화면으로 만든다.
 * 허용 여부는 서버(test_reset_accounts)가 판정한다 — 화면 판정은 버튼 노출용일 뿐이다.
 */
export async function canResetTestAccount(): Promise<boolean> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('can_reset_test_account')
  if (error) throw error
  return data === true
}

let healthKitSkipCache: { userId: string; skip: boolean } | null = null

/**
 * 이 계정이 기기 HealthKit 기록을 가져오지 않는 테스트 계정인가. 사용자별로 한 번만 묻는다.
 * 판정에 실패하면 false — 실사용자의 동기화를 막지 않는 쪽으로 실패한다.
 */
export async function skipsHealthKitImport(userId: string): Promise<boolean> {
  if (healthKitSkipCache?.userId === userId) return healthKitSkipCache.skip
  try {
    const { data, error } = await requireSupabase().rpc('test_account_skips_healthkit')
    if (error) return false
    healthKitSkipCache = { userId, skip: data === true }
    return healthKitSkipCache.skip
  } catch {
    return false
  }
}

export async function resetTestAccount(): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('reset_test_account')
  if (error) throw error
}

/**
 * 이 기기에 남은 앱 상태를 지운다(로그인 토큰만 남김). 서버 데이터를 지워도 로컬 캐시·"이미 봤음"
 * 표시가 남으면 첫 화면이 신규 사용자와 달라진다(알림 안내·부상 체크인 등).
 */
export function clearLocalAppState(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('auth-token')) localStorage.removeItem(key)
    }
    sessionStorage.clear()
  } catch {
    /* 저장소 접근이 막힌 환경 — 서버 초기화만으로도 진행한다 */
  }
}

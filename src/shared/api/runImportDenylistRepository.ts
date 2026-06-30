import { requireSupabase } from '@/shared/api/supabase'

/**
 * run_import_denylist 영속 계층 (#235 후속 G3). run_logs 와 동일한 user-RLS 패턴.
 * 삭제된 HealthKit 워크아웃의 externalId 를 모아 재유입을 막는다(자동 sync·단건 유입 게이트).
 * user_id 는 테이블 default auth.uid() 가 채우고, 조회는 RLS 로 본인 행만 반환된다.
 */

type RunImportDenylistRow = {
  external_id: string
}

export async function fetchDeniedExternalIds(): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('run_import_denylist')
    .select('external_id')
  if (error) throw error
  return (data ?? []).map((row: RunImportDenylistRow) => row.external_id)
}

export async function insertDeniedExternalId(externalId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('run_import_denylist')
    .insert({ external_id: externalId })
  // 23505 = unique violation(이미 deny 됨) — 멱등하게 무시한다.
  if (error && (error as { code?: string }).code !== '23505') throw error
}

export async function deleteDeniedExternalId(externalId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('run_import_denylist')
    .delete()
    .eq('external_id', externalId)
  if (error) throw error
}

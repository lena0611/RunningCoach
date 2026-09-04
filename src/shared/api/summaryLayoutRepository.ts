import { requireSupabase } from '@/shared/api/supabase'

/**
 * 요약 탭 구성 override(#767 후속). 기본 목록은 코드가 갖고(summaryBlocks.ts) 여기엔 바꾼 것만 남는다.
 *
 * ⚠️ training_memory 에 얹지 않는다 — 통째 저장이라 마지막 쓰기가 이긴다(2026-07-22 실사고).
 */
export type SummaryLayout = {
  hidden: string[]
  cardOrder: string[]
}

type SummaryLayoutRow = {
  hidden: string[] | null
  card_order: string[] | null
}

/** 저장된 구성. 한 번도 편집하지 않았으면 null — 화면은 코드 기본값을 쓴다. */
export async function fetchSummaryLayout(): Promise<SummaryLayout | null> {
  const { data, error } = await requireSupabase()
    .from('user_summary_layout')
    .select('hidden, card_order')
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as SummaryLayoutRow
  return { hidden: row.hidden ?? [], cardOrder: row.card_order ?? [] }
}

export async function saveSummaryLayout(layout: SummaryLayout): Promise<void> {
  const supabase = requireSupabase()
  // upsert 충돌 대상이 PK(user_id)라 값을 payload 에 넣어야 한다 — 기본값에 맡기면 갱신이 아니라 삽입 충돌이 난다.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { error } = await supabase.from('user_summary_layout').upsert({
    user_id: userData.user.id,
    hidden: layout.hidden,
    card_order: layout.cardOrder,
    updated_at: new Date().toISOString()
  })
  if (error) throw error
}

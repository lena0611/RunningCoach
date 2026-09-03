import { requireSupabase } from '@/shared/api/supabase'
import type { DataCardSpec } from '@/shared/lib/coaching/dataCardAdapter'

/**
 * 요약 탭 사용자 정의 데이터 카드(#767).
 *
 * ⚠️ training_memory 에 얹지 않는 이유: 그 테이블은 JSON 을 통째 저장해 마지막 쓰기가 이긴다 —
 * stale 탭이 폰의 상태를 지운 실사고가 있었다(2026-07-22). 카드는 **행 단위 독립**으로 둔다.
 */
export type UserDataCard = {
  id: string
  title: string
  /** 사용자가 실제로 한 말. 되짚기·스펙 확장 근거용. */
  requestText: string
  spec: DataCardSpec
  position: number
}

export type UserDataCardDraft = Omit<UserDataCard, 'id'>

type UserDataCardRow = {
  id: string
  title: string
  request_text: string | null
  spec: DataCardSpec
  position: number
}

function fromRow(row: UserDataCardRow): UserDataCard {
  return {
    id: row.id,
    title: row.title,
    requestText: row.request_text ?? '',
    spec: row.spec,
    position: row.position
  }
}

/**
 * 카드 목록. range 를 건다 — Supabase 는 range 없이 1000행에서 **조용히 잘린다**
 * ([[silent-truncation-and-scope-in-data-reads]]). 카드가 그만큼 쌓일 일은 없지만 규칙은 규칙이다.
 */
export async function fetchUserDataCards(limit = 50): Promise<UserDataCard[]> {
  const { data, error } = await requireSupabase()
    .from('user_data_cards')
    .select('id, title, request_text, spec, position')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .range(0, Math.max(limit - 1, 0))
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function insertUserDataCard(draft: UserDataCardDraft): Promise<UserDataCard> {
  const { data, error } = await requireSupabase()
    .from('user_data_cards')
    .insert({
      title: draft.title,
      request_text: draft.requestText || null,
      spec: draft.spec,
      position: draft.position
    })
    .select('id, title, request_text, spec, position')
    .single()
  if (error) throw error
  return fromRow(data as UserDataCardRow)
}

export async function deleteUserDataCard(id: string): Promise<void> {
  const { error } = await requireSupabase().from('user_data_cards').delete().eq('id', id)
  if (error) throw error
}

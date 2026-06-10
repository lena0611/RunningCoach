import { requireSupabase } from '@/shared/api/supabase'

/**
 * 레벨 상태 저장 계약 (#263 / migration 202606080002).
 * 파생 불가 상태만 저장: 온보딩 자기보고 잠정 배치 + 마지막 축하 확인.
 * 거리 클래스·등급·자격은 프로필 + run_logs 파생이라 여기 저장하지 않는다.
 */
export type LevelStateRow = {
  user_id: string
  self_reported_max_distance_m: number | null
  self_reported_vdot: number | null
  placement_source: string
  placed_at: string | null
  acknowledged_class: string | null
  acknowledged_grade: string | null
  updated_at: string
}

export type LevelPlacementInput = {
  self_reported_max_distance_m: number | null
  self_reported_vdot: number | null
  placement_source?: string
  placed_at?: string | null
}

export async function fetchLevelState(): Promise<LevelStateRow | null> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('pacelab_level_state')
    .select('*')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (error) throw error
  return (data as LevelStateRow | null) ?? null
}

export async function saveLevelState(input: LevelPlacementInput): Promise<LevelStateRow> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const payload = {
    user_id: userData.user.id,
    self_reported_max_distance_m: input.self_reported_max_distance_m,
    self_reported_vdot: input.self_reported_vdot,
    placement_source: input.placement_source ?? 'self_report',
    placed_at: input.placed_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  const { data, error } = await supabase
    .from('pacelab_level_state')
    .upsert(payload)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data as LevelStateRow
}

/** 축하 확인 상태만 갱신(배치 필드 보존). 행이 없으면 null 반환(온보딩 전). */
export async function updateAcknowledged(
  acknowledgedClass: string | null,
  acknowledgedGrade: string | null
): Promise<LevelStateRow | null> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('pacelab_level_state')
    .update({ acknowledged_class: acknowledgedClass, acknowledged_grade: acknowledgedGrade, updated_at: new Date().toISOString() })
    .eq('user_id', userData.user.id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return (data as LevelStateRow | null) ?? null
}

/** 보상 ledger 적립(append-only). XP·코인은 참여 보상이며 등급에 영향 없음. */
export async function insertReward(kind: 'xp' | 'coin', amount: number, reason: string): Promise<void> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { error } = await supabase
    .from('pacelab_reward_ledger')
    .insert({ user_id: userData.user.id, kind, amount, reason })
  if (error) throw error
}

/** 코인 잔액(ledger 합계). */
export async function fetchCoinTotal(): Promise<number> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('pacelab_reward_ledger')
    .select('amount')
    .eq('user_id', userData.user.id)
    .eq('kind', 'coin')
  if (error) throw error
  const rows = (data as { amount: number | null }[] | null) ?? []
  return rows.reduce((sum, row) => sum + (row.amount ?? 0), 0)
}

/** 퀘스트 완료 로그 존재 여부(idempotency 키: quest_type + quest_key). */
export async function hasQuestLog(questType: string, questKey: string): Promise<boolean> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase
    .from('pacelab_quest_log')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('quest_type', questType)
    .eq('quest_key', questKey)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/** 퀘스트 완료 기록. */
export async function insertQuestLog(questType: string, questKey: string, xpAwarded: number): Promise<void> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { error } = await supabase.from('pacelab_quest_log').insert({
    user_id: userData.user.id,
    quest_type: questType,
    quest_key: questKey,
    status: 'completed',
    xp_awarded: xpAwarded,
    completed_at: new Date().toISOString()
  })
  if (error) throw error
}

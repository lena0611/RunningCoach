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

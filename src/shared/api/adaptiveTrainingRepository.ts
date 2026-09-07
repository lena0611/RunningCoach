// #328 적응값 영속화 read/write helper. 앱 인증 세션 + RLS(user_id = auth.uid())로 동작한다.
import {
  mapAdaptiveMetricRow,
  mapPhaseHistoryRow,
  toAdaptiveMetricUpsert,
  type AdaptiveMetric,
  type AdaptiveMetricRow,
  type PhaseHistoryRecord,
  type PhaseHistoryRow
} from '@/entities/training-memory/adaptivePersistence'
import type { TrainingPhaseName } from '@/entities/training-memory/model'
import { requireSupabase } from '@/shared/api/supabase'

async function requireUserId(): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw error ?? new Error('로그인이 필요합니다.')
  return data.user.id
}

export async function fetchAdaptiveMetrics(): Promise<AdaptiveMetric[]> {
  const supabase = requireSupabase()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('adaptive_training_metrics')
    .select('metric_type, base_value, adopted_value, unit, evidence_run_ids, status, adopted_at')
    .eq('user_id', userId)
  if (error) throw error
  return ((data ?? []) as AdaptiveMetricRow[])
    .map((row) => mapAdaptiveMetricRow(row))
    .filter((metric): metric is AdaptiveMetric => Boolean(metric))
}

export async function upsertAdaptiveMetric(metric: AdaptiveMetric): Promise<void> {
  const supabase = requireSupabase()
  const userId = await requireUserId()
  const { error } = await supabase
    .from('adaptive_training_metrics')
    .upsert(toAdaptiveMetricUpsert(metric, userId), { onConflict: 'user_id,metric_type' })
  if (error) throw error
}

export async function fetchPhaseHistory(limit = 24): Promise<PhaseHistoryRecord[]> {
  const supabase = requireSupabase()
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('training_phase_history')
    .select('phase_name, started_at, ended_at, transition_reason, progression_criteria_status')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as PhaseHistoryRow[]).map((row) => mapPhaseHistoryRow(row))
}

/** phase 전환 시: 직전 활성 phase 행을 종료시키고 새 phase 행을 추가한다. */
export async function appendPhaseTransition(
  phaseName: TrainingPhaseName,
  transitionReason: string,
  progressionCriteriaStatus: Record<string, string>
): Promise<void> {
  const supabase = requireSupabase()
  const userId = await requireUserId()
  const now = new Date().toISOString()

  const { error: closeError } = await supabase
    .from('training_phase_history')
    .update({ ended_at: now })
    .eq('user_id', userId)
    .is('ended_at', null)
  if (closeError) throw closeError

  const { error } = await supabase.from('training_phase_history').insert({
    user_id: userId,
    phase_name: phaseName,
    started_at: now,
    transition_reason: transitionReason,
    progression_criteria_status: progressionCriteriaStatus
  })
  if (error) throw error
}

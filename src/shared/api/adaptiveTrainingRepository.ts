// #328 적응값 영속화 read/write helper. 앱 인증 세션 + RLS(user_id = auth.uid())로 동작한다.
import {
  mapAdaptiveMetricRow,
  toAdaptiveMetricUpsert,
  type AdaptiveMetric,
  type AdaptiveMetricRow
} from '@/entities/training-memory/adaptivePersistence'
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

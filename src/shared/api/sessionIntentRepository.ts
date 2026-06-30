import {
  normalizeSessionIntentTargets,
  type SessionIntent,
  type SessionIntentDraft,
  type SessionIntentStatus
} from '@/entities/session-intent/model'
import { requireSupabase } from '@/shared/api/supabase'

/**
 * pacelab_session_intents 영속 계층 (#308). run_logs 와 동일한 user-RLS 패턴.
 * user_id 는 테이블 default auth.uid() 가 채우고, 조회는 RLS 로 본인 행만 반환된다.
 */

type SessionIntentRow = {
  id: string
  user_id: string
  goal_id: string | null
  planned_date: string
  session_type: SessionIntent['sessionType']
  title: string
  why: string
  targets: unknown
  success_criteria: string[] | null
  source: SessionIntent['source']
  status: SessionIntentStatus
  run_id: string | null
  matched_at: string | null
  created_at: string
  updated_at: string
}

export async function fetchSessionIntents(): Promise<SessionIntent[]> {
  const { data, error } = await requireSupabase()
    .from('pacelab_session_intents')
    .select('*')
    .order('planned_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function insertSessionIntent(draft: SessionIntentDraft): Promise<SessionIntent> {
  const { data, error } = await requireSupabase()
    .from('pacelab_session_intents')
    .insert(toInsertRow(draft))
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/** 런 저장 직후 매칭: 의도를 실행 RunLog 와 연결하고 completed 로 전환. */
export async function matchSessionIntentToRun(id: string, runId: string): Promise<SessionIntent> {
  const now = new Date().toISOString()
  const { data, error } = await requireSupabase()
    .from('pacelab_session_intents')
    .update({ run_id: runId, status: 'completed', matched_at: now, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/**
 * 런 삭제/치유 시 역매칭: 연결을 끊고 planned 로 되돌린다(matchSessionIntentToRun 의 거울, #235 후속 G2).
 * run_id·matched_at 을 비워 다음 로드에서 정상 미연결 의도로 취급되게 한다.
 */
export async function unmatchSessionIntentFromRun(id: string): Promise<SessionIntent> {
  const now = new Date().toISOString()
  const { data, error } = await requireSupabase()
    .from('pacelab_session_intents')
    .update({ run_id: null, status: 'planned', matched_at: null, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/** 건너뛰기/대체 등 상태만 전환. */
export async function updateSessionIntentStatus(
  id: string,
  status: SessionIntentStatus
): Promise<SessionIntent> {
  const { data, error } = await requireSupabase()
    .from('pacelab_session_intents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

function toInsertRow(draft: SessionIntentDraft) {
  return {
    goal_id: draft.goalId,
    planned_date: draft.plannedDate,
    session_type: draft.sessionType,
    title: draft.title,
    why: draft.why,
    targets: draft.targets,
    success_criteria: draft.successCriteria,
    source: draft.source
  }
}

function fromRow(row: SessionIntentRow): SessionIntent {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    plannedDate: row.planned_date,
    sessionType: row.session_type,
    title: row.title,
    why: row.why,
    targets: normalizeSessionIntentTargets(row.targets),
    successCriteria: row.success_criteria ?? [],
    source: row.source,
    status: row.status,
    runId: row.run_id,
    matchedAt: row.matched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

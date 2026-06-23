import {
  normalizeScheduledSessionPrescription,
  type ScheduledSession,
  type ScheduledSessionDraft,
  type ScheduledSessionStatus
} from '@/entities/training-schedule/model'
import { requireSupabase } from '@/shared/api/supabase'

/**
 * training_schedule 영속 계층 (#363). run_logs 와 동일한 user-RLS 패턴.
 * user_id 는 테이블 default auth.uid() 가 채우고, 조회는 RLS 로 본인 행만 반환된다.
 */

type ScheduledSessionRow = {
  id: string
  user_id: string
  goal_id: string | null
  session_date: string
  phase: ScheduledSession['phase']
  session_type: ScheduledSession['sessionType']
  slot: ScheduledSession['slot']
  key_session: boolean
  prescription: unknown
  status: ScheduledSessionStatus
  source: ScheduledSession['source']
  run_id: string | null
  created_at: string
  updated_at: string
}

/** 활성 목표 스케줄 조회. goalId 가 주어지면 그 목표만, 없으면 전체(날짜 오름차순). */
export async function fetchTrainingSchedule(goalId?: string | null): Promise<ScheduledSession[]> {
  let query = requireSupabase()
    .from('training_schedule')
    .select('*')
    .order('session_date', { ascending: true })
  if (goalId) query = query.eq('goal_id', goalId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** F2 생성기·A1 재정렬의 벌크 insert. 빈 배열이면 no-op. */
export async function insertTrainingSessions(drafts: ScheduledSessionDraft[]): Promise<ScheduledSession[]> {
  if (!drafts.length) return []
  const { data, error } = await requireSupabase()
    .from('training_schedule')
    .insert(drafts.map(toInsertRow))
    .select('*')
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** 상태 전환(런 매칭 done / 결손 missed / 대체 superseded). */
export async function updateScheduledSessionStatus(
  id: string,
  status: ScheduledSessionStatus,
  runId: string | null = null
): Promise<ScheduledSession> {
  // done 이면 매칭 runId 부착, 그 외(missed/superseded/planned 복귀)는 stale runId 제거.
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    run_id: status === 'done' ? runId : null
  }
  const { data, error } = await requireSupabase()
    .from('training_schedule')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/**
 * 세션 슬롯(AM/PM) 갱신 — 같은 날 더블(#455) 추가 시 기존 단일 세션을 'AM' 으로 표시한다.
 * status·runId·prescription 등 다른 필드는 보존(slot 만 패치). 런 매칭 시각 우선(결정 B)을 살리려면
 * 기존 세션도 슬롯이 있어야 한다(둘 다 null 이면 시각 매칭이 중립이라 타입에 위임됨).
 */
export async function updateScheduledSessionSlot(id: string, slot: ScheduledSession['slot']): Promise<ScheduledSession> {
  const { data, error } = await requireSupabase()
    .from('training_schedule')
    .update({ slot, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/**
 * A1 재정렬용: 특정 날짜(포함) 이후의 활성(planned/missed) 세션을 superseded 로 전환.
 * 재구축 insert 전에 호출해 미래 구간을 비운다. 영향받은 행 수를 반환.
 */
export async function supersedeSessionsFrom(goalId: string | null, fromDate: string): Promise<number> {
  let query = requireSupabase()
    .from('training_schedule')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .gte('session_date', fromDate)
    .in('status', ['planned', 'missed'])
  query = goalId ? query.eq('goal_id', goalId) : query.is('goal_id', null)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data ?? []).length
}

/**
 * 과거(beforeDate 미만)의 미수행 planned 세션을 missed 로 전환한다. 재정렬 후 호출해
 * 과거 누락이 매 포커스마다 deviation 을 다시 트리거하는 무한 재정렬을 막는다(B2). 영향 행 수 반환.
 */
export async function markPastPlannedMissed(goalId: string | null, beforeDate: string): Promise<number> {
  let query = requireSupabase()
    .from('training_schedule')
    .update({ status: 'missed', updated_at: new Date().toISOString() })
    .lt('session_date', beforeDate)
    .eq('status', 'planned')
    .is('run_id', null)
  query = goalId ? query.eq('goal_id', goalId) : query.is('goal_id', null)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data ?? []).length
}

/**
 * 휴식 선언(#473): [startDate, endDate] (양끝 포함) 구간의 **미수행** 세션(planned/missed, run 미연결)을
 * 'rested' 로 일괄 전환한다. done/superseded/skipped 는 건드리지 않는다(실제 결과·사용자 의사 보존).
 * missed 도 포함해 전환 — 과거에 missed 로 확정된 날이 선언 구간에 들어오면 닦달 흔적을 회복으로 정리한다.
 * goalId scoping 은 supersedeSessionsFrom 과 동일. 영향받은 행 수를 반환.
 */
export async function markSessionsRested(
  goalId: string | null,
  startDate: string,
  endDate: string
): Promise<number> {
  let query = requireSupabase()
    .from('training_schedule')
    .update({ status: 'rested', run_id: null, updated_at: new Date().toISOString() })
    .gte('session_date', startDate)
    .lte('session_date', endDate)
    .in('status', ['planned', 'missed'])
    .is('run_id', null)
  query = goalId ? query.eq('goal_id', goalId) : query.is('goal_id', null)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data ?? []).length
}

/**
 * 휴식 복귀/단축(#473): fromDate(포함) 이후의 'rested' 세션을 'planned' 로 되돌린다("지금 복귀"·복귀일 앞당김).
 * 과거(이미 쉰 날)는 건드리지 않는다. goalId scoping 은 형제 함수와 동일. 영향 행 수를 반환.
 */
export async function unmarkRestedFrom(goalId: string | null, fromDate: string): Promise<number> {
  let query = requireSupabase()
    .from('training_schedule')
    .update({ status: 'planned', run_id: null, updated_at: new Date().toISOString() })
    .gte('session_date', fromDate)
    .eq('status', 'rested')
  query = goalId ? query.eq('goal_id', goalId) : query.is('goal_id', null)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data ?? []).length
}

function toInsertRow(draft: ScheduledSessionDraft) {
  return {
    goal_id: draft.goalId,
    session_date: draft.date,
    phase: draft.phase,
    session_type: draft.sessionType,
    slot: draft.slot ?? null,
    key_session: draft.keySession,
    prescription: draft.prescription,
    source: draft.source
  }
}

function fromRow(row: ScheduledSessionRow): ScheduledSession {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    date: row.session_date,
    phase: row.phase,
    sessionType: row.session_type,
    slot: row.slot ?? null,
    keySession: row.key_session,
    prescription: normalizeScheduledSessionPrescription(row.prescription),
    status: row.status,
    source: row.source,
    runId: row.run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

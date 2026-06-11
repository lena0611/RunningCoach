import type { CompetitionResult } from '@/entities/competition/model'
import { requireSupabase } from '@/shared/api/supabase'

/**
 * competition_results 영속 계층 (#233). run_logs 와 동일한 user-RLS 패턴.
 * ⚠️ 이 데이터는 볼륨·부하·추세 집계에 미포함 — 업적·동기부여·코칭 인용 전용(§10).
 */

type CompetitionResultRow = {
  id: string
  user_id: string
  mode: CompetitionResult['mode']
  target_distance_m: number
  target_elapsed_sec: number
  target_source_run_id: string | null
  raced_distance_m: number
  raced_duration_sec: number | null
  result_gap_sec: number
  outcome: CompetitionResult['outcome']
  linked_run_id: string | null
  raced_at: string
  created_at: string
  updated_at: string
}

/** store 가 매칭 시점에 넘기는 생성 입력(서버가 id/user_id/타임스탬프 부여). */
export type CompetitionResultInput = Omit<CompetitionResult, 'id' | 'userId' | 'createdAt' | 'updatedAt'>

export async function fetchCompetitionResults(): Promise<CompetitionResult[]> {
  const { data, error } = await requireSupabase()
    .from('competition_results')
    .select('*')
    .order('raced_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function insertCompetitionResult(input: CompetitionResultInput): Promise<CompetitionResult> {
  const { data, error } = await requireSupabase()
    .from('competition_results')
    .insert(toInsertRow(input))
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

function toInsertRow(input: CompetitionResultInput) {
  return {
    mode: input.mode,
    target_distance_m: input.targetPb.distanceM,
    target_elapsed_sec: input.targetPb.elapsedSec,
    target_source_run_id: input.targetPb.sourceRunId || null,
    raced_distance_m: input.racedDistanceM,
    raced_duration_sec: input.racedDurationSec,
    result_gap_sec: input.resultGapSec,
    outcome: input.outcome,
    linked_run_id: input.linkedRunId,
    raced_at: input.racedAt
  }
}

function fromRow(row: CompetitionResultRow): CompetitionResult {
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    targetPb: {
      distanceM: row.target_distance_m,
      elapsedSec: row.target_elapsed_sec,
      sourceRunId: row.target_source_run_id ?? ''
    },
    racedDistanceM: row.raced_distance_m,
    racedDurationSec: row.raced_duration_sec,
    resultGapSec: row.result_gap_sec,
    outcome: row.outcome,
    linkedRunId: row.linked_run_id,
    racedAt: row.raced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

import { requireSupabase } from '@/shared/api/supabase'

/**
 * 러닝 대체 운동 기록(#739).
 *
 * ⚠️ **run_logs 와 철저히 분리한다.** 주간 볼륨·VDOT·처방 앵커(`returnAnchor`)는 러닝만 봐야 한다 —
 * 자전거가 섞이면 앵커가 부풀어 처방이 과대해진다(2026-08-18 앵커 오염 사고의 거울상).
 *
 * ⚠️ **거리·페이스를 담지 않는다.** 검증된 "자전거 X분 = 러닝 Y km" 환산 공식은 존재하지 않는다
 * (#739 리서치: sRPE·TRIMP 모두 종목 간 non-interchangeable). 사실만 남긴다.
 */
export type CrossTrainingModality = 'cycling' | 'swimming' | 'elliptical' | 'aqua_jog' | 'rowing' | 'other'

export type CrossTrainingSession = {
  id: string
  externalId: string | null
  modality: CrossTrainingModality
  indoor: boolean | null
  date: string
  startAt: string | null
  endAt: string | null
  durationSec: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  activeEnergyKcal: number | null
  rpe: number | null
  source: string
  sourceName: string | null
  note: string
}

export type CrossTrainingSessionDraft = Omit<CrossTrainingSession, 'id'>

type CrossTrainingRow = {
  id: string
  external_id: string | null
  modality: CrossTrainingModality
  indoor: boolean | null
  date: string
  start_at: string | null
  end_at: string | null
  duration_sec: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  active_energy_kcal: number | null
  rpe: number | null
  source: string
  source_name: string | null
  note: string | null
}

function fromRow(row: CrossTrainingRow): CrossTrainingSession {
  return {
    id: row.id,
    externalId: row.external_id,
    modality: row.modality,
    indoor: row.indoor,
    date: row.date,
    startAt: row.start_at,
    endAt: row.end_at,
    durationSec: row.duration_sec,
    avgHeartRate: row.avg_heart_rate,
    maxHeartRate: row.max_heart_rate,
    activeEnergyKcal: row.active_energy_kcal,
    rpe: row.rpe,
    source: row.source,
    sourceName: row.source_name,
    note: row.note ?? ''
  }
}

/**
 * 최근 기록을 가져온다. range 를 반드시 건다 — Supabase 는 range 없이 1000행에서 **조용히 잘린다**
 * ([[silent-truncation-and-scope-in-data-reads]]).
 */
export async function fetchCrossTrainingSessions(limit = 200): Promise<CrossTrainingSession[]> {
  const { data, error } = await requireSupabase()
    .from('cross_training_sessions')
    .select('*')
    .order('date', { ascending: false })
    .range(0, Math.max(limit - 1, 0))
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/**
 * 새 기록을 넣는다. 같은 HealthKit 워크아웃이 두 번 들어오지 않게 external_id 유니크 인덱스가
 * 막으므로, 재유입은 조용히 무시한다(upsert 로 덮어쓰지 않는다 — 사용자가 단 메모·RPE 를 지운다).
 */
export async function insertCrossTrainingSessions(drafts: CrossTrainingSessionDraft[]): Promise<CrossTrainingSession[]> {
  if (!drafts.length) return []
  const { data, error } = await requireSupabase()
    .from('cross_training_sessions')
    .upsert(
      drafts.map((draft) => ({
        external_id: draft.externalId,
        modality: draft.modality,
        indoor: draft.indoor,
        date: draft.date,
        start_at: draft.startAt,
        end_at: draft.endAt,
        duration_sec: draft.durationSec,
        avg_heart_rate: draft.avgHeartRate,
        max_heart_rate: draft.maxHeartRate,
        active_energy_kcal: draft.activeEnergyKcal,
        rpe: draft.rpe,
        source: draft.source,
        source_name: draft.sourceName,
        note: draft.note
      })),
      { onConflict: 'user_id,external_id', ignoreDuplicates: true }
    )
    .select('*')
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function deleteCrossTrainingSession(id: string): Promise<void> {
  const { error } = await requireSupabase().from('cross_training_sessions').delete().eq('id', id)
  if (error) throw error
}

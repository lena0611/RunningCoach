import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { requireSupabase } from '@/shared/api/supabase'

type RunLogRow = {
  id: string
  user_id: string
  date: string
  type: RunLog['type']
  distance_km: number
  duration_sec: number | null
  avg_pace_sec: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  cadence: number | null
  temperature: number | null
  rpe: number | null
  memo: string
  laps: RunLog['laps']
  tags: string[]
  source: RunLog['source']
  created_at: string
  updated_at: string
}

export async function fetchRunLogs(): Promise<RunLog[]> {
  const { data, error } = await requireSupabase().from('run_logs').select('*').order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export async function insertRunLog(data: ExtractedRunData, source: RunLog['source']): Promise<RunLog> {
  const row = toInsertRow(data, source)
  const { data: inserted, error } = await requireSupabase().from('run_logs').insert(row).select('*').single()
  if (error) throw error
  return fromRow(inserted)
}

export async function updateRunLog(run: RunLog): Promise<RunLog> {
  const { id: _id, userId: _userId, createdAt: _createdAt, ...rest } = run
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .update({
      date: rest.date,
      type: rest.type,
      distance_km: rest.distanceKm,
      duration_sec: rest.durationSec,
      avg_pace_sec: rest.avgPaceSec,
      avg_heart_rate: rest.avgHeartRate,
      max_heart_rate: rest.maxHeartRate,
      cadence: rest.cadence,
      temperature: rest.temperature,
      rpe: rest.rpe,
      memo: rest.memo,
      laps: rest.laps,
      tags: rest.tags,
      source: rest.source,
      updated_at: new Date().toISOString()
    })
    .eq('id', run.id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteRunLog(id: string) {
  const { error } = await requireSupabase().from('run_logs').delete().eq('id', id)
  if (error) throw error
}

function toInsertRow(data: ExtractedRunData, source: RunLog['source']) {
  return {
    date: data.date,
    type: data.type,
    distance_km: data.distanceKm,
    duration_sec: data.durationSec,
    avg_pace_sec: data.avgPaceSec,
    avg_heart_rate: data.avgHeartRate,
    max_heart_rate: data.maxHeartRate,
    cadence: data.cadence,
    temperature: data.temperature,
    rpe: data.rpe ?? null,
    memo: data.memo,
    laps: data.laps,
    tags: data.tags ?? [],
    source
  }
}

function fromRow(row: RunLogRow): RunLog {
  return {
    id: row.id,
    userId: row.user_id,
    date: row.date,
    type: row.type,
    distanceKm: row.distance_km,
    durationSec: row.duration_sec,
    avgPaceSec: row.avg_pace_sec,
    avgHeartRate: row.avg_heart_rate,
    maxHeartRate: row.max_heart_rate,
    cadence: row.cadence,
    temperature: row.temperature,
    rpe: row.rpe,
    memo: row.memo,
    laps: row.laps ?? [],
    tags: row.tags ?? [],
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

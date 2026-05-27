import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { requireSupabase } from '@/shared/api/supabase'

type RunLogRow = {
  id: string
  user_id: string
  external_id: string | null
  session_title: string | null
  date: string
  type: RunLog['type']
  distance_km: number
  duration_sec: number | null
  avg_pace_sec: number | null
  avg_heart_rate: number | null
  max_heart_rate: number | null
  cadence: number | null
  active_energy_kcal: number | null
  temperature: number | null
  humidity: number | null
  wind_mps: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
  course_type: RunLog['courseType'] | null
  rpe: number | null
  workout_feeling: string | null
  pain_note: string | null
  sleep_quality: number | null
  condition_score: number | null
  stress_level: number | null
  companion: string | null
  memo: string
  laps: RunLog['laps']
  fast_segments: RunLog['fastSegments']
  metric_samples: RunLog['metricSamples'] | null
  route_points: RunLog['routePoints'] | null
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

export async function insertRunLogs(items: ExtractedRunData[], source: RunLog['source']): Promise<RunLog[]> {
  if (!items.length) return []
  const inserted: RunLog[] = []

  for (const item of items) {
    try {
      const run = await insertRunLog(item, source)
      inserted.push(run)
    } catch (err) {
      if (isDuplicateRunError(err)) continue
      throw err
    }
  }

  return inserted
}

export async function updateRunLog(run: RunLog): Promise<RunLog> {
  const { id: _id, userId: _userId, createdAt: _createdAt, ...rest } = run
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .update({
      date: rest.date,
      type: rest.type,
      external_id: rest.externalId,
      session_title: rest.sessionTitle,
      distance_km: rest.distanceKm,
      duration_sec: rest.durationSec,
      avg_pace_sec: rest.avgPaceSec,
      avg_heart_rate: rest.avgHeartRate,
      max_heart_rate: rest.maxHeartRate,
      cadence: rest.cadence,
      active_energy_kcal: rest.activeEnergyKcal,
      temperature: rest.temperature,
      humidity: rest.humidity,
      wind_mps: rest.windMps,
      elevation_gain_m: rest.elevationGainM,
      elevation_loss_m: rest.elevationLossM,
      course_type: rest.courseType,
      rpe: rest.rpe,
      workout_feeling: rest.workoutFeeling,
      pain_note: rest.painNote,
      sleep_quality: rest.sleepQuality,
      condition_score: rest.conditionScore,
      stress_level: rest.stressLevel,
      companion: rest.companion,
      memo: rest.memo,
      laps: rest.laps,
      fast_segments: rest.fastSegments,
      metric_samples: rest.metricSamples ?? [],
      route_points: rest.routePoints ?? [],
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
    external_id: data.externalId || null,
    date: data.date,
    type: data.type,
    session_title: data.sessionTitle,
    distance_km: data.distanceKm,
    duration_sec: data.durationSec,
    avg_pace_sec: data.avgPaceSec,
    avg_heart_rate: data.avgHeartRate,
    max_heart_rate: data.maxHeartRate,
    cadence: data.cadence,
    active_energy_kcal: data.activeEnergyKcal,
    temperature: data.temperature,
    humidity: data.humidity,
    wind_mps: data.windMps,
    elevation_gain_m: data.elevationGainM,
    elevation_loss_m: data.elevationLossM,
    course_type: data.courseType,
    rpe: data.rpe ?? null,
    workout_feeling: data.workoutFeeling,
    pain_note: data.painNote,
    sleep_quality: data.sleepQuality,
    condition_score: data.conditionScore,
    stress_level: data.stressLevel,
    companion: data.companion,
    memo: data.memo,
    laps: data.laps,
    fast_segments: data.fastSegments ?? [],
    metric_samples: data.metricSamples ?? [],
    route_points: data.routePoints ?? [],
    tags: data.tags ?? [],
    source
  }
}

function isDuplicateRunError(err: unknown) {
  if (!err || typeof err !== 'object') return false
  const maybeError = err as { code?: string; message?: string }
  return maybeError.code === '23505' || /duplicate key/i.test(maybeError.message ?? '')
}

function fromRow(row: RunLogRow): RunLog {
  return {
    id: row.id,
    userId: row.user_id,
    externalId: row.external_id,
    sessionTitle: row.session_title ?? '',
    date: row.date,
    type: row.type,
    distanceKm: row.distance_km,
    durationSec: row.duration_sec,
    avgPaceSec: row.avg_pace_sec,
    avgHeartRate: row.avg_heart_rate,
    maxHeartRate: row.max_heart_rate,
    cadence: row.cadence,
    activeEnergyKcal: row.active_energy_kcal,
    temperature: row.temperature,
    humidity: row.humidity,
    windMps: row.wind_mps,
    elevationGainM: row.elevation_gain_m,
    elevationLossM: row.elevation_loss_m,
    courseType: row.course_type ?? 'Unknown',
    rpe: row.rpe,
    workoutFeeling: row.workout_feeling ?? '',
    painNote: row.pain_note ?? '',
    sleepQuality: row.sleep_quality,
    conditionScore: row.condition_score,
    stressLevel: row.stress_level,
    companion: row.companion ?? '',
    memo: row.memo,
    laps: row.laps ?? [],
    fastSegments: row.fast_segments ?? [],
    metricSamples: row.metric_samples ?? [],
    routePoints: row.route_points ?? [],
    tags: row.tags ?? [],
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

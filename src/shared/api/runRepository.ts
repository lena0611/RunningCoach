import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { requireSupabase } from '@/shared/api/supabase'

type RunLogRow = {
  id: string
  user_id: string
  external_id: string | null
  session_title: string | null
  date: string
  start_at: string | null
  end_at: string | null
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
  lap_count?: number | null
  metric_sample_count?: number | null
  route_point_count?: number | null
  tags: string[]
  source: RunLog['source']
  created_at: string
  updated_at: string
}

/**
 * 목록 조회 컬럼(#661). **무거운 배열 4개(laps·fast_segments·metric_samples·route_points)를 뺀다.**
 *
 * 예전엔 `select('*')` 라 앱 열 때마다 모든 런의 경로 좌표까지 받아왔다 — 실측 203런 = **4.7MB**.
 * 정작 경로·구간 샘플은 세션 상세 한 화면에서만 쓴다. 목록에 필요한 건 "있는지"뿐이라
 * 서버 생성 컬럼(*_count)으로 대체한다. 이 목록에서 온 런은 heavyDataLoaded=false 다.
 */
const RUN_LIST_COLUMNS = [
  'id', 'user_id', 'external_id', 'session_title', 'date', 'start_at', 'end_at', 'type',
  'distance_km', 'duration_sec', 'avg_pace_sec', 'avg_heart_rate', 'max_heart_rate', 'cadence',
  'active_energy_kcal', 'temperature', 'humidity', 'wind_mps', 'elevation_gain_m', 'elevation_loss_m',
  'course_type', 'rpe', 'workout_feeling', 'pain_note', 'sleep_quality', 'condition_score',
  'stress_level', 'companion', 'memo', 'tags', 'source', 'created_at', 'updated_at',
  'lap_count', 'metric_sample_count', 'route_point_count'
].join(', ')

/** 세션 상세에서만 필요한 무거운 컬럼. */
const RUN_HEAVY_COLUMNS = 'id, laps, fast_segments, metric_samples, route_points'

export async function fetchRunLogs(): Promise<RunLog[]> {
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .select(RUN_LIST_COLUMNS)
    .order('date', { ascending: false })
    .order('start_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  // 컬럼 목록을 문자열로 넘기면 PostgREST 제네릭이 행 타입을 추론하지 못한다 — 명시 캐스트.
  return ((data ?? []) as unknown as RunLogRow[]).map(fromRow)
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

/**
 * 업데이트 행을 만든다. 무거운 컬럼 = `laps`·`fast_segments`·`metric_samples`·`route_points`
 * (실측 런당 23KB 중 23KB — route_points 18KB · metric_samples 4KB · laps 1KB). **기본은 무거운 컬럼을 아예 쓰지 않는다**(패치형).
 *
 * ⚠️ 왜 이게 안전장치인가: 예전 구현은 메모리의 런 전체를 덮어썼고 `route_points: rest.routePoints ?? []`
 * 였다. 목록 쿼리가 경로를 안 불러오는 순간(지연 로드) **모든 업데이트가 GPS 경로를 `[]` 로 지운다** —
 * 그리고 업데이트 호출부 7곳 중 하나는 **앱 로드 시 자동 실행되는 롱런 오분류 자가치유**라서,
 * 사용자가 아무것도 하지 않아도 경로가 조용히 사라진다. 그래서 지연 로드보다 이 전환이 먼저다.
 *
 * 지금은 목록이 경로를 다 불러오므로 기본 동작에 **의미 변화가 없다**(같은 값을 되쓰던 것을 안 쓰는 것뿐).
 * 무거운 데이터를 실제로 바꾸는 호출부만 `includeHeavyData` 로 명시한다(HealthKit 경로 백필·리프레시 병합).
 */
export function buildRunUpdateRow(run: RunLog, options?: { includeHeavyData?: boolean }): Record<string, unknown> {
  const { id: _id, userId: _userId, createdAt: _createdAt, ...rest } = run
  const row: Record<string, unknown> = {
      date: rest.date,
      start_at: rest.startAt,
      end_at: rest.endAt,
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
      tags: rest.tags,
      source: rest.source,
      updated_at: new Date().toISOString()
  }
  if (options?.includeHeavyData) {
    row.laps = rest.laps
    row.fast_segments = rest.fastSegments
    row.metric_samples = rest.metricSamples ?? []
    row.route_points = rest.routePoints ?? []
  }
  return row
}

export async function updateRunLog(run: RunLog, options?: { includeHeavyData?: boolean }): Promise<RunLog> {
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .update(buildRunUpdateRow(run, options))
    .eq('id', run.id)
    .select('*')
    .single()
  if (error) throw error
  return fromRow(data)
}

/**
 * 세션 상세용 무거운 데이터 지연 로드(#661). 목록에서 뺀 4개 배열만 가져온다.
 * 없는 런(삭제 레이스)이면 null 을 돌려주고 화면은 목록 값(빈 배열)으로 그린다.
 */
export async function fetchRunHeavyData(id: string): Promise<Pick<RunLog, 'laps' | 'fastSegments' | 'metricSamples' | 'routePoints'> | null> {
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .select(RUN_HEAVY_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as ScheduledHeavyRow
  return {
    laps: row.laps ?? [],
    fastSegments: row.fast_segments ?? [],
    metricSamples: row.metric_samples ?? [],
    routePoints: row.route_points ?? []
  }
}

type ScheduledHeavyRow = {
  laps: RunLog['laps'] | null
  fast_segments: RunLog['fastSegments'] | null
  metric_samples: RunLog['metricSamples'] | null
  route_points: RunLog['routePoints'] | null
}

/**
 * 날씨의 "마지막 러닝 위치"용 — 경로가 있는 **가장 최근 런 1건**의 시작점만 가져온다(#661).
 * 예전엔 목록에 실려 온 전체 경로에서 골랐는데, 목록이 경로를 안 받으므로 이 전용 조회로 바꾼다.
 * 부분 인덱스(route_point_count > 0)를 타므로 싸다.
 */
export async function fetchLastRunRouteStart(): Promise<{ latitude: number; longitude: number } | null> {
  const { data, error } = await requireSupabase()
    .from('run_logs')
    .select('route_points')
    .gt('route_point_count', 0)
    .order('date', { ascending: false })
    .order('start_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const start = (data as { route_points?: RunLog['routePoints'] } | null)?.route_points?.[0]
  if (!start || !Number.isFinite(start.latitude) || !Number.isFinite(start.longitude)) return null
  return { latitude: start.latitude, longitude: start.longitude }
}

export async function deleteRunLog(id: string) {
  const { error } = await requireSupabase().from('run_logs').delete().eq('id', id)
  if (error) throw error
}

function toInsertRow(data: ExtractedRunData, source: RunLog['source']) {
  return {
    external_id: data.externalId || null,
    date: data.date,
    start_at: data.startAt,
    end_at: data.endAt,
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
    startAt: row.start_at,
    endAt: row.end_at,
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
    // 목록 조회는 무거운 배열을 아예 select 하지 않는다 → undefined. `[]` 로 채우되
    // heavyDataLoaded=false 로 "없음"과 "아직 안 불러옴"을 구분한다(#661).
    heavyDataLoaded: row.route_points !== undefined,
    lapCount: row.lap_count ?? (row.laps?.length ?? 0),
    metricSampleCount: row.metric_sample_count ?? (row.metric_samples?.length ?? 0),
    routePointCount: row.route_point_count ?? (row.route_points?.length ?? 0),
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

// #328 적응값 영속화 스키마의 도메인 타입과 순수 매퍼.
// DB row(snake_case) ↔ 도메인 객체(camelCase) 변환만 담당한다. supabase 의존 없음(테스트 가능).

export type AdaptiveMetricType = 'tempo_ceiling' | 'easy_ceiling' | 'long_run_drift' | 'recovery_cycle'
export type AdaptiveMetricStatus = 'estimated' | 'watch' | 'adopted'
export type AdaptiveMetricUnit = 'bpm' | 'percent' | 'days'

export const adaptiveMetricTypes: AdaptiveMetricType[] = [
  'tempo_ceiling',
  'easy_ceiling',
  'long_run_drift',
  'recovery_cycle'
]

export type AdaptiveMetric = {
  metricType: AdaptiveMetricType
  baseValue: number | null
  adoptedValue: number | null
  unit: AdaptiveMetricUnit
  evidenceRunIds: string[]
  status: AdaptiveMetricStatus
  adoptedAt: string | null
}

export type AdaptiveMetricRow = {
  metric_type?: unknown
  base_value?: unknown
  adopted_value?: unknown
  unit?: unknown
  evidence_run_ids?: unknown
  status?: unknown
  adopted_at?: unknown
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function normalizeAdaptiveMetricType(value: unknown): AdaptiveMetricType | null {
  return adaptiveMetricTypes.includes(value as AdaptiveMetricType) ? (value as AdaptiveMetricType) : null
}

export function normalizeAdaptiveMetricStatus(value: unknown): AdaptiveMetricStatus {
  return value === 'watch' || value === 'adopted' ? value : 'estimated'
}

export function normalizeAdaptiveMetricUnit(value: unknown): AdaptiveMetricUnit {
  return value === 'percent' || value === 'days' ? value : 'bpm'
}

/** DB row → AdaptiveMetric. metric_type가 알 수 없는 값이면 null(스킵 대상). */
export function mapAdaptiveMetricRow(row: AdaptiveMetricRow): AdaptiveMetric | null {
  const metricType = normalizeAdaptiveMetricType(row.metric_type)
  if (!metricType) return null
  return {
    metricType,
    baseValue: toNumberOrNull(row.base_value),
    adoptedValue: toNumberOrNull(row.adopted_value),
    unit: normalizeAdaptiveMetricUnit(row.unit),
    evidenceRunIds: toStringArray(row.evidence_run_ids),
    status: normalizeAdaptiveMetricStatus(row.status),
    adoptedAt: toStringOrNull(row.adopted_at)
  }
}

/** AdaptiveMetric → upsert payload(user_id는 호출부에서 주입). */
export function toAdaptiveMetricUpsert(metric: AdaptiveMetric, userId: string) {
  return {
    user_id: userId,
    metric_type: metric.metricType,
    base_value: metric.baseValue,
    adopted_value: metric.adoptedValue,
    unit: metric.unit,
    evidence_run_ids: metric.evidenceRunIds,
    status: metric.status,
    adopted_at: metric.adoptedAt,
    updated_at: new Date().toISOString()
  }
}

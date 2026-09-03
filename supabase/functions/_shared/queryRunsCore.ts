/**
 * `queryRuns` 계산 코어 — 필터·그룹·지표 조합을 결정론으로 집계한다(#652, 공용화 #767).
 *
 * 화면은 "이런 걸 주로 볼 것이다"라는 개발자 예측만 담는다. 사용자의 2차 요구(더운 날 페이스,
 * 잠 못 잔 날 심박, 트레드밀 vs 야외 케이던스…)는 조합이 수십 가지라 화면으로 만들 수 없다.
 * 그래서 **도구를 여러 개 만들지 않고** 필터·그룹·지표를 조합하는 하나를 둔다.
 *
 * **LLM 에는 SQL 을 주지 않는다.** 필드·연산자·그룹·지표를 전부 화이트리스트로 받고, 검증과 계산은
 * 이 모듈이 한다(#639 의 닫힌 어휘 + 결정론 게이트와 같은 철학). 화이트리스트 밖은 조용히 무시하지 않고
 * **거부 이유를 돌려준다** — 코치가 "그 기준으로는 볼 수 없다"고 정직하게 말할 수 있어야 한다.
 *
 * ⚠ 이 파일은 **웹과 Edge 가 함께 쓴다**(#767). 코치 답변과 요약 탭 사용자 카드가 같은 숫자를 말해야 하므로
 *   미러(두 벌)를 두지 않는다. 그래서 여기엔 **순수 계산만** 둔다 — Deno·브라우저 어느 쪽 API 도 쓰지 않고,
 *   실패는 종류(kind)와 상세만 돌려주고 **응대 문구는 호출자**(Edge 는 코치 지침, 웹은 카드 문구)가 만든다.
 *   위치가 supabase/functions/_shared 인 이유: Edge 배포는 함수 트리 밖 상대 경로를 못 올릴 수 있어서다.
 */

/** 실패 종류 — 정본은 coach-run/dataGap.ts 의 DataGapKind. 코어는 그중 코드가 판정하는 4종만 낸다. */
export type QueryRunsFailureKind = 'unsupported_field' | 'missing_values' | 'no_matching_runs' | 'low_sample' | 'truncated_groups' | 'invalid_args'

/** 집계 입력 행(run_logs 의 화이트리스트 컬럼만). */
export type QueryRunsRow = {
  date: string
  start_at: string | null
  type: string | null
  distance_km: number | null
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
  course_type: string | null
  rpe: number | null
  sleep_quality: number | null
  condition_score: number | null
  stress_level: number | null
  companion: string | null
}

type FieldKind = 'date' | 'number' | 'text'

/**
 * 필드 스펙 — 저장된 컬럼이거나, 컬럼에서 **파생**되는 값이다.
 * 파생을 둔 이유(#767): 사용자가 처음 원한 카드가 "매주 **토요일만** LSD 누적" 이었는데 요일이
 * 그룹 축에만 있고 필터에는 없어 표현할 수 없었다. 요일은 date 에서 결정론으로 나오므로 컬럼 없이 넓힌다.
 */
type FieldSpec = { column: keyof QueryRunsRow; kind: FieldKind } | { derived: 'weekday'; kind: FieldKind }

/** 필터·지표에 쓸 수 있는 필드(카멜 이름 → 행 컬럼·종류). 여기 없는 필드는 존재하지 않는 것으로 답한다. */
export const QUERY_RUNS_FIELDS: Record<string, FieldSpec> = {
  date: { column: 'date', kind: 'date' },
  /** 요일('월'~'일'). groupBy 의 weekday 와 같은 라벨을 쓴다 — 한 어휘로 거르고 묶는다. */
  weekday: { derived: 'weekday', kind: 'text' },
  type: { column: 'type', kind: 'text' },
  courseType: { column: 'course_type', kind: 'text' },
  companion: { column: 'companion', kind: 'text' },
  distanceKm: { column: 'distance_km', kind: 'number' },
  durationSec: { column: 'duration_sec', kind: 'number' },
  avgPaceSec: { column: 'avg_pace_sec', kind: 'number' },
  avgHeartRate: { column: 'avg_heart_rate', kind: 'number' },
  maxHeartRate: { column: 'max_heart_rate', kind: 'number' },
  cadence: { column: 'cadence', kind: 'number' },
  activeEnergyKcal: { column: 'active_energy_kcal', kind: 'number' },
  temperature: { column: 'temperature', kind: 'number' },
  humidity: { column: 'humidity', kind: 'number' },
  windMps: { column: 'wind_mps', kind: 'number' },
  elevationGainM: { column: 'elevation_gain_m', kind: 'number' },
  elevationLossM: { column: 'elevation_loss_m', kind: 'number' },
  rpe: { column: 'rpe', kind: 'number' },
  sleepQuality: { column: 'sleep_quality', kind: 'number' },
  conditionScore: { column: 'condition_score', kind: 'number' },
  stressLevel: { column: 'stress_level', kind: 'number' }
}

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] as const
type Op = (typeof OPS)[number]

export const QUERY_RUNS_GROUPS = ['none', 'month', 'week', 'weekday', 'type', 'courseType', 'companion'] as const
type GroupBy = (typeof QUERY_RUNS_GROUPS)[number]

/**
 * 지표: sum/avg/max 는 결측(null)을 **제외**하고 계산하고, 그 표본 수를 함께 돌려준다.
 * lastDate/firstDate 는 날짜 문자열 최대/최소 — "마지막 러닝이 언제였나 → 며칠 쉬었나" 질문용
 * (2026-08-05 실사용 실패 로그에서 추가: 조회 수단이 없어 코치가 답을 미뤘다).
 */
export const QUERY_RUNS_METRICS = [
  'count',
  'lastDate',
  'firstDate',
  'distanceKm',
  'durationSec',
  'avgPaceSec',
  'avgHeartRate',
  'maxHeartRate',
  'cadence',
  'activeEnergyKcal',
  'elevationGainM',
  'rpe',
  'sleepQuality',
  'conditionScore',
  'stressLevel',
  'temperature'
] as const
/** 지표 이름. 카드 스펙(#767)이 같은 어휘를 쓰도록 내보낸다 — 문자열로 받으면 오타가 런타임까지 간다. */
export type QueryRunsMetric = (typeof QUERY_RUNS_METRICS)[number]
type Metric = QueryRunsMetric

const SUM_METRICS: Metric[] = ['distanceKm', 'durationSec', 'activeEnergyKcal', 'elevationGainM']
const MAX_METRICS: Metric[] = ['maxHeartRate']

export type QueryRunsFilter = { field: string; op: Op; value: string | number }
export type QueryRunsSpec = {
  filters: QueryRunsFilter[]
  groupBy: GroupBy
  metrics: Metric[]
  limit: number
}

export type QueryRunsCoreResult = {
  /** 실제로 적용된 조건(사람이 읽는 문장). 답변에 그대로 노출해 사용자가 검증할 수 있게 한다. */
  appliedFilters: string[]
  groupBy: GroupBy
  /** 필터를 통과한 전체 러닝 수 — 표본 수 표기용. */
  matchedRuns: number
  rows: Array<Record<string, string | number | null>>
  /** 실패 종류(#652 PR2) — 코드가 판정한다. 프롬프트가 상황을 알아서 읽길 기대하지 않는다. */
  failureKind: QueryRunsFailureKind | null
  /** 실패 문구를 만들 때 쓸 상세(표본 수·그룹 수 등). 문구 자체는 호출자가 만든다(#767). */
  failureDetail: string | undefined
}

const MAX_ROWS = 24
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 화이트리스트 검증. 통과하면 spec, 아니면 사람이 읽을 거부 이유 + **실패 종류**(#652 PR2).
 * 종류를 함께 돌려주는 이유: 응대 지침을 코드가 고정하고, 실패를 기록해 확장 근거로 삼기 위해서다.
 */
export function normalizeQueryRunsArgs(
  raw: unknown
): { spec: QueryRunsSpec } | { error: string; kind: QueryRunsFailureKind } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '조회 조건을 이해하지 못했습니다.', kind: 'invalid_args' }
  }
  const value = raw as Record<string, unknown>

  const groupBy = QUERY_RUNS_GROUPS.find((group) => group === value.groupBy) ?? 'none'

  const rawMetrics = Array.isArray(value.metrics) ? value.metrics : []
  const metrics = QUERY_RUNS_METRICS.filter((metric) => rawMetrics.includes(metric))
  // 지표를 못 골랐으면 최소한 횟수·거리는 돌려준다(빈손 응답 방지).
  const finalMetrics: Metric[] = metrics.length ? metrics : ['count', 'distanceKm']

  const rawFilters = Array.isArray(value.filters) ? value.filters : []
  const filters: QueryRunsFilter[] = []
  for (const entry of rawFilters) {
    if (!entry || typeof entry !== 'object') continue
    const filter = entry as Record<string, unknown>
    const field = typeof filter.field === 'string' ? filter.field : ''
    const spec = QUERY_RUNS_FIELDS[field]
    if (!spec) {
      return {
        error: `'${field || '알 수 없는 항목'}'은(는) 기록에 저장하지 않는 항목입니다.`,
        kind: 'unsupported_field'
      }
    }
    const op = OPS.find((candidate) => candidate === filter.op)
    if (!op) return { error: `'${field}'에 쓸 수 없는 비교 방식입니다.`, kind: 'invalid_args' }
    if (spec.kind === 'number') {
      const numeric = typeof filter.value === 'number' ? filter.value : Number(filter.value)
      if (!Number.isFinite(numeric)) return { error: `'${field}' 조건 값이 숫자가 아닙니다.`, kind: 'invalid_args' }
      filters.push({ field, op, value: numeric })
      continue
    }
    const text = typeof filter.value === 'string' ? filter.value.trim() : String(filter.value ?? '')
    if (!text) return { error: `'${field}' 조건 값이 비어 있습니다.`, kind: 'invalid_args' }
    if (spec.kind === 'date' && !DATE_PATTERN.test(text) && op !== 'contains') {
      return {
        error: `날짜 조건은 YYYY-MM-DD 형식이어야 합니다(받은 값: ${text}).`,
        kind: 'invalid_args'
      }
    }
    filters.push({ field, op, value: text })
  }

  const limitRaw = typeof value.limit === 'number' ? Math.floor(value.limit) : MAX_ROWS
  return {
    spec: { filters, groupBy, metrics: finalMetrics, limit: Math.min(Math.max(limitRaw, 1), MAX_ROWS) }
  }
}

export function runQueryRunsCore(spec: QueryRunsSpec, rows: QueryRunsRow[]): QueryRunsCoreResult {
  const matched = rows.filter((row) => spec.filters.every((filter) => matchesFilter(row, filter)))
  const groups = new Map<string, QueryRunsRow[]>()
  for (const row of matched) {
    const key = groupKey(row, spec.groupBy)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  const ordered = [...groups.entries()].sort((a, b) => (spec.groupBy === 'none' ? 0 : b[0].localeCompare(a[0])))
  const resultRows = ordered.slice(0, spec.limit).map(([key, list]) => {
    const row: Record<string, string | number | null> = spec.groupBy === 'none' ? {} : { group: key }
    for (const metric of spec.metrics) {
      if (metric === 'count') {
        row.count = list.length
        continue
      }
      if (metric === 'lastDate' || metric === 'firstDate') {
        const dates = list.map((item) => item.date).filter(Boolean).sort()
        row[metric] = dates.length ? (metric === 'lastDate' ? dates[dates.length - 1] : dates[0]) : null
        continue
      }
      const field = QUERY_RUNS_FIELDS[metric]
      // 파생 필드(요일)는 거르기 전용이다 — 숫자 집계 대상이 아니다.
      if (!field || !('column' in field)) continue
      const values = list
        .map((item) => item[field.column])
        .filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
      if (!values.length) {
        row[metric] = null
        // 결측이 있으면 표본 수를 함께 남긴다 — "평균 심박 없음"을 "심박이 낮았다"로 오해하지 않게.
        row[`${metric}Samples`] = 0
        continue
      }
      const total = values.reduce((sum, item) => sum + item, 0)
      if (SUM_METRICS.includes(metric)) row[metric] = round(total)
      else if (MAX_METRICS.includes(metric)) row[metric] = round(Math.max(...values))
      else row[metric] = round(total / values.length)
      row[`${metric}Samples`] = values.length
    }
    if (!row.count) row.count = list.length
    return row
  })

  const failureKind = classifyFailure(spec, resultRows, matched.length, ordered.length)
  return {
    appliedFilters: spec.filters.map(describeFilter),
    groupBy: spec.groupBy,
    matchedRuns: matched.length,
    rows: resultRows,
    failureKind,
    failureDetail: failureKind ? failureDetail(failureKind, spec, matched.length, ordered.length) : undefined
  }
}

/**
 * 실패 분류(#652 PR2). 순서가 곧 우선순위다 — 0건이면 표본 얘기는 의미가 없고,
 * 값이 전부 비었으면 "표본 2건"보다 "그 값은 기록되지 않았다"가 사용자에게 정확하다.
 */
function classifyFailure(
  spec: QueryRunsSpec,
  rows: Array<Record<string, string | number | null>>,
  matchedRuns: number,
  groupCount: number
): QueryRunsFailureKind | null {
  if (matchedRuns === 0) return 'no_matching_runs'
  const valueMetrics = spec.metrics.filter((metric) => metric !== 'count')
  if (valueMetrics.length && rows.every((row) => valueMetrics.every((metric) => row[`${metric}Samples`] === 0))) {
    return 'missing_values'
  }
  if (matchedRuns < 4) return 'low_sample'
  if (groupCount > spec.limit) return 'truncated_groups'
  return null
}

function failureDetail(kind: QueryRunsFailureKind, spec: QueryRunsSpec, matchedRuns: number, groupCount: number): string | undefined {
  if (kind === 'low_sample') return String(matchedRuns)
  if (kind === 'truncated_groups') return `${groupCount}개 중 최근 ${spec.limit}개`
  return undefined
}

function matchesFilter(row: QueryRunsRow, filter: QueryRunsFilter): boolean {
  const spec = QUERY_RUNS_FIELDS[filter.field]
  if (!spec) return false
  const raw = 'column' in spec ? row[spec.column] : weekdayLabel(row.date)
  if (spec.kind === 'number') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return false
    const target = Number(filter.value)
    if (filter.op === 'eq') return raw === target
    if (filter.op === 'ne') return raw !== target
    if (filter.op === 'gt') return raw > target
    if (filter.op === 'gte') return raw >= target
    if (filter.op === 'lt') return raw < target
    if (filter.op === 'lte') return raw <= target
    return false
  }
  const text = String(raw ?? '')
  const target = String(filter.value)
  if (filter.op === 'contains') return text.toLowerCase().includes(target.toLowerCase())
  if (filter.op === 'eq') return text === target
  if (filter.op === 'ne') return text !== target
  // 날짜 문자열은 YYYY-MM-DD 라 사전순 비교가 곧 시간순 비교다.
  if (filter.op === 'gt') return text > target
  if (filter.op === 'gte') return text >= target
  if (filter.op === 'lt') return text < target
  if (filter.op === 'lte') return text <= target
  return false
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 날짜 → 요일 라벨. 필터(weekday)와 그룹(weekday)이 **같은 어휘**를 쓰도록 한 곳에서 만든다. */
function weekdayLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return Number.isFinite(day) ? WEEKDAY_LABELS[day] : '알 수 없음'
}

function groupKey(row: QueryRunsRow, groupBy: GroupBy): string {
  if (groupBy === 'none') return 'all'
  if (groupBy === 'month') return row.date.slice(0, 7)
  if (groupBy === 'week') return isoWeekKey(row.date)
  if (groupBy === 'weekday') return weekdayLabel(row.date)
  if (groupBy === 'type') return row.type || '알 수 없음'
  if (groupBy === 'courseType') return row.course_type || '알 수 없음'
  return row.companion || '혼자'
}

/** 주 단위 키(월요일 시작). 그룹 라벨이 사전순 정렬로도 시간순이 되게 YYYY-MM-DD 형태를 쓴다. */
function isoWeekKey(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return '알 수 없음'
  const day = parsed.getUTCDay()
  const offset = day === 0 ? 6 : day - 1
  parsed.setUTCDate(parsed.getUTCDate() - offset)
  return parsed.toISOString().slice(0, 10)
}

function describeFilter(filter: QueryRunsFilter): string {
  const opLabel: Record<Op, string> = {
    eq: '=',
    ne: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    contains: '포함'
  }
  return `${filter.field} ${opLabel[filter.op]} ${filter.value}`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

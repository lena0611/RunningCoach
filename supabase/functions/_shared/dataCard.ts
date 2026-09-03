/**
 * 요약 탭 사용자 정의 데이터 카드(#767) — **스펙 → 숫자**를 결정론으로 계산한다.
 *
 * 대화로 만든 카드는 등록 때 LLM 이 스펙으로 한 번 번역하고, 그 뒤 화면을 열 때마다는 이 모듈이 계산한다.
 * 매번 LLM 을 부르면 원가가 감당이 안 되고(입력이 원가의 95%, #661), 무엇보다 **같은 카드의 숫자가 흔들린다**.
 * 값이 흔들리면 신뢰가 무너진다.
 *
 * ⚠ **카드는 수치만 말한다**(2026-09-03 결정). 임계값·경고·판정 색을 붙이지 않는다 —
 *   근거 없는 수치를 단언해 신뢰를 깬 전례가 있다(심박 상한 오답, 2026-08-04). 해석은 사용자 몫이고,
 *   근거가 확보된 판정은 카드가 아니라 코치 모먼트로 올린다.
 *   단 표본 부족·값 없음 같은 **사실 표기**는 판정이 아니라 정직성이라 남긴다.
 */

import {
  runQueryRunsCore,
  type QueryRunsFailureKind,
  type QueryRunsMetric,
  type QueryRunsRow,
  type QueryRunsSpec
} from './queryRunsCore.ts'

/**
 * 카드 스펙. 조회 하나(single)거나, **같은 축으로 묶은 두 조회의 비율**(ratio)이다.
 * ratio 를 둔 이유: 사용자가 원한 "주간 총 볼륨 대비 LSD 볼륨" 은 조회 하나로는 안 된다(나눗셈이 없다).
 * 임의 수식을 열지 않고 **합성 한 종류만** 둔다 — 닫힌 어휘를 유지해야 검증이 가능하다.
 */
/**
 * 기간은 **오늘 기준 상대값**이다(2026-09-03).
 *
 * 처음엔 모델이 준 절대 날짜 필터를 그대로 저장했는데(`date >= 2026-08-01 AND <= 2026-08-31`),
 * 그러면 카드가 **8월에 얼어붙는다** — 한 달 뒤에도 8월 숫자를 보여준다. 카드는 매일 보는 물건이라
 * 언제 열어도 "지금 기준"이어야 한다. 그래서 절대 날짜는 카드 스펙에서 금지하고, 창은 여기에만 둔다.
 * null 이면 전체 기간.
 */
export type DataCardWindow = { lastDays: number } | null

/**
 * 기간 종류(2026-09-03). 사용자가 말한 방식이 셋으로 갈린다 — **하나로 뭉치면 반드시 한쪽이 틀린다.**
 *
 * - `rolling`  "최근 4주", "지난 30일" → 오늘부터 거꾸로 N일. 매일 창이 밀린다.
 * - `calendar` "이번 달", "올해" → 달력 경계부터 오늘까지. 달이 바뀌면 리셋된다(누적의 의미).
 * - `fixed`    "8월", "지난 7월" → **일부러 얼린다.** 지난 기간의 기록은 변하면 안 된다.
 * - null       전체 기간.
 *
 * 처음엔 절대 날짜를 전부 금지했는데(카드가 얼어붙은 사고), 그러면 "8월 총 거리"처럼 **정당하게 고정인**
 * 요청까지 거부한다. 금지할 것은 절대 날짜 자체가 아니라 **의도 없이 굳는 것**이다.
 */
export type DataCardPeriod =
  | { kind: 'rolling'; lastDays: number }
  | { kind: 'calendar'; unit: 'week' | 'month' | 'year' }
  | { kind: 'fixed'; from: string; to: string }
  | null

export type DataCardSpec =
  | { kind: 'single'; title: string; query: QueryRunsSpec; metric: QueryRunsMetric; window?: DataCardWindow; period?: DataCardPeriod }
  | {
      kind: 'ratio'
      title: string
      numerator: QueryRunsSpec
      denominator: QueryRunsSpec
      metric: QueryRunsMetric
      display: 'percent' | 'times'
      window?: DataCardWindow
      period?: DataCardPeriod
    }

export type DataCardValue = {
  /** 표시할 값. 계산 불가면 null — 화면은 '—' 로 낸다(0 으로 보여주면 거짓말이 된다). */
  value: number | null
  /** 값에 붙는 단위(km·분·%·배 등). 없으면 빈 문자열. */
  unit: string
  /** 표본 수(러닝 건수) — 적을 때 사실을 밝히기 위해. */
  matchedRuns: number
  /**
   * 평균에 실제로 들어간 묶음 수(주·달 등). 비율을 묶어 계산했을 때 "최근 4주 기준"처럼
   * **무엇을 평균했는지** 밝히기 위한 값이다. 묶지 않았으면 0.
   */
  groupCount: number
  /** 묶은 축(week·month 등). 화면이 "주"/"개월" 단위 문구를 고르는 데 쓴다. */
  groupBy: string
  /** 사용자가 **요청한** 창(일). rolling 일 때만 값이 있다. 실제 묶음 수와 다를 수 있어 둘 다 밝힌다. */
  windowDays: number | null
  /** 요청한 기간 그대로. 화면이 "최근 4주"·"이번 달"·"8월"을 골라 쓴다. */
  period: DataCardPeriod
  /** 계산이 불완전한 이유. 판정이 아니라 사실이다. */
  failureKind: QueryRunsFailureKind | null
}

/**
 * 소수점 없이 보여줄 지표(2026-09-03 실측). 카드에 `159.69spm` 이 떴다 —
 * 심박·케이던스·횟수·초 단위는 소수점이 정보가 아니라 잡음이다.
 */
const INTEGER_METRICS = new Set<QueryRunsMetric>([
  'avgHeartRate',
  'maxHeartRate',
  'cadence',
  'count',
  'avgPaceSec',
  'durationSec',
  'elevationGainM'
])

const METRIC_UNITS: Partial<Record<QueryRunsMetric, string>> = {
  distanceKm: 'km',
  durationSec: '초',
  activeEnergyKcal: 'kcal',
  elevationGainM: 'm',
  avgPaceSec: '초/km',
  avgHeartRate: 'bpm',
  maxHeartRate: 'bpm',
  cadence: 'spm',
  count: '회'
}

/**
 * 카드 제목이 한 줄에 들어갈 수 있는 상한(2026-09-03 모바일 실측).
 * 375px 폭에서 지표 카드 라벨은 132px — 한글 10자(121px)까지 들어가고 11자(133px)면 꺾인다.
 *
 * **글자 수가 아니라 폭으로 센다.** "주간 대비 LSD 비중" 은 12글자지만 공백·영문이 좁아 한 줄에 들어간다 —
 * 순수 글자 수로 자르면 들어가는 제목을 거부한다.
 */
export const DATA_CARD_TITLE_WIDTH_LIMIT = 10

/** 제목 폭 점수. 한글·한자·가나·전각은 1칸, 그 밖(영문·숫자·공백·기호)은 0.5칸으로 센다. */
export function dataCardTitleWidth(title: string): number {
  let width = 0
  for (const char of title.trim()) {
    width += /[\u1100-\u11ff\u3000-\u303f\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uff60]/.test(char) ? 1 : 0.5
  }
  return width
}

/**
 * 검증 — 닫힌 어휘 밖이면 거부 이유를 돌려준다(조용히 무시하지 않는다).
 *
 * `fixable` 은 **모델이 조건을 다시 짜면 되는 실수**라는 뜻이다(2026-09-03). 이 구분이 없으면
 * 모델이 날짜를 filters 에 박는 실수 하나로 사용자가 "못 만든다"는 답을 받는다 —
 * 되는 요청을 했는데 모델 실수를 사용자에게 청구하는 셈이다. 우리가 정말 못 하는 것(없는 지표·
 * 화이트리스트 밖 조회)만 사용자에게 정직하게 말한다.
 */
export function validateDataCardSpec(
  spec: DataCardSpec
): { ok: true } | { ok: false; error: string; fixable: true } {
  if (!spec.title.trim()) return { ok: false, error: '카드 이름이 비어 있습니다.', fixable: true }
  /*
    기간은 **period 로만** 받는다. 필터에 직접 박은 날짜는 거부한다 — 의도가 rolling 인지 fixed 인지
    구분이 안 되고, 그러면 "최근 4주" 요청이 조용히 특정 월로 굳는다(2026-09-03 실사고).
    고정 기간이 필요하면 period.kind='fixed' 로 **명시**해야 한다.
  */
  const queries = spec.kind === 'single' ? [spec.query] : [spec.numerator, spec.denominator]
  if (queries.some((q) => q.filters.some((f) => f.field === 'date'))) {
    return { ok: false, error: '카드 기간은 필터가 아니라 기간 설정으로 지정해야 합니다.', fixable: true }
  }
  const period = resolvePeriodSpec(spec)
  if (period?.kind === 'rolling' && (!Number.isFinite(period.lastDays) || period.lastDays < 1)) {
    return { ok: false, error: '카드 기간이 올바르지 않습니다.', fixable: true }
  }
  if (period?.kind === 'fixed' && !(DATE_ONLY.test(period.from) && DATE_ONLY.test(period.to) && period.from <= period.to)) {
    return { ok: false, error: '고정 기간의 날짜가 올바르지 않습니다(YYYY-MM-DD, 시작 ≤ 끝).', fixable: true }
  }
  // 길면 카드에서 두 줄로 꺾인다 — 저장 뒤에 발견하면 고칠 방법이 없으므로 제안 단계에서 막는다.
  if (dataCardTitleWidth(spec.title) > DATA_CARD_TITLE_WIDTH_LIMIT) {
    return { ok: false, error: `카드 이름이 너무 깁니다(한글 ${DATA_CARD_TITLE_WIDTH_LIMIT}자 이내로 줄여주세요).`, fixable: true }
  }
  if (spec.kind === 'single') return { ok: true }
  // 비율은 같은 축으로 묶여야 비교가 성립한다(주 대 주). 축이 다르면 숫자가 의미를 잃는다.
  if (spec.numerator.groupBy !== spec.denominator.groupBy) {
    return { ok: false, error: '비율은 분자와 분모를 같은 기준으로 묶어야 합니다.', fixable: true }
  }
  // 지표가 섞이면(거리 ÷ 시간) 단위가 사라진다.
  if (!spec.numerator.metrics.includes(spec.metric) || !spec.denominator.metrics.includes(spec.metric)) {
    return { ok: false, error: '비율의 분자와 분모는 같은 지표여야 합니다.', fixable: true }
  }
  return { ok: true }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** 레거시 `window`(rolling 전용)를 period 로 편다 — 이미 저장된 카드가 계속 돌아야 한다. */
function resolvePeriodSpec(spec: DataCardSpec): DataCardPeriod {
  if (spec.period !== undefined) return spec.period
  return spec.window ? { kind: 'rolling', lastDays: spec.window.lastDays } : null
}

function toDateKey(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/**
 * 기간을 날짜 필터로 편다. 카드가 "지금"을 따라 움직이는 지점은 여기 하나뿐이다.
 * fixed 만 오늘을 안 본다 — 지난 기간의 기록은 변하면 안 되기 때문이고, 그건 **의도된** 고정이다.
 */
function withPeriod(query: QueryRunsSpec, period: DataCardPeriod, today: Date): QueryRunsSpec {
  if (!period) return query
  const add = (filters: QueryRunsSpec['filters']) => ({ ...query, filters: [...query.filters, ...filters] })

  if (period.kind === 'fixed') {
    return add([
      { field: 'date', op: 'gte', value: period.from },
      { field: 'date', op: 'lte', value: period.to }
    ])
  }
  if (period.kind === 'rolling') {
    const from = new Date(today)
    from.setDate(from.getDate() - (period.lastDays - 1))
    // 상한도 닫는다 — "최근 7일"은 **오늘까지**다. 열어 두면 미래 날짜 러닝(시간대 경계·수동 입력)이 섞인다.
    return add([
      { field: 'date', op: 'gte', value: toDateKey(from) },
      { field: 'date', op: 'lte', value: toDateKey(today) }
    ])
  }
  // calendar: 달력 경계부터 오늘까지. 달이 바뀌면 리셋되는 게 "이번 달 누적"의 뜻이다.
  const from = new Date(today)
  if (period.unit === 'week') {
    // 주는 월요일 시작(앱 전역 규칙 — trainingWeekRange 와 같은 경계).
    const day = from.getDay()
    from.setDate(from.getDate() - (day === 0 ? 6 : day - 1))
  } else if (period.unit === 'month') {
    from.setDate(1)
  } else {
    from.setMonth(0, 1)
  }
  return add([
    { field: 'date', op: 'gte', value: toDateKey(from) },
    { field: 'date', op: 'lte', value: toDateKey(today) }
  ])
}

/**
 * 스펙과 러닝 행으로 카드 값을 만든다. 오늘(today)을 받는 이유는 창이 상대값이기 때문이다 —
 * 같은 스펙이라도 날이 바뀌면 값이 바뀌어야 맞다(그게 카드를 매일 보는 이유다).
 */
export function computeDataCard(spec: DataCardSpec, rows: QueryRunsRow[], today: Date = new Date()): DataCardValue {
  const period = resolvePeriodSpec(spec)
  const windowDays = period?.kind === 'rolling' ? period.lastDays : null
  if (spec.kind === 'single') {
    const result = runQueryRunsCore(withPeriod(spec.query, period, today), rows)
    const first = result.rows[0]
    const raw = first ? first[spec.metric] : null
    return {
      value: typeof raw === 'number' ? roundForMetric(spec.metric, raw) : null,
      unit: METRIC_UNITS[spec.metric] ?? '',
      matchedRuns: result.matchedRuns,
      groupCount: spec.query.groupBy === 'none' ? 0 : result.rows.length,
      groupBy: spec.query.groupBy,
      windowDays,
      period,
      failureKind: result.failureKind
    }
  }

  const numerator = runQueryRunsCore(withPeriod(spec.numerator, period, today), rows)
  const denominator = runQueryRunsCore(withPeriod(spec.denominator, period, today), rows)
  const unit = spec.display === 'percent' ? '%' : '배'
  const groupBy = spec.denominator.groupBy
  const failureKind = denominator.failureKind ?? numerator.failureKind

  /*
    묶어서 물었으면 **묶음별 비율의 평균**을 낸다(2026-09-03 지적).
    전체를 합쳐 한 번 나누면(pooled) 볼륨이 큰 주가 결과를 지배한다 —
    "주간 비중"을 물었는데 사실은 "전체 거리 중 비중"을 답하게 되고, 두 값은 다르다.
    묶지 않았으면(groupBy=none) 묶음이 하나뿐이라 같은 식이 그대로 pooled 가 된다.
  */
  const denominatorByGroup = new Map<string, number>()
  for (const row of denominator.rows) {
    const value = row[spec.metric]
    if (typeof value === 'number' && value > 0) denominatorByGroup.set(groupKeyOf(row, groupBy), value)
  }
  const numeratorByGroup = new Map<string, number>()
  for (const row of numerator.rows) {
    const value = row[spec.metric]
    if (typeof value === 'number') numeratorByGroup.set(groupKeyOf(row, groupBy), value)
  }

  const ratios: number[] = []
  for (const [key, bottom] of denominatorByGroup) {
    // 분모가 있는 묶음만 센다. 분자가 없으면 그 묶음은 0 이 맞다(그 주에 LSD 를 안 했다는 사실).
    ratios.push((numeratorByGroup.get(key) ?? 0) / bottom)
  }

  if (!ratios.length) {
    // 분모가 0 이거나 없으면 0% 가 아니라 계산 불가다 — 0 으로 보여주면 거짓말이 된다.
    return {
      value: null,
      unit,
      matchedRuns: denominator.matchedRuns,
      groupCount: 0,
      groupBy,
      windowDays,
      period,
      failureKind: failureKind ?? 'no_matching_runs'
    }
  }

  const mean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length
  return {
    value: round(spec.display === 'percent' ? mean * 100 : mean),
    unit,
    // 표본은 **분모**(전체) 기준이다 — 비율의 신뢰도는 전체 표본이 정한다.
    matchedRuns: denominator.matchedRuns,
    groupCount: groupBy === 'none' ? 0 : ratios.length,
    groupBy,
    windowDays,
    period,
    failureKind
  }
}

/** 묶음 키. runQueryRunsCore 는 묶었을 때만 group 열을 낸다(안 묶었으면 묶음이 하나뿐이다). */
function groupKeyOf(row: Record<string, string | number | null>, groupBy: string): string {
  if (groupBy === 'none') return 'all'
  const key = row.group
  return typeof key === 'string' ? key : String(key ?? 'all')
}

function roundForMetric(metric: QueryRunsMetric, value: number): number {
  return INTEGER_METRICS.has(metric) ? Math.round(value) : round(value)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

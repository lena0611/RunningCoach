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

export type DataCardSpec =
  | { kind: 'single'; title: string; query: QueryRunsSpec; metric: QueryRunsMetric; window?: DataCardWindow }
  | {
      kind: 'ratio'
      title: string
      numerator: QueryRunsSpec
      denominator: QueryRunsSpec
      metric: QueryRunsMetric
      display: 'percent' | 'times'
      window?: DataCardWindow
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
  /** 사용자가 **요청한** 창(일). 실제 값이 있던 묶음 수와 다를 수 있어 둘 다 밝힌다. */
  windowDays: number | null
  /** 계산이 불완전한 이유. 판정이 아니라 사실이다. */
  failureKind: QueryRunsFailureKind | null
}

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

/** 검증 — 닫힌 어휘 밖이면 거부 이유를 돌려준다(조용히 무시하지 않는다). */
export function validateDataCardSpec(spec: DataCardSpec): { ok: true } | { ok: false; error: string } {
  if (!spec.title.trim()) return { ok: false, error: '카드 이름이 비어 있습니다.' }
  // 절대 날짜가 박히면 카드가 그 기간에 얼어붙는다 — 기간은 window(오늘 기준)로만 받는다.
  const queries = spec.kind === 'single' ? [spec.query] : [spec.numerator, spec.denominator]
  if (queries.some((q) => q.filters.some((f) => f.field === 'date'))) {
    return { ok: false, error: '카드 기간은 고정 날짜가 아니라 "최근 N일"로 지정해야 합니다.' }
  }
  if (spec.window && (!Number.isFinite(spec.window.lastDays) || spec.window.lastDays < 1)) {
    return { ok: false, error: '카드 기간이 올바르지 않습니다.' }
  }
  // 길면 카드에서 두 줄로 꺾인다 — 저장 뒤에 발견하면 고칠 방법이 없으므로 제안 단계에서 막는다.
  if (dataCardTitleWidth(spec.title) > DATA_CARD_TITLE_WIDTH_LIMIT) {
    return { ok: false, error: `카드 이름이 너무 깁니다(한글 ${DATA_CARD_TITLE_WIDTH_LIMIT}자 이내로 줄여주세요).` }
  }
  if (spec.kind === 'single') return { ok: true }
  // 비율은 같은 축으로 묶여야 비교가 성립한다(주 대 주). 축이 다르면 숫자가 의미를 잃는다.
  if (spec.numerator.groupBy !== spec.denominator.groupBy) {
    return { ok: false, error: '비율은 분자와 분모를 같은 기준으로 묶어야 합니다.' }
  }
  // 지표가 섞이면(거리 ÷ 시간) 단위가 사라진다.
  if (!spec.numerator.metrics.includes(spec.metric) || !spec.denominator.metrics.includes(spec.metric)) {
    return { ok: false, error: '비율의 분자와 분모는 같은 지표여야 합니다.' }
  }
  return { ok: true }
}

/** 오늘 기준 창을 날짜 필터로 편다. 카드가 "지금"을 따라 움직이는 지점은 여기 하나뿐이다. */
function withWindow(query: QueryRunsSpec, window: DataCardWindow, today: Date): QueryRunsSpec {
  if (!window) return query
  const from = new Date(today)
  from.setDate(from.getDate() - (window.lastDays - 1))
  const mm = String(from.getMonth() + 1).padStart(2, '0')
  const dd = String(from.getDate()).padStart(2, '0')
  const since = `${from.getFullYear()}-${mm}-${dd}`
  return { ...query, filters: [...query.filters, { field: 'date', op: 'gte', value: since }] }
}

/**
 * 스펙과 러닝 행으로 카드 값을 만든다. 오늘(today)을 받는 이유는 창이 상대값이기 때문이다 —
 * 같은 스펙이라도 날이 바뀌면 값이 바뀌어야 맞다(그게 카드를 매일 보는 이유다).
 */
export function computeDataCard(spec: DataCardSpec, rows: QueryRunsRow[], today: Date = new Date()): DataCardValue {
  const window = spec.window ?? null
  const windowDays = window?.lastDays ?? null
  if (spec.kind === 'single') {
    const result = runQueryRunsCore(withWindow(spec.query, window, today), rows)
    const first = result.rows[0]
    const raw = first ? first[spec.metric] : null
    return {
      value: typeof raw === 'number' ? raw : null,
      unit: METRIC_UNITS[spec.metric] ?? '',
      matchedRuns: result.matchedRuns,
      groupCount: spec.query.groupBy === 'none' ? 0 : result.rows.length,
      groupBy: spec.query.groupBy,
      windowDays,
      failureKind: result.failureKind
    }
  }

  const numerator = runQueryRunsCore(withWindow(spec.numerator, window, today), rows)
  const denominator = runQueryRunsCore(withWindow(spec.denominator, window, today), rows)
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
    failureKind
  }
}

/** 묶음 키. runQueryRunsCore 는 묶었을 때만 group 열을 낸다(안 묶었으면 묶음이 하나뿐이다). */
function groupKeyOf(row: Record<string, string | number | null>, groupBy: string): string {
  if (groupBy === 'none') return 'all'
  const key = row.group
  return typeof key === 'string' ? key : String(key ?? 'all')
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

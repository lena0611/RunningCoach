/**
 * 대화로 만든 데이터 카드 **제안**의 정규화(#767).
 *
 * 코치는 카드를 직접 만들지 않는다 — 목표·부상·일정 제안과 같은 계약이다(#639):
 * 모델이 구조화된 제안을 내면 **코드가 닫힌 어휘로 검증**하고, 화면이 승인 카드를 띄우고,
 * 사용자가 눌러야 저장된다. 화이트리스트 밖은 조용히 무시하지 않고 **거부 이유를 돌려준다** —
 * 코치가 "그 기준으로는 못 만든다"고 정직하게 말하고 **가장 가까운 대안**을 다시 낼 수 있어야 한다.
 */

import { validateDataCardSpec, type DataCardPeriod, type DataCardSpec } from './dataCard.ts'
import { normalizeQueryRunsArgs, type QueryRunsSpec } from './queryRunsCore.ts'

export type DataCardProposalResult =
  | { spec: DataCardSpec }
  /** 되묻기(2026-09-03) — 조건이 애매하면 추측하지 않고 한 가지만 묻는다. */
  | { clarify: string }
  /** `fixable` 이면 모델이 조건을 고쳐 다시 부르면 되는 실수다 — 사용자에게 "못 만든다"고 말하지 않는다. */
  | { error: string; fixable?: true }

/** 모델이 준 raw 인자 → 검증된 카드 스펙. 실패하면 사람이 읽을 이유만 남는다. */
export function normalizeDataCardProposalArgs(raw: unknown): DataCardProposalResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '카드 조건을 이해하지 못했습니다.' }
  }
  const value = raw as Record<string, unknown>

  /*
    되묻기가 먼저다(2026-09-03). 도구 호출을 강제한 뒤(#767) 코치에게 물어볼 여지가 없어져
    **애매하면 되묻는 대신 추측**하게 됐다 — 강제는 유지하되 도구 안에 질문 통로를 둔다.
    여기서 걸러야 하는 이유: 되묻는 턴에는 카드를 만들면 안 되고, 그 판단을 프롬프트에 맡기면 샌다.
  */
  const clarify = typeof value.clarify === 'string' ? value.clarify.trim() : ''
  if (clarify) return { clarify }

  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!title) return { error: '카드 이름이 비어 있습니다.' }

  const metric = typeof value.metric === 'string' ? value.metric : ''
  const kind = value.kind === 'ratio' ? 'ratio' : 'single'
  const period = normalizePeriod(value.period)

  if (kind === 'single') {
    const query = normalizeQueryRunsArgs(value.query)
    if ('error' in query) return { error: query.error }
    if (!query.spec.metrics.includes(metric as never)) {
      return { error: `'${metric || '지표'}'는 이 조회에 없는 지표입니다.` }
    }
    const spec: DataCardSpec = {
      kind: 'single',
      title,
      query: dropDateFiltersWhenPeriodWins(query.spec, period),
      metric: metric as never,
      period
    }
    const verdict = validateDataCardSpec(spec)
    return verdict.ok ? { spec } : { error: verdict.error, fixable: true }
  }

  const numerator = normalizeQueryRunsArgs(value.numerator)
  if ('error' in numerator) return { error: numerator.error }
  const denominator = normalizeQueryRunsArgs(value.denominator)
  if ('error' in denominator) return { error: denominator.error }

  const spec: DataCardSpec = {
    kind: 'ratio',
    title,
    numerator: dropDateFiltersWhenPeriodWins(numerator.spec, period),
    denominator: dropDateFiltersWhenPeriodWins(denominator.spec, period),
    metric: metric as never,
    display: value.display === 'times' ? 'times' : 'percent',
    period
  }
  const verdict = validateDataCardSpec(spec)
  return verdict.ok ? { spec } : { error: verdict.error, fixable: true }
}

/**
 * 기간이 이미 period 로 왔는데 filters 에도 날짜가 박혀 있으면 **날짜 필터를 버린다**(2026-09-03 실측).
 *
 * 지침에 "filters 에 date 를 넣지 마라"가 있는데도 그렇게 온다. 이때 검증이 거부하면 사용자는
 * 되는 요청을 하고도 "못 만든다"는 답을 받는다 — 모델 실수를 사용자에게 청구하는 셈이다.
 * period 가 있으면 의도가 모호하지 않으니(기간의 단일 출처가 period) 조용히 정리하는 게 맞다.
 * period 가 없을 때는 rolling 인지 fixed 인지 알 수 없어 손대지 않는다 — 그건 모델이 고칠 실수다.
 */
function dropDateFiltersWhenPeriodWins(spec: QueryRunsSpec, period: DataCardPeriod): QueryRunsSpec {
  if (!period) return spec
  const filters = spec.filters.filter((filter) => filter.field !== 'date')
  return filters.length === spec.filters.length ? spec : { ...spec, filters }
}

/**
 * 카드 만들기 의도 판정(#767). **코드가 판정한다** — 모델이 알아서 도구를 부르길 기대하지 않는다.
 *
 * 2026-09-03 실측: 사용자가 네 번 요청하는 동안 모델은 도구를 한 번도 부르지 않고 컨텍스트 숫자로
 * 어림했다("15~20% 안팎으로 보입니다"). 지침은 이미 있었다 — 프롬프트의 선의에 맡기면 이렇게 샌다.
 *
 * 좁게 잡는다: "카드"라는 말이 있거나, 요약/홈에 **띄워·보이게·추가**해 달라는 요청일 때만.
 * "비중이 얼마야?" 같은 단순 질문까지 강제하면 대화가 매번 카드 제안으로 끌려간다.
 */
export function mentionsDataCardIntent(note: string): boolean {
  const text = (note || '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  // 명령으로 온 요청은 의심의 여지가 없다 — 화면이 칩·'+' 카드에서 앞에 박아 보낸다.
  if (text.startsWith('/카드생성')) return true
  if (/카드/.test(text) && /(만들|추가|해줘|해 줘|등록|보여)/.test(text)) return true
  if (/(요약|홈|메인)/.test(text) && /(띄워|띄우|추가|보이게|올려|상시|늘 ?보)/.test(text)) return true
  return false
}

/*
  카드로 만들 수 없는 요청은 **되묻기 전에** 걸러낸다(2026-09-04 실사용).

  실측 두 건이 같은 뿌리였다.
  · "10km 예상시간" → 매칭 0건으로 떨어져 "그 조건에 걸리는 기록이 하나도 없어서"라고 답했다.
    사용자에겐 기록이 14건 있다 — **틀린 이유를 말한 것**이다. 예상 기록은 러닝 기록 필드가 아니라
    계산으로 나오는 값이라 카드가 못 만드는 것이지, 기록이 없는 게 아니다.
  · "나의 vo2Max" → 되물었다("VO2Max 자체? 최근 추정 기록?"). 둘 다 못 만드는데 고르라고 물은 셈이라
    사용자만 한 번 더 왕복했다.

  카드는 **run_logs 에 저장된 값의 집계**다. 그 밖의 개념은 정직하게 못 한다고 말하는 게 맞고,
  이유는 두루뭉술한 "기록 없음"이 아니라 **왜 못 만드는지**여야 한다.
*/
const UNSUPPORTED_CARD_CONCEPTS: Array<{ test: RegExp; reason: string }> = [
  {
    test: /(예상\s*(기록|시간|완주|페이스|타임)|목표\s*예상|vdot|vo2\s*_?max|최대\s*산소)/i,
    reason: '예상 기록이나 VO2max 같은 추정값은 러닝 기록에 저장된 값이 아니라 그때그때 계산해 내는 값이라, 카드로는 만들 수 없어요.'
  },
  {
    test: /(나이대|연령대|또래)/,
    reason: '나이대 비교는 가진 데이터에 연령 정보가 없어서 카드로 만들 수 없어요.'
  },
  {
    test: /(상위\s*(\d+|몇)\s*(%|퍼센트|프로)|퍼센타일|백분위|순위|등수)/,
    reason: '대회 완주자 분포 기준 순위는 러닝 기록 집계 밖이라 카드로는 만들 수 없어요.'
  },
  {
    test: /(체중|몸무게|체지방)/,
    reason: '체중·체성분은 저장하지 않아서 카드로 만들 수 없어요.'
  },
  {
    test: /(준비도|readiness|달성률|달성 ?확률)/i,
    reason: '준비도·달성률은 기록이 아니라 코치가 계산해 내는 판단값이라, 카드로는 만들 수 없어요.'
  }
]

/** 카드 어휘 밖의 개념이면 그 이유를, 아니면 null. 되묻기보다 **먼저** 본다. */
export function dataCardUnsupportedConcept(note: string): string | null {
  const text = (note || '').replace(/^\/카드생성/, '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return UNSUPPORTED_CARD_CONCEPTS.find((entry) => entry.test.test(text))?.reason ?? null
}

/*
  되묻기 게이트(2026-09-04). 되묻기 통로를 열자 **이미 다 말한 요청에도 되묻는** 경우가 생겼다.
  카드 하나 만들자고 핑퐁을 치면 그게 더 나쁜 경험이다 — 상한(2회)만으론 부족하고,
  "물어볼 게 없는 요청"은 아예 못 묻게 코드가 막는다(사용자 지시 2026-09-04).

  판정은 좁고 기계적으로: **무엇을(지표) + 언제(기간)** 이 둘 다 발화에 있으면 되물을 게 없다.
  둘 중 하나라도 비면 되묻기를 허용한다 — "요즘 얼마나 뛰는지"(기간만 있고 거리·시간·횟수 중
  무엇인지 없음)가 정확히 그런 경우고, 그때는 묻는 게 맞다.
*/
const CARD_PERIOD_HINT =
  /(최근|지난|이번|올해|작년|요즘|전체|누적|통틀어|매주|매달)|(\d+\s*(일|주|주간|개월|달|년))|(\d{1,2}\s*월)/
const CARD_METRIC_HINT =
  /(거리|볼륨|킬로|km|시간|분|페이스|속도|심박|bpm|케이던스|spm|칼로리|kcal|고도|오르막|횟수|번|회|비중|비율|퍼센트|%|배|LSD|롱런|장거리|이지|easy|템포|tempo|회복|recovery|인터벌|레이스|race|스트라이드)/i

/**
 * 되물을 필요가 없을 만큼 구체적인 요청인가. true 면 코드가 되묻기를 **거절**하고 바로 제안시킨다.
 * 관측은 `data_query_log` 의 `card_clarify_blocked` 로 남는다 — 게이트가 과했는지 나중에 셀 수 있게.
 */
export function dataCardRequestIsSpecific(note: string): boolean {
  const text = (note || '').replace(/^\/카드생성/, '').replace(/\s+/g, ' ').trim()
  if (!text) return false
  return CARD_PERIOD_HINT.test(text) && CARD_METRIC_HINT.test(text)
}

/**
 * 기간 정규화(2026-09-03). 사용자가 말한 방식이 셋으로 갈리므로 **모델이 종류를 고르고 코드가 검증**한다.
 * 화이트리스트 밖이면 조용히 무시하지 않고 null(전체 기간)로 떨어뜨린다 — 잘못된 기간으로 계산하는 것보다
 * 전체를 보여주고 사용자가 다시 말하게 하는 편이 낫다.
 */
function normalizePeriod(raw: unknown): DataCardPeriod {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.kind === 'rolling') {
    const days = typeof value.lastDays === 'number' ? Math.floor(value.lastDays) : 0
    return days > 0 ? { kind: 'rolling', lastDays: Math.min(days, 730) } : null
  }
  if (value.kind === 'calendar') {
    const unit = value.unit
    return unit === 'week' || unit === 'month' || unit === 'year' ? { kind: 'calendar', unit } : null
  }
  if (value.kind === 'fixed') {
    const from = typeof value.from === 'string' ? value.from : ''
    const to = typeof value.to === 'string' ? value.to : ''
    return from && to ? { kind: 'fixed', from, to } : null
  }
  return null
}

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

/**
 * 대화로 만든 데이터 카드 **제안**의 정규화(#767).
 *
 * 코치는 카드를 직접 만들지 않는다 — 목표·부상·일정 제안과 같은 계약이다(#639):
 * 모델이 구조화된 제안을 내면 **코드가 닫힌 어휘로 검증**하고, 화면이 승인 카드를 띄우고,
 * 사용자가 눌러야 저장된다. 화이트리스트 밖은 조용히 무시하지 않고 **거부 이유를 돌려준다** —
 * 코치가 "그 기준으로는 못 만든다"고 정직하게 말하고 **가장 가까운 대안**을 다시 낼 수 있어야 한다.
 */

import { validateDataCardSpec, type DataCardSpec } from './dataCard.ts'
import { normalizeQueryRunsArgs } from './queryRunsCore.ts'

export type DataCardProposalResult =
  | { spec: DataCardSpec }
  | { error: string }

/** 모델이 준 raw 인자 → 검증된 카드 스펙. 실패하면 사람이 읽을 이유만 남는다. */
export function normalizeDataCardProposalArgs(raw: unknown): DataCardProposalResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '카드 조건을 이해하지 못했습니다.' }
  }
  const value = raw as Record<string, unknown>
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!title) return { error: '카드 이름이 비어 있습니다.' }

  const metric = typeof value.metric === 'string' ? value.metric : ''
  const kind = value.kind === 'ratio' ? 'ratio' : 'single'
  /*
    기간은 **오늘 기준 상대값**만 받는다. 절대 날짜를 저장하면 카드가 그 기간에 얼어붙는다
    (2026-09-03: "최근 4주" 요청이 `2026-08-01~08-31` 로 굳어 8월 카드가 됐다).
  */
  const rawWindow = typeof value.windowDays === 'number' ? Math.floor(value.windowDays) : 0
  const window = rawWindow > 0 ? { lastDays: Math.min(rawWindow, 730) } : null

  if (kind === 'single') {
    const query = normalizeQueryRunsArgs(value.query)
    if ('error' in query) return { error: query.error }
    if (!query.spec.metrics.includes(metric as never)) {
      return { error: `'${metric || '지표'}'는 이 조회에 없는 지표입니다.` }
    }
    const spec: DataCardSpec = { kind: 'single', title, query: query.spec, metric: metric as never, window }
    const verdict = validateDataCardSpec(spec)
    return verdict.ok ? { spec } : { error: verdict.error }
  }

  const numerator = normalizeQueryRunsArgs(value.numerator)
  if ('error' in numerator) return { error: numerator.error }
  const denominator = normalizeQueryRunsArgs(value.denominator)
  if ('error' in denominator) return { error: denominator.error }

  const spec: DataCardSpec = {
    kind: 'ratio',
    title,
    numerator: numerator.spec,
    denominator: denominator.spec,
    metric: metric as never,
    display: value.display === 'times' ? 'times' : 'percent',
    window
  }
  const verdict = validateDataCardSpec(spec)
  return verdict.ok ? { spec } : { error: verdict.error }
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

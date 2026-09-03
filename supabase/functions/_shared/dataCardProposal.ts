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

  if (kind === 'single') {
    const query = normalizeQueryRunsArgs(value.query)
    if ('error' in query) return { error: query.error }
    if (!query.spec.metrics.includes(metric as never)) {
      return { error: `'${metric || '지표'}'는 이 조회에 없는 지표입니다.` }
    }
    const spec: DataCardSpec = { kind: 'single', title, query: query.spec, metric: metric as never }
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
    display: value.display === 'times' ? 'times' : 'percent'
  }
  const verdict = validateDataCardSpec(spec)
  return verdict.ok ? { spec } : { error: verdict.error }
}

/**
 * `queryRuns` — 대화로 들어온 임의 데이터 질문을 결정론 집계로 답하는 도구(#652).
 *
 * 계산 자체는 `_shared/queryRunsCore.ts` 에 있다(#767). 이 파일은 **코치 전용 껍데기**다:
 * 코어가 낸 실패 종류(kind)에 코치 응대 지침(`buildDataGapDirective`)을 얹어 `caution` 으로 만든다.
 * 그렇게 나눈 이유 — 요약 탭의 사용자 정의 카드가 같은 코어로 계산해야 **코치 답변과 카드가 같은 숫자**를
 * 말한다. 문구는 표면마다 달라도 되지만 숫자는 한 벌이어야 한다.
 */

import { buildDataGapDirective, type DataGapKind } from './dataGap.ts'
import {
  runQueryRunsCore,
  type QueryRunsCoreResult,
  type QueryRunsRow,
  type QueryRunsSpec
} from '../_shared/queryRunsCore.ts'

export {
  normalizeQueryRunsArgs,
  QUERY_RUNS_FIELDS,
  QUERY_RUNS_GROUPS,
  QUERY_RUNS_METRICS
} from '../_shared/queryRunsCore.ts'
export type { QueryRunsFilter, QueryRunsRow, QueryRunsSpec } from '../_shared/queryRunsCore.ts'

export type QueryRunsResult = Omit<QueryRunsCoreResult, 'failureKind' | 'failureDetail'> & {
  failureKind: DataGapKind | null
  /** 결과가 비었거나 표본이 적을 때 코치가 반드시 반영할 주의. failureKind 별 고정 문구다. */
  caution: string | null
}

export function runQueryRuns(spec: QueryRunsSpec, rows: QueryRunsRow[]): QueryRunsResult {
  const { failureKind, failureDetail, ...rest } = runQueryRunsCore(spec, rows)
  return {
    ...rest,
    failureKind,
    caution: failureKind ? buildDataGapDirective(failureKind, failureDetail) : null
  }
}

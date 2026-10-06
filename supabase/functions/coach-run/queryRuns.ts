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
  const cautions = [
    failureKind ? buildDataGapDirective(failureKind, failureDetail) : null,
    // 값이 없어 판정 못한 런(#838) — 데이터에만 실으면 모델이 "3번"만 말하고 넘어간다. 지침으로 못박는다.
    rest.undecidedRuns
      ? `${rest.undecidedFields.map(fieldLabel).join('·')} 값이 기록되지 않은 러닝 ${rest.undecidedRuns}건은 조건을 판정할 수 없어 세지 않았다. 답에 이 사실을 함께 밝혀라 — 모르는 것을 "아니다"로 말하지 않는다.`
      : null,
    rest.estimatedWeatherRuns
      ? `이 중 ${rest.estimatedWeatherRuns}건의 기온·습도는 기록 원본이 아니라 시작 시각·위치로 추정한 과거 날씨다. 실측처럼 단정하지 말고 추정값이 섞였음을 밝혀라.`
      : null
  ].filter((item): item is string => Boolean(item))
  return {
    ...rest,
    failureKind,
    caution: cautions.length ? cautions.join(' ') : null
  }
}

const FIELD_LABELS: Record<string, string> = {
  temperature: '기온',
  humidity: '습도',
  windMps: '바람',
  avgHeartRate: '평균 심박',
  maxHeartRate: '최대 심박',
  cadence: '케이던스',
  rpe: 'RPE',
  sleepQuality: '수면',
  conditionScore: '컨디션',
  stressLevel: '스트레스'
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

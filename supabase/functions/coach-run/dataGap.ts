/**
 * 답할 수 없을 때의 처리(#652 PR2).
 *
 * 커버리지는 영원히 100%가 안 된다 — 조합은 무한하고 데이터에 없는 것도 있다. 그래서 **"못 답하는 상황"은
 * 예외가 아니라 상시 상태**다. 유료 서비스에서 신뢰를 깨는 건 "못 한다"가 아니라 **"못 하는데 아는 척하는 것"**
 * 이다(2026-08-04 실사고: 심박 상한을 근거 없이 145/165 로 말했다, 실제 138/157).
 *
 * 그래서 실패를 프롬프트의 선의에 맡기지 않는다.
 * - **분류는 코드가** 한다(`QueryRunsFailureKind`).
 * - **종류별 응대 지침도 코드가 쓴다**(`buildDataGapDirective`) — 모델이 그때그때 판단하지 않게.
 * - 모델이 스스로 못 하겠다고 선언할 **전용 통로**를 준다(`reportDataGap`). 통로가 없으면 추정으로 답한다.
 * - 모든 실패는 **기록으로 남는다**(`coach_data_gaps`) — 무엇을 확장할지, 나아가 무엇을 저장해야 하는지를
 *   사용자 질문이 알려주는 구조. 지금 필드 확장 우선순위는 추측인데, 이게 쌓이면 데이터가 된다.
 */

/** 실패 종류. ①~④는 도구 결과에서 코드가 판정하고, ⑤⑥은 모델이 `reportDataGap` 으로 선언한다. */
export type DataGapKind =
  /** ① 필드 자체가 없다(비 온 날·신발). */
  | 'unsupported_field'
  /** ② 필드는 있으나 값이 비어 있다(심박 미측정). */
  | 'missing_values'
  /** ③ 조건에 맞는 기록이 0건. */
  | 'no_matching_runs'
  /** ④ 표본이 너무 적다. */
  | 'low_sample'
  /** ⑤ 도구 표현력 부족 — 증가율·상관·전후 비교처럼 조건 조합으로 안 되는 계산. */
  | 'beyond_tool'
  /** ⑥ 질문 자체가 애매하다("요즘 어때?"). */
  | 'ambiguous_question'
  /** 그룹이 많아 일부만 돌려줬다. */
  | 'truncated_groups'
  /** 조회 조건 형식 오류. */
  | 'invalid_args'
  /** 조회 자체가 실패했다(DB). */
  | 'query_failed'
  /** 도구를 부르지 않고 과거 수치를 말했다 — 후처리 게이트가 잡은 경우. */
  | 'ungrounded_claim'

/**
 * 종류별 응대 지침. **코드가 쓰는 문장**이라 모델 버전이 바뀌어도 응대 방침이 흔들리지 않는다
 * ([[coach-always-on-block-deterministic]] 와 같은 철학 — "always" 는 프롬프트 부탁이 아니라 주입이다).
 */
export function buildDataGapDirective(kind: DataGapKind, detail?: string): string {
  switch (kind) {
    case 'unsupported_field':
      return `${detail ? `${detail} ` : ''}기록에 저장하지 않는 항목이다. **비슷한 다른 항목으로 슬쩍 바꿔 답하지 마라**(예: 강수 대신 습도). 그 기준으로는 볼 수 없다고 먼저 말하고, 지금 볼 수 있는 것을 한 가지만 제안한다.`
    case 'missing_values':
      return '조건에 맞는 러닝은 있지만 물어본 값이 기록되어 있지 않다(표본 0). 값이 **없다는 뜻**이고 낮거나 좋다는 뜻이 아니다. 없다고 말하고 추정하지 않는다.'
    case 'no_matching_runs':
      return '조건에 맞는 기록이 없습니다. 없는 값을 추정해 말하지 말고 기록이 없다고 알려주세요. 조건을 어떻게 바꾸면 볼 수 있는지 한 줄로 덧붙이세요.'
    case 'low_sample':
      return `표본이 ${detail ?? '몇'}건뿐입니다. 경향으로 단정하지 말고 표본이 적다는 점을 함께 말해주세요.`
    case 'beyond_tool':
      return '한 번의 조회 조합으로는 답할 수 없는 계산이다(증가율·상관·전후 비교 등). **머릿속으로 계산해 지어내지 마라.** 조회로 확인된 사실만 말하고, 그 계산은 지금 해줄 수 없다고 분명히 밝힌다.'
    case 'ambiguous_question':
      return '질문의 기준이 정해지지 않았다. 임의로 골라 답하지 말고 무엇을 기준으로 볼지 한 문장으로 되묻는다.'
    case 'truncated_groups':
      return `그룹이 많아 ${detail ?? '일부'}만 돌려줬습니다. 전체가 아니라는 점을 밝혀주세요.`
    case 'invalid_args':
      return '조회 조건을 이해하지 못했다. 무엇을 기준으로 볼지 되묻고, 조건을 짐작해 답하지 않는다.'
    case 'query_failed':
      return '기록을 불러오지 못했다. 숫자를 말하지 말고 지금 기록을 확인할 수 없다고 알린다.'
    case 'ungrounded_claim':
      return '근거 없는 과거 수치를 말하지 않는다. 기간과 숫자를 말하려면 반드시 queryRuns 로 확인한다.'
  }
}

/** 모델이 선언할 수 있는 실패 사유(⑤⑥ + ①). 내부 kind 로 매핑한다. */
const REPORT_REASONS: Record<string, DataGapKind> = {
  missing_field: 'unsupported_field',
  beyond_tool: 'beyond_tool',
  ambiguous: 'ambiguous_question'
}

export const REPORT_DATA_GAP_REASONS = Object.keys(REPORT_REASONS)

export type ReportDataGapArgs = { kind: DataGapKind; question: string; needed: string }

/** `reportDataGap` 인자 정규화. 모르는 사유는 "애매하다"로 떨어뜨린다(추정 답변보다 되묻기가 안전하다). */
export function normalizeReportDataGapArgs(raw: unknown): ReportDataGapArgs {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const reason = typeof value.reason === 'string' ? value.reason : ''
  return {
    kind: REPORT_REASONS[reason] ?? 'ambiguous_question',
    question: typeof value.question === 'string' ? value.question.slice(0, 500) : '',
    needed: typeof value.needed === 'string' ? value.needed.slice(0, 300) : ''
  }
}

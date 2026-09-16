/**
 * 코치 답변 품질 신호 관측(#825).
 *
 * 왜 필요한가 — #821 에서 고친 여섯 건 전부 **사용자가 써보고 말해줘야** 드러났다. 그런데 그중
 * 상당수는 기계가 셀 수 있는 것이었다(내부 상태값 노출·금지 은유·리포트 헤더·문체 혼용).
 * 다음 회귀를 사용자가 아니라 로그가 먼저 발견하게 한다.
 *
 * **관측 전용이다.** 답변을 바꾸지 않는다 — `ungroundedClaim.ts` 가 같은 순서를 밟았다(#652 PR2:
 * "오탐율을 로그로 측정한 뒤에 차단으로 올린다"). 지금 후처리로 문장을 고치면 정상 코칭까지
 * 망가뜨리는 회귀를 사용자가 먼저 보게 된다. 게다가 답변은 스트리밍으로 이미 나간 뒤라
 * **여기서 고쳐도 사용자가 본 화면은 못 바꾼다** — 검출은 저장 시점이다.
 *
 * 평가셋을 따로 만들지 않는 것이 요점이다. 실제 사용자 대화가 곧 표본이고 비용은 0 이다.
 */

export type AnswerQualitySignals = {
  /** 노출된 내부 상태값·토큰(앱 화면 라벨로 옮겼어야 하는 것). */
  internalTerms: string[]
  /** 금지한 어색한 은유. */
  bannedPhrases: string[]
  /** `##` 소제목 수. 대화 턴에서만 위반이고 report 모드에서는 정상이라 판정은 호출부가 한다. */
  headings: number
  /** 본문에 글자 그대로 남은 역슬래시-n(모델이 한 번 더 이스케이프한 경우). */
  escapedNewlines: number
  /** 한 답변에 존댓말과 평서체가 섞였나(앱이 만든 문장을 그대로 붙여넣으면 이렇게 된다). */
  styleMixed: boolean
  usedList: boolean
  usedTable: boolean
}

/**
 * 내부 상태값·판정 토큰. 세션 타입(Easy·Recovery·LSD·Tempo)은 **넣지 않는다** — 앱 화면에 그대로
 * 쓰는 정상 어휘라 넣으면 거의 모든 답변이 위반으로 잡힌다.
 */
const INTERNAL_TERMS: Array<{ term: string; pattern: RegExp }> = [
  { term: 'monitoring', pattern: /\bmonitoring\b/i },
  { term: 'active', pattern: /\bactive\b/i },
  { term: 'resolved', pattern: /\bresolved\b/i },
  { term: 'redFlag', pattern: /\bred\s*flag\b/i },
  { term: 'canIntensify', pattern: /\bcanIntensify\b/i },
  { term: 'met_/missed_', pattern: /\b(met|missed)_[a-z_]+/i },
  // 컨텍스트 키 이름. buildInternalNamingGuard 가 이미 금지한 것들 중 실제로 샐 법한 것만 둔다.
  { term: 'upcomingSchedule', pattern: /\bupcomingSchedule\b/ },
  { term: 'restState', pattern: /\brestState\b/ },
  { term: 'injurySignals', pattern: /\binjurySignals\b/ },
  { term: 'trustLayerNote', pattern: /\btrustLayerNote\b/ }
]

/**
 * 금지 은유(2026-09-16 사용자 지적).
 *
 * "조용"은 활용형을 통째로 받는다 — 구절 예시만 막았더니 "발이 조용한지" → "상태가 조용할 때만" →
 * "통증이 완전히 조용할 때까지"로 어형만 바꿔 세 번 샜다.
 */
const BANNED_PHRASES: Array<{ label: string; pattern: RegExp }> = [
  { label: '조용하다', pattern: /조용(한|할|히|하게|해지|하면|하고|했)/ },
  { label: '밀어붙이다', pattern: /밀어붙/ }
]

/** 존댓말 종결(~요 / ~습니다 / ~ㅂ니다). */
const POLITE_ENDING = /(요|니다)[.!?]/
/**
 * 평서체 종결(~다). `니다`(습니다·입니다)는 존댓말이므로 제외한다 — 앞 글자가 `니` 가 아닌 `다` 만 본다.
 */
const PLAIN_ENDING = /[가-힣](?<!니)다[.!?]/

/** 코드블록 안은 검사하지 않는다 — 수치 정렬용 블록이라 문체·기호 규칙이 다르다. */
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ')
}

export function detectAnswerQualitySignals(report: string): AnswerQualitySignals {
  const body = stripCodeBlocks(report)
  return {
    internalTerms: INTERNAL_TERMS.filter(({ pattern }) => pattern.test(body)).map(({ term }) => term),
    bannedPhrases: BANNED_PHRASES.filter(({ pattern }) => pattern.test(body)).map(({ label }) => label),
    headings: (body.match(/(^|\n)#{1,3}\s/g) ?? []).length,
    escapedNewlines: (body.match(/\\n/g) ?? []).length,
    styleMixed: POLITE_ENDING.test(body) && PLAIN_ENDING.test(body),
    usedList: /(^|\n)\s*([-*]\s|\d+\.\s)/.test(body),
    usedTable: /\|\s*:?-{3,}/.test(body)
  }
}

/** 관측 로그에 남길 값이 하나라도 있나 — 전부 깨끗하면 로그를 키우지 않는다. */
export function hasQualityViolation(signals: AnswerQualitySignals, conversational: boolean): boolean {
  return (
    signals.internalTerms.length > 0 ||
    signals.bannedPhrases.length > 0 ||
    signals.escapedNewlines > 0 ||
    signals.styleMixed ||
    (conversational && signals.headings > 0)
  )
}

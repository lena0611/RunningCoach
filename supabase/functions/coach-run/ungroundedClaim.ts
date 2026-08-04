/**
 * "모른다"를 1급 응답으로 만드는 후처리 게이트(#652 PR2).
 *
 * 도구를 **부르지 않았는데** 답변에 과거 기간 + 수치가 섞여 있으면 지어낸 것이다. 문제는 정상 코칭 답변과
 * 구분이 어렵다는 것 — "심박 138 이하로 뛰세요", "이번 주는 30km 로 가자" 는 지어낸 게 아니라 처방이다.
 * 차단이 과하면 정상 코칭을 막으므로 **세 조건이 동시에** 성립할 때만 잡는다.
 *
 *   ① 컨텍스트가 뒷받침할 수 없는 기간 표현 — "지난달", "6월", "2달 전", "작년"
 *      (`recent7/14/30DistanceKm` 가 이미 주입되므로 "최근 7일·2주·한 달"류는 **근거 있는 발화**다. 제외한다.)
 *   ② 과거 사실 어미 — 뛰었/달렸/기록했/였 …  (처방·권유는 여기서 걸러진다)
 *   ③ 데이터 단위가 붙은 수치 — km·회·bpm·분·페이스
 *
 * **PR2 는 경고까지만 한다.** 오탐율을 실제 로그로 측정한 뒤에 차단으로 올린다(이슈 #652 의 순서 그대로).
 * 지금 차단하면 정상 코칭을 막는 회귀를 사용자가 먼저 발견하게 된다.
 */

/** 주입된 컨텍스트(recent7/14/30)로 답할 수 있는 창 — 여기 걸리면 근거 있는 발화로 본다. */
const GROUNDED_WINDOW =
  /최근\s*(7|14|30)\s*일|최근\s*(1|2|한|두)\s*주|최근\s*(한\s*달|1\s*개월)|이번\s*주|지난\s*7\s*일|일주일|이주일/

/**
 * achievements(PB·최고 볼륨)도 상시 주입 컨텍스트다 — PB 언급은 근거 있는 발화로 본다.
 * 2026-08-04 실측(200건): 유일한 진짜 오탐이 "지난달(6월)에 5K 28분32초 PB를 찍었고"였다.
 */
const GROUNDED_ACHIEVEMENT = /pb|개인\s*기록|최고\s*기록|신기록|베스트/i

/** 컨텍스트가 뒷받침하지 못하는 기간 표현(월 경계·연 단위·30일 밖). */
const UNGROUNDED_PERIOD =
  /지난\s*달|저번\s*달|전\s*달|\d+\s*(달|개월)\s*전|\d+\s*개월\s*(간|동안)|\d{1,2}\s*월(?![가-힣])|작년|재작년|올해|\d{4}\s*년/

/** 과거 사실을 주장하는 어미. 처방("가자"·"하세요")과 갈라주는 핵심 조건이다. */
const PAST_FACT =
  /뛰었|달렸|기록했|기록은|기록이었|찍었|했었|했고|했는데|했습니다|였|이었|나왔|올랐|줄었|늘었|누적|총계|합계/

/** 데이터 단위가 붙은 수치. 맨숫자는 잡지 않는다(회차·요일 등 오탐이 크다). */
const DATA_QUANTITY =
  /\d+(\.\d+)?\s*(km|킬로|킬로미터)|\d+\s*(회|번|차례)|\d+\s*bpm|\d+\s*:\s*\d+\s*\/?\s*km|\d+(\.\d+)?\s*(분|시간)|\d+\s*spm/i

export type UngroundedClaim = { sentence: string; period: string; quantity: string }

/**
 * 도구 없이 나온 과거 수치 주장을 찾는다. 문장 단위로 세 조건의 **동시 등장**만 잡는다.
 * 호출하는 쪽에서 `toolCalled === false` 일 때만 돌린다 — 도구를 불렀으면 숫자에 출처가 있다.
 */
export function detectUngroundedDataClaims(report: string): UngroundedClaim[] {
  const claims: UngroundedClaim[] = []
  for (const raw of splitSentences(report)) {
    const sentence = raw.trim()
    if (!sentence) continue
    if (GROUNDED_WINDOW.test(sentence)) continue
    if (GROUNDED_ACHIEVEMENT.test(sentence)) continue
    const period = sentence.match(UNGROUNDED_PERIOD)?.[0]
    if (!period) continue
    if (!PAST_FACT.test(sentence)) continue
    const quantity = sentence.match(DATA_QUANTITY)?.[0]
    if (!quantity) continue
    claims.push({ sentence: sentence.slice(0, 200), period, quantity })
  }
  return claims
}

/** 마크다운 답변을 문장으로 쪼갠다. 줄바꿈·불릿도 경계로 본다(항목 나열이 한 문장으로 뭉치면 오탐이 커진다). */
function splitSentences(report: string): string[] {
  return report
    .replace(/^\s*[-*·]\s*/gm, '\n')
    .split(/(?<=[.!?。])\s+|\n+/)
}

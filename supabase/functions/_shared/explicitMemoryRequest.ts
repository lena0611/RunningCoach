/**
 * 사용자가 **직접** 장기 기억을 요청했는지 판정한다 (2026-09-08).
 *
 * 왜 코드가 판정하나: "기억해줘"에 대한 보장이 어디에도 없었다. 코치가 memoryItems 에 넣을지는
 * 소프트 지침이고, 넣더라도 `looksLikeDurableMemory` 의 **키워드 화이트리스트**(성향·패턴·발바닥·
 * 더위…)에 안 걸리면 조용히 폐기됐다. 그러면서 코치는 "기억해둘게요"라고 답한다 — 앱이 거짓말을 한다.
 *
 * 화이트리스트는 코치가 **자기 판단으로** 넣는 걸 거르려고 만든 안전장치다. 사용자가 직접 요청한
 * 것까지 거르는 건 잘못이다. 그래서 이 판정이 참이면 호출부가 화이트리스트를 우회한다.
 */

/** 요청 표현. "기억해둬"처럼 뒤에 붙는 어미까지 흡수한다. */
const REQUEST_PATTERNS: RegExp[] = [
  /기억\s*(해|해줘|해둬|해 둬|하고|해두|해줄래|부탁)/,
  /잊지\s*(마|말|않)/,
  /(메모|기록|저장)\s*(해줘|해둬|해 둬|해두|해놔|해 놔)/,
  /알아\s*(둬|두세요|두라)/,
  /(계속|앞으로|다음부터)\s*(기억|참고)/
]

/**
 * 질문은 요청이 아니다. "뭘 기억해?" · "기억하고 있어?" 를 요청으로 읽으면,
 * 사용자가 기억을 **물어본** 턴마다 화이트리스트가 열려 엉뚱한 게 저장된다.
 */
const INTERROGATIVE = /(뭐|뭘|무엇|어떤|어떻게|어찌|얼마나|어디까지|있나|하나요|는지|\?)/

/** 사용자 발화가 "이걸 기억해둬"인가. 질문이면 false. */
export function mentionsExplicitMemoryRequest(userNote: string | null | undefined): boolean {
  const note = (userNote ?? '').trim()
  if (!note) return false
  // 문장 단위로 본다 — "뭘 기억해? 그리고 이건 기억해줘" 처럼 섞이면 요청 문장이 하나라도 있으면 참.
  // ⚠ 물음표를 **문장에 남긴 채** 나눈다. 떼어내면 "어떻게 기억해?" 가 요청으로 읽힌다(실측).
  const sentences = note.split(/(?<=[.!?])|\n/).map((part) => part.trim()).filter(Boolean)
  const candidates = sentences.length ? sentences : [note]
  return candidates.some((sentence) => {
    if (!REQUEST_PATTERNS.some((pattern) => pattern.test(sentence))) return false
    return !INTERROGATIVE.test(sentence)
  })
}

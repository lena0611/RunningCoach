/**
 * 장기기억(coach_memory_items) 근사 중복 판정 (#796).
 *
 * 기존 키는 `비알파넘 제거 + 120자 절단` 이라 한국어 변형을 거의 못 잡았다 —
 * 203건 중 201건이 "서로 다른" 것으로 계산됐는데, 실측하면 같은 사실이 최대 5번 저장돼 있었다.
 *
 *   · "발바닥이 조용할 때만 스트라이드를 다시 넣는 쪽을 선호" / "…가속과 스트라이드를…" / "우측 발바닥이…"
 *   · "…믿는 쪽이다" / "…믿는 쪽이 맞다" / "…믿는 쪽이 맞는다"   ← 어미 하나 차이
 *
 * 이게 왜 해로운가: 활성 기억은 **상위 6칸**만 프롬프트에 올라간다. 실측 상위 12칸에 실제 사실은
 * 8개뿐이었고 두 사실이 각각 3칸을 차지했다 — 중복이 다른 기억을 밀어낸다.
 *
 * 그래서 조사·어미·좌우 수식어를 걷어낸 **토큰 집합**으로 비교한다. 뜻이 뒤집히는 병합은 부정 가드로 막는다.
 *
 * 임계값은 실측 코퍼스(204건)로 정했다 — 0.6 이면 149그룹(55건 병합), 0.4 면 120그룹(84건 병합).
 * 새로 병합되는 0.40~0.44 구간 42쌍을 표본 검사해 거의 전부 같은 사실의 재서술임을 확인하고 0.4 로 내렸다
 * (예: "발바닥이 조용할 때만 스트라이드" ↔ "발바닥이 조용하고 Easy가 안정적일 때만 스트라이드").
 * 더 내리지 않는 이유: 그 아래는 주제만 겹치는 서로 다른 사실이 섞인다.
 */

/** 문장 주체·시점처럼 사실을 가르지 않는 토큰. */
const NOISE_TOKENS = new Set([
  '사용자', '유저', '본인', '나', '내',
  '지금', '오늘', '최근', '그때', '요즘', '현재',
  '쪽', '편', '것', '거', '수', '점', '중',
  '경우', '때', '더', '좀', '아주', '매우', '조금'
])

/** 좌·우 구분은 같은 사실의 변형으로 본다("우측 발바닥" ≡ "발바닥"). */
const LATERALITY = /(좌측|우측|왼쪽|오른쪽|왼|오른)/g

/**
 * 같은 개념의 활용형을 하나로 모은다. 유의어 사전이 아니라 **활용형 정규화**다 —
 * 조사·어미 제거로는 어간이 바뀌는 활용("더위/더울/더운/덥")을 못 잡는다.
 * 실측 누수: "더울 때 심박보다 호흡이 편한지"가 "더위·습도에선 심박보다 편안한 호흡"과 공유 토큰 3개로
 * 떨어져 통과했다("더울"≠"더위", "편한지"≠"편안"). 뒤따르는 한글까지 먹어 개념 하나로 모은다.
 */
const INFLECTIONS: readonly [RegExp, string][] = [
  [/(더위|더울|더운|더워|덥)[가-힣]*/g, '더위'],
  [/(편안|편한|편하|편해)[가-힣]*/g, '편안'],
  [/(민감|예민)[가-힣]*/g, '민감']
]

/** 뜻을 뒤집는 표현 — 한쪽에만 있으면 병합하지 않는다. */
const NEGATION = /(않|없|말고|아닌|아니|금지|피해|줄이|보류|중단)/

/** 조사·어미 꼬리. 토큰 끝에서만 떼어낸다. */
const TAIL =
  /(으로서|에서는|에게는|이라도|까지|부터|보다|처럼|만큼|와는|과는|에는|으로|에서|이라|라도|한다|된다|이다|하는|되는|하고|되고|해서|이고|들이|들을|은|는|이|가|을|를|에|의|와|과|도|만|로|하)$/

/** 비교용 토큰 집합. 짧은 토큰과 잡음은 버린다. */
export function memoryFactTokens(content: string): Set<string> {
  let cleaned = content.toLowerCase().replace(LATERALITY, ' ')
  for (const [pattern, canonical] of INFLECTIONS) cleaned = cleaned.replace(pattern, canonical)
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  const tokens = new Set<string>()
  for (const rawToken of cleaned.split(/\s+/)) {
    if (!rawToken) continue
    const token = rawToken.replace(TAIL, '')
    if (token.length < 2) continue
    if (NOISE_TOKENS.has(token)) continue
    tokens.add(token)
  }
  return tokens
}

const SIMILARITY_THRESHOLD = 0.4
/** 짧은 문장 두 개가 우연히 겹쳐 병합되는 것을 막는 하한. */
const MIN_SHARED_TOKENS = 3

/** 같은 사실의 변형인가. 부정 표현이 한쪽에만 있으면 다른 사실로 본다. */
export function isNearDuplicateFact(a: string, b: string): boolean {
  if (NEGATION.test(a) !== NEGATION.test(b)) return false
  const left = memoryFactTokens(a)
  const right = memoryFactTokens(b)
  if (!left.size || !right.size) return false
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  if (shared < MIN_SHARED_TOKENS) return false
  return shared / (left.size + right.size - shared) >= SIMILARITY_THRESHOLD
}

/**
 * 근사 중복을 접어 첫 등장만 남긴다. **호출부가 우선순위대로 정렬해서 넘겨야 한다**
 * (먼저 오는 것이 남는다). 기존 저장 데이터를 지우지 않고 읽는 쪽에서 자가 치유한다.
 */
export function collapseNearDuplicateFacts<T>(items: T[], getContent: (item: T) => string): T[] {
  const kept: T[] = []
  const keptContents: string[] = []
  for (const item of items) {
    const content = getContent(item)
    if (!content) continue
    if (keptContents.some((existing) => isNearDuplicateFact(existing, content))) continue
    kept.push(item)
    keptContents.push(content)
  }
  return kept
}

/** 새 기억이 기존 코퍼스에 이미 있는가. */
export function isKnownFact(content: string, corpus: string[]): boolean {
  return corpus.some((existing) => isNearDuplicateFact(existing, content))
}

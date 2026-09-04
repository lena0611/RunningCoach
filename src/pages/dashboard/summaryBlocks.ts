/**
 * 요약 탭에서 사용자가 켜고 끄고 순서를 바꿀 수 있는 블록 목록(#767 후속).
 *
 * 기본 구성은 **코드가 갖는다**. DB(`user_summary_layout`)에는 사용자가 바꾼 것만 남는다 —
 * 그래야 나중에 기본 카드를 하나 추가해도 기존 사용자 화면에 자동으로 보인다.
 *
 * 히어로(오늘 훈련)와 날짜 스트립은 여기 없다. 요약의 뼈대라 편집 대상이 아니다.
 */

export type SummaryBlockId = string

export type SummaryBlock = {
  id: SummaryBlockId
  label: string
  /** '카드 추가' 목록에서 무엇을 보여주는 카드인지 한 줄로. 이름만으론 모른다. */
  description: string
}

/** 지표 카드 영역(2열 그리드). 다시 붙이면 **맨 뒤**에 붙는다. 사용자 정의 카드도 같은 목록이다. */
export const SUMMARY_CARD_BLOCKS: SummaryBlock[] = [
  { id: 'last7', label: '주간 거리', description: '최근 7일 동안 뛴 거리 합계' },
  { id: 'easy', label: 'Easy 비율', description: '최근 30일 러닝 중 Easy 강도가 차지한 비율' },
  { id: 'hard', label: '강훈련', description: '최근 7일 동안 한 강한 세션 횟수' },
  { id: 'avgHr', label: '평균 심박', description: '최근 7일 러닝의 평균 심박' }
]

/** 섹션 영역. 빼고 다시 붙일 수 있지만 자리는 고정이다(전폭 섹션끼리 섞으면 읽는 흐름이 깨진다). */
export const SUMMARY_SECTION_BLOCKS: SummaryBlock[] = [
  { id: 'goal', label: '활성 목표', description: '지금 잡아둔 목표와 예상 기록' },
  { id: 'injury', label: '부상 기준', description: '관리 중인 부상 항목과 코칭 제한' },
  { id: 'fatigue', label: '피로 경고', description: '볼륨이 급하게 늘었는지' },
  { id: 'recent', label: '최근 세션', description: '가장 최근 러닝 5개' }
]

/**
 * 아무것도 편집하지 않은 사용자가 보는 기본 숨김 목록(2026-09-04 사용자 결정).
 * 요약을 "지금 뭘 할지"로 좁히는 중이라 나머지는 필요할 때 켜서 쓴다.
 */
export const SUMMARY_DEFAULT_HIDDEN: SummaryBlockId[] = ['hard', 'avgHr', 'goal', 'injury']

/** id → 블록 정의(카드·섹션 통합). 라벨·설명을 화면마다 다시 쓰지 않는다. */
export const SUMMARY_BLOCK_BY_ID: Record<string, SummaryBlock> = Object.fromEntries(
  [...SUMMARY_CARD_BLOCKS, ...SUMMARY_SECTION_BLOCKS].map((block) => [block.id, block])
)

const CARD_IDS = SUMMARY_CARD_BLOCKS.map((block) => block.id)

/**
 * 저장된 순서를 실제 카드 목록에 입힌다. 목록에 없는 id(새로 만든 카드, 나중에 추가될 기본 카드)는
 * **뒤에 기본 순서로** 붙는다 — 저장된 순서가 화면을 통제하되, 모르는 것을 지우지는 않는다.
 */
export function orderSummaryCards(customCardIds: string[], savedOrder: string[]): string[] {
  const all = [...CARD_IDS, ...customCardIds]
  const rank = new Map(savedOrder.map((id, index) => [id, index]))
  return all
    .map((id, index) => ({ id, index, rank: rank.get(id) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.id)
}

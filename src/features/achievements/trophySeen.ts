import type { TrophyCardItem } from './trophyCatalog'

/**
 * 전리품 카드 NEW 배지 확인(seen) 상태 — 로컬 저장(리디자인 ②, README "NEW 확인 여부만 로컬 저장").
 *
 * - 저장값: 카드 id → 획득 지문(fingerprint) 맵. 지문이 저장값과 다르면(기록 갱신/신규 획득) NEW.
 * - 최초 방문(저장 키 없음)은 조용히 베이스라인만 깔고 NEW 를 켜지 않는다
 *   (기존 사용자의 과거 업적 전체가 NEW 로 폭발하는 오탐 방지 — HealthKit 옵저버 초기콜백 교훈과 동형).
 */

const SEEN_KEY = 'runcontext.achievements.seen'

export type TrophySeenMap = Record<string, string>

/** 저장된 seen 맵. 없거나 손상이면 null(=최초 방문 취급). */
export function loadTrophySeen(): TrophySeenMap | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const map: TrophySeenMap = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') map[k] = v
    return map
  } catch {
    return null
  }
}

export function saveTrophySeen(map: TrophySeenMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map))
  } catch {
    /* 저장 실패는 NEW 재노출로만 이어짐 — 무시 */
  }
}

/**
 * 카탈로그(훈련+레이싱 합본)와 저장 seen 을 대조해 NEW 카드 id 집합과 다음 저장본을 만든다.
 * 순수 함수 — 저장 io 는 호출부가 load/save 로 감싼다.
 */
export function reconcileTrophySeen(
  cards: TrophyCardItem[],
  seen: TrophySeenMap | null
): { newIds: Set<string>; nextSeen: TrophySeenMap } {
  const nextSeen: TrophySeenMap = {}
  const newIds = new Set<string>()
  for (const card of cards) {
    if (!card.earned || !card.fingerprint) continue
    nextSeen[card.id] = card.fingerprint
    if (seen !== null && seen[card.id] !== card.fingerprint) newIds.add(card.id)
  }
  return { newIds, nextSeen }
}

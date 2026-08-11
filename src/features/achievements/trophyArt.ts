import type { TrophyCardItem } from './trophyCatalog'
import artPb5k from '@/assets/achievements/card-art/art-pb-5k.webp'
import artPb10k from '@/assets/achievements/card-art/art-pb-10k.webp'
import artPbHalf from '@/assets/achievements/card-art/art-pb-half.webp'
import artFirst10k from '@/assets/achievements/card-art/art-first-10k.webp'
import artFirstFull from '@/assets/achievements/card-art/art-first-full.webp'
import artStreak from '@/assets/achievements/card-art/art-streak-7.webp'
import artVolumeWeekly from '@/assets/achievements/card-art/art-volume-weekly.webp'
import artVolumeMonthly from '@/assets/achievements/card-art/art-volume-monthly.webp'
import artVolume100km from '@/assets/achievements/card-art/art-volume-100km.webp'

/**
 * 전리품 카드 아트 매핑 (디자인 핸드오프 `card-art/`).
 *
 * ⚠️ **아트는 종류별이 아니라 카드별이다.** 트로피 컵에 "10K", 개선문에 "42.195" 처럼 **수치가 각인**돼
 * 있어서 다른 카드에 돌려 쓰면 틀린 카드가 된다(5K 카드에 10K 각인이 뜨는 식). 그래서 매핑은 카드 id
 * 단위이고, 아트가 없는 카드는 **픽토그램으로 폴백**한다 — 비슷한 아트를 억지로 붙이지 않는다.
 *
 * 반대로 스트릭·주간·월간 아트에는 숫자가 없다(불꽃/막대그래프/캘린더). 이 세 카드의 값은 사용자마다
 * 계속 바뀌므로(현재 계정 7일·49.9km·197.9km) 숫자 없는 아트만 안전하다.
 *
 * 원본은 384px PNG(장당 110~235KB, 12장 1.5MB)였다. 256px WebP 로 변환해 **9장 128KB**로 줄였다 —
 * 앱 오픈 전송량을 4.7MB→208KB 로 줄인 직후라 원본 그대로 넣으면 그 성과를 되돌린다.
 *
 * 아직 없는 아트 5종(요청됨): 풀 자기기록 · 첫 5K · 첫 하프 · 누적 500km · 누적 1000km.
 */
/**
 * 거리별 아트 — PB·마일스톤 카드 id 는 `pb-<거리m>-<context>` / `ms-<거리m>-<context>` 이고
 * context 는 'training' | 'race' 둘 다 온다(훈련/레이싱 분리 트랙). 아트는 거리로만 갈리므로
 * context 를 떼고 거리로 찾는다 — id 를 통째로 나열하면 context 조합이 두 배가 되고,
 * 실제로 그렇게 적었다가 'racing' 으로 오타 내 PB·마일스톤 8장이 전부 폴백됐다(2026-08-11 실측).
 */
const PB_ART_BY_DISTANCE_M: Record<string, string> = {
  '5000': artPb5k,
  '10000': artPb10k,
  '21097.5': artPbHalf
  // 42195(풀) 아트 미제작 — 요청됨
}

const MILESTONE_ART_BY_DISTANCE_M: Record<string, string> = {
  '10000': artFirst10k,
  '42195': artFirstFull
  // 5000(첫 5K)·21097.5(첫 하프) 아트 미제작 — 요청됨
}

/** 거리와 무관한 카드(값이 변해서 숫자 없는 아트를 쓴다) + 클럽(누적 거리 각인). */
const ART_BY_CARD_ID: Record<string, string> = {
  streak: artStreak,
  'weekly-volume': artVolumeWeekly,
  'monthly-volume': artVolumeMonthly,
  'club-100': artVolume100km
  // club-500 · club-1000 아트 미제작 — 요청됨
}

/** 카드 전용 아트. 없으면 null → 호출부가 픽토그램으로 그린다. */
export function trophyArtFor(card: Pick<TrophyCardItem, 'id'>): string | null {
  const direct = ART_BY_CARD_ID[card.id]
  if (direct) return direct
  const distanceMatch = /^(pb|ms)-([\d.]+)-/.exec(card.id)
  if (!distanceMatch) return null
  const [, kind, distanceM] = distanceMatch
  const table = kind === 'pb' ? PB_ART_BY_DISTANCE_M : MILESTONE_ART_BY_DISTANCE_M
  return table[distanceM] ?? null
}

import type { TrophyCardItem } from './trophyCatalog'
import artPb5k from '@/assets/achievements/card-art/art-pb-5k.webp'
import artPbFull from '@/assets/achievements/card-art/art-pb-full.webp'
import artPb10k from '@/assets/achievements/card-art/art-pb-10k.webp'
import artPbHalf from '@/assets/achievements/card-art/art-pb-half.webp'
import artFirst5k from '@/assets/achievements/card-art/art-first-5k.webp'
import artFirst10k from '@/assets/achievements/card-art/art-first-10k.webp'
import artFirstHalf from '@/assets/achievements/card-art/art-first-half.webp'
import artFirstFull from '@/assets/achievements/card-art/art-first-full.webp'
import artStreak from '@/assets/achievements/card-art/art-streak-7.webp'
import artVolumeWeekly from '@/assets/achievements/card-art/art-volume-weekly.webp'
import artVolumeMonthly from '@/assets/achievements/card-art/art-volume-monthly.webp'
import artVolume100km from '@/assets/achievements/card-art/art-volume-100km.webp'
import artVolume500km from '@/assets/achievements/card-art/art-volume-500km.webp'
import artVolume1000km from '@/assets/achievements/card-art/art-volume-1000km.webp'

/**
 * 전리품 카드 아트 매핑 (디자인 핸드오프 `card-art/`).
 *
 * ⚠️ **아트는 종류별이 아니라 카드별이다.** 트로피 컵에 "10K", 개선문에 "42.195" 처럼 **수치가 각인**돼
 * 있어서 다른 카드에 돌려 쓰면 틀린 카드가 된다(5K 카드에 10K 각인이 뜨는 식). 그래서 매핑은 카드 id
 * 단위이고, 아트가 없는 카드는 **픽토그램으로 폴백**한다 — 비슷한 아트를 억지로 붙이지 않는다.
 *
 * **14장 전원 아트 보유(2026-08-11 2차 핸드오프).** 폴백 경로는 유지한다 — 카드가 늘어나면(스트릭
 * 14일/30일 등) 아트가 도착하기 전까지 그 카드만 픽토그램으로 뜨고 나머지는 멀쩡해야 한다.
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
 * 크기: 384² WebP (합계 438KB, 장당 16~51KB).
 *
 * 256² 도 함께 받았지만(합계 233KB) 쓰지 않는다 — 엠블럼이 아트창의 66%라 iPhone 2열 그리드에서
 * CSS 약 132px 이고, 3배 디스플레이에선 396 device px 를 요구한다. 256² 면 그 지점에서 뭉개진다.
 * 아트가 이 화면의 상품 가치 자체라 여기선 선명도를 택했다 — 업적 화면을 열 때만, `loading="lazy"`
 * 로 화면에 들어온 카드만 받으므로 앱 첫 진입 전송량과는 무관하다.
 *
 * 거리별 아트 — PB·마일스톤 카드 id 는 `pb-<거리m>-<context>` / `ms-<거리m>-<context>` 이고
 * context 는 'training' | 'race' 둘 다 온다(훈련/레이싱 분리 트랙). 아트는 거리로만 갈리므로
 * context 를 떼고 거리로 찾는다 — id 를 통째로 나열하면 context 조합이 두 배가 되고,
 * 실제로 그렇게 적었다가 'racing' 으로 오타 내 PB·마일스톤 8장이 전부 폴백됐다(2026-08-11 실측).
 */
const PB_ART_BY_DISTANCE_M: Record<string, string> = {
  '5000': artPb5k,
  '10000': artPb10k,
  '21097.5': artPbHalf,
  '42195': artPbFull
}

const MILESTONE_ART_BY_DISTANCE_M: Record<string, string> = {
  '5000': artFirst5k,
  '10000': artFirst10k,
  '21097.5': artFirstHalf,
  '42195': artFirstFull
}

/** 거리와 무관한 카드(값이 변해서 숫자 없는 아트를 쓴다) + 클럽(누적 거리 각인). */
const ART_BY_CARD_ID: Record<string, string> = {
  streak: artStreak,
  'weekly-volume': artVolumeWeekly,
  'monthly-volume': artVolumeMonthly,
  'club-100': artVolume100km,
  'club-500': artVolume500km,
  'club-1000': artVolume1000km
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

/**
 * 브리핑 쇼츠 아래쪽(#898) — 쇼츠 화면의 프로필 줄·설명·해시태그를 우리 데이터로 채운다(사용자 요청 2026-11-05).
 * 전부 요약 탭이 넘긴 값(TodayBriefingPayload)에서만 만든다 — 팝업이 따로 계산하지 않는다(두 번째 진실 금지).
 */
import type { TodayBriefingPayload } from '@/app/stores/briefingShortsStore'

export type ShortsMeta = {
  /** 프로필 옆 알약(쇼츠 '구독' 자리): 대회 D-day. 날짜 있는 목표가 없거나 지났으면 '' */
  dDay: string
  /** 설명 첫 줄: 거리 · 페이스(또는 시간) */
  caption: string
  /** 해시태그: 오늘 훈련 이름 · 목표 이름(띄어쓰기 없이) */
  tags: string[]
}

const DAY_MS = 86_400_000

export function buildShortsMeta(payload: Pick<TodayBriefingPayload, 'date' | 'title' | 'distanceKm' | 'metaLine' | 'goal'>): ShortsMeta {
  const { goal } = payload
  let dDay = ''
  if (goal?.targetDate) {
    const days = Math.round((Date.parse(`${goal.targetDate}T00:00:00`) - Date.parse(`${payload.date}T00:00:00`)) / DAY_MS)
    if (days === 0) dDay = 'D-DAY'
    else if (days > 0) dDay = `D-${days}`
  }
  const caption = [payload.distanceKm ? `${payload.distanceKm}km` : '', payload.metaLine].filter(Boolean).join(' · ')
  const tag = (text: string) => `#${text.replace(/[\s#]+/g, '')}`
  const tags = [payload.title, goal?.title ?? ''].filter((t) => t.trim()).map(tag)
  return { dDay, caption, tags: [...new Set(tags)] }
}

/**
 * 온보딩 "기록 가져오기" 단계의 판정(#870) — 저장 전에 HealthKit 러닝 후보를 요약하고, 온보딩 답을 미리 채운다.
 *
 * 왜 저장 전인가: 예전엔 로그인 직후 묻지 않고 최근 90일을 전부 가져왔다. "완전 초보"라고 답한 사람에게도
 * 기록이 먼저 들어와 플랜이 기록 기준으로 지어졌고, 권한 창을 늦게 누르면 반대로 초보 플랜이 굳었다.
 * 이제는 개수와 모양을 먼저 보여주고, 사용자가 고른 뒤 온보딩 마지막에 한 번 저장한다.
 */
import type { HealthKitRunCandidate } from './healthKitBridge'
import { distanceClassFromMeters, type DistanceClassKey } from '@/shared/lib/level/levelModel'

/** 온보딩이 조회하는 기간 — 자동 동기화 기본값과 같다. */
export const ONBOARDING_LOOKBACK_DAYS = 90
const RECENT_DAYS = 28
const DAY_MS = 86_400_000

export type HealthKitPreviewSummary = {
  count: number
  firstDate: string | null
  lastDate: string | null
  longestKm: number
  longestDate: string | null
  /** 최근 4주 평균(주당). 4주 안에 기록이 없으면 0. */
  recentKmPerWeek: number
  recentRunsPerWeek: number
  daysSinceLast: number | null
}

function dayIndex(date: string): number {
  return Math.floor(new Date(`${date.slice(0, 10)}T00:00:00`).getTime() / DAY_MS)
}

export function summarizeHealthKitPreview(candidates: HealthKitRunCandidate[], today: string): HealthKitPreviewSummary {
  const dated = candidates.filter((c) => c.date)
  const dates = dated.map((c) => c.date).sort()
  const longest = dated.reduce<HealthKitRunCandidate | null>((best, c) => ((c.distanceKm ?? 0) > (best?.distanceKm ?? 0) ? c : best), null)
  const todayIdx = dayIndex(today)
  const recent = dated.filter((c) => todayIdx - dayIndex(c.date) < RECENT_DAYS && dayIndex(c.date) <= todayIdx)
  const recentKm = recent.reduce((sum, c) => sum + (c.distanceKm ?? 0), 0)
  const lastDate = dates.length ? dates[dates.length - 1] : null
  return {
    count: dated.length,
    firstDate: dates[0] ?? null,
    lastDate,
    longestKm: Math.round((longest?.distanceKm ?? 0) * 10) / 10,
    longestDate: longest?.date ?? null,
    recentKmPerWeek: Math.round((recentKm / (RECENT_DAYS / 7)) * 10) / 10,
    recentRunsPerWeek: Math.round((recent.length / (RECENT_DAYS / 7)) * 10) / 10,
    daysSinceLast: lastDate ? todayIdx - dayIndex(lastDate) : null
  }
}

/** 기록상 완주 거리 — 온보딩 "완주해본 가장 긴 거리"와 같은 키(레벨 거리 클래스와 같은 기준). */
export function distanceKeyFromLongestKm(km: number): DistanceClassKey {
  return distanceClassFromMeters(km * 1000).key
}

const DISTANCE_ORDER: DistanceClassKey[] = ['pre', '5k', '10k', 'half', 'full']

/** 고른 답이 기록보다 낮은가 — "기록을 보니 이미 Xkm를 뛰셨어요"를 띄울 조건. */
export function answerBelowRecord(answer: DistanceClassKey, record: DistanceClassKey): boolean {
  return DISTANCE_ORDER.indexOf(answer) < DISTANCE_ORDER.indexOf(record)
}

/**
 * 주간 러닝 목표 미리 채우기 — 최근 4주 평균 횟수(반올림, 3~7). 4주 안에 기록이 없으면 null.
 * 하한 3 = 플랜의 주 3회 하한(SSOT §시작점 앵커링 #861, Higdon Novice) — 주 1회 뛰던 사람의 *목표*를 1회로 채우지 않는다.
 */
export function weeklyDaysFromPreview(summary: HealthKitPreviewSummary): number | null {
  if (summary.recentRunsPerWeek <= 0) return null
  return Math.min(7, Math.max(3, Math.round(summary.recentRunsPerWeek)))
}

/** "오늘부터 뛴 것만" 기준일 이전 후보를 뺀다. 기준일이 없으면 그대로. */
export function filterFromImportDate<T extends { date: string }>(candidates: T[], importFrom: string | null): T[] {
  if (!importFrom) return candidates
  return candidates.filter((c) => c.date >= importFrom)
}

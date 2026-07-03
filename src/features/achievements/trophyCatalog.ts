import type { RunLog } from '@/entities/run/model'
import { DISTANCE_MILESTONES_M, type AchievementContext, type AchievementSet } from '@/shared/lib/achievement/achievements'
import { formatDuration } from '@/shared/lib/format'

/**
 * 전리품(트로피) 카드 카탈로그 — 리디자인 ② (design_handoff README §8 발급 규칙).
 *
 * 발급 규칙(확정): 거리별 PB(캐노니컬 5K/10K/하프/풀)=골드 · 첫 마일스톤=골드 ·
 * 스트릭/주·월 최고=실버 · 누적 거리 클럽(100/500/1000km)=브론즈.
 * - PB·마일스톤은 훈련/레이싱 컨텍스트 분리(achievements.ts 사다리 그대로),
 *   꾸준함(실버)·클럽(브론즈)은 전체 통합 — 컨텍스트 토글과 무관하게 항상 포함한다.
 * - PB 카드는 5km 버킷 전체가 아니라 캐노니컬 4거리만 카드화한다(버킷 사다리는 레이싱 타겟 전용).
 * - 실버(기록 보유형)는 낮은 문턱으로 열리는 대신 "갱신"이 NEW 배지로 재점화되는 게 훅이다.
 * - 기록(최장 거리·시간·최속 페이스)은 카드가 아니라 업적 홈 정보 섹션이다(발급 규칙 4종에 없음).
 */

export type TrophyTier = 'gold' | 'silver' | 'bronze'
export type TrophyKind = 'pb' | 'milestone' | 'streak' | 'weekly' | 'monthly' | 'club'

export type TrophyProgress = {
  current: number
  target: number
  /** 예: '18.2 / 42.2km' */
  valueText: string
  label: string
}

export type TrophyCardItem = {
  id: string
  tier: TrophyTier
  kind: TrophyKind
  /** 'context'=훈련/레이싱 분리 트랙, 'global'=전체 통합(꾸준함·클럽). */
  scope: 'context' | 'global'
  title: string
  /** 우상단 배지(예: 'PR' + '10K'). prefix 없으면 빈 문자열. */
  badgePrefix: string
  badgeValue: string
  earned: boolean
  /** 획득 카드의 대표 값(예: '49:12', '14일', '48.6km'). */
  valueText: string | null
  statLabel: string | null
  description: string
  achievedAt: string | null
  /** 미획득 카드 진행 상태(진행 개념이 없으면 null). */
  progress: TrophyProgress | null
  /** NEW 판정 지문 — 획득 카드만. 값이 바뀌면(기록 갱신) NEW 재점화. */
  fingerprint: string | null
}

/** 업적 PB 그리드·PB/마일스톤 카드의 캐노니컬 거리(m) = 마일스톤 거리와 동일. */
export const CANONICAL_DISTANCES_M = DISTANCE_MILESTONES_M

export const CLUB_TARGETS_KM = [100, 500, 1000] as const

/** 스트릭 카드 획득 문턱 — '연속'의 정의상 최소 2일. */
const STREAK_EARN_DAYS = 2

export function distanceLabel(distanceM: number): string {
  if (distanceM === 21097.5) return '하프'
  if (distanceM === 42195) return '풀'
  return `${Math.round(distanceM / 1000)}K`
}

function distanceKmText(distanceM: number): string {
  return `${trimKm(distanceM / 1000)}km`
}

/** 소수 1자리, 정수면 소수점 제거 (18.2 / 5 / 42.2). */
function trimKm(km: number): string {
  const rounded = Math.round(km * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function dateOnly(at: string | null | undefined): string | null {
  const d = (at ?? '').slice(0, 10)
  return d.length === 10 ? d : null
}

/** 전체(훈련+레이싱) 평생 누적 거리(km). */
export function computeLifetimeDistanceKm(runs: RunLog[]): number {
  let total = 0
  for (const run of runs) {
    if (run.distanceKm != null && Number.isFinite(run.distanceKm) && run.distanceKm > 0) total += run.distanceKm
  }
  return Math.round(total * 100) / 100
}

/** 누적 km 가 target 을 처음 넘은 런의 시각(정렬: date→startAt→id 결정적). 미도달이면 null. */
function clubAchievedAt(runs: RunLog[], targetKm: number): string | null {
  const sorted = [...runs].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startAt ?? '').localeCompare(b.startAt ?? '') || a.id.localeCompare(b.id)
  )
  let cum = 0
  for (const run of sorted) {
    if (run.distanceKm == null || !Number.isFinite(run.distanceKm) || run.distanceKm <= 0) continue
    cum += run.distanceKm
    if (cum >= targetKm) return run.startAt ?? run.date
  }
  return null
}

/**
 * 컨텍스트별 트로피 카탈로그를 결정적으로 산출한다.
 * NEW 배지는 여기서 판정하지 않는다(뷰가 trophySeen 지문 대조로 결정).
 * 순서: 골드(PB 4 → 마일스톤 4) → 실버(스트릭·주·월) → 브론즈(클럽 3).
 */
export function buildTrophyCatalog(set: AchievementSet, runs: RunLog[], context: AchievementContext): TrophyCardItem[] {
  const cards: TrophyCardItem[] = []
  const pbAt = new Map(set.distancePbs.filter((p) => p.context === context).map((p) => [p.distanceM, p]))
  const msAt = new Map(set.firstMilestones.filter((m) => m.context === context).map((m) => [m.distanceM, m]))
  const longestKm = set.longestDistance.find((r) => r.context === context)?.distanceKm ?? 0

  const distanceProgress = (targetM: number): TrophyProgress => ({
    current: longestKm,
    target: targetM / 1000,
    valueText: `${trimKm(longestKm)} / ${trimKm(targetM / 1000)}km`,
    label: '최장 거리'
  })

  for (const d of CANONICAL_DISTANCES_M) {
    const label = distanceLabel(d)
    const pb = pbAt.get(d)
    cards.push({
      id: `pb-${d}-${context}`,
      tier: 'gold',
      kind: 'pb',
      scope: 'context',
      title: `${label} 자기기록`,
      badgePrefix: 'PR',
      badgeValue: label,
      earned: !!pb,
      valueText: pb ? formatDuration(Math.round(pb.elapsedSec)) : null,
      statLabel: pb ? '신기록 달성' : null,
      description: pb
        ? `출발부터 ${label} 거리까지 도달한 최고 기록.`
        : `${label} 거리를 완주하면 골드 카드가 열립니다.`,
      achievedAt: pb ? dateOnly(pb.achievedAt) : null,
      progress: pb ? null : distanceProgress(d),
      fingerprint: pb ? `${Math.round(pb.elapsedSec)}@${pb.achievedAt}` : null
    })
  }

  for (const d of CANONICAL_DISTANCES_M) {
    const label = distanceLabel(d)
    const ms = msAt.get(d)
    cards.push({
      id: `ms-${d}-${context}`,
      tier: 'gold',
      kind: 'milestone',
      scope: 'context',
      title: `첫 ${label} 완주`,
      badgePrefix: '첫',
      badgeValue: label,
      earned: !!ms,
      valueText: ms ? distanceKmText(d) : null,
      statLabel: ms ? '완주 달성' : null,
      description: ms
        ? `처음으로 ${label} 거리를 완주했습니다.`
        : `${label} 거리를 완주하면 골드 카드가 열립니다.`,
      achievedAt: ms ? dateOnly(ms.achievedAt) : null,
      progress: ms ? null : distanceProgress(d),
      fingerprint: ms ? ms.achievedAt : null
    })
  }

  const streak = set.cumulative.longestStreak
  const streakEarned = !!streak && streak.days >= STREAK_EARN_DAYS
  cards.push({
    id: 'streak',
    tier: 'silver',
    kind: 'streak',
    scope: 'global',
    title: '연속 러닝 스트릭',
    badgePrefix: '',
    badgeValue: streakEarned ? `${streak!.days}일` : '스트릭',
    earned: streakEarned,
    valueText: streakEarned ? `${streak!.days}일` : null,
    statLabel: streakEarned ? `${streak!.days}일 무결` : null,
    description: streakEarned
      ? `${streak!.days}일 연속 하루도 거르지 않고 달렸어요.`
      : '이틀 연속 달리면 실버 카드가 열립니다.',
    achievedAt: streakEarned ? dateOnly(streak!.end) : null,
    progress: streakEarned
      ? null
      : { current: streak?.days ?? 0, target: STREAK_EARN_DAYS, valueText: `${streak?.days ?? 0} / ${STREAK_EARN_DAYS}일`, label: '연속 일수' },
    fingerprint: streakEarned ? `${streak!.days}` : null
  })

  const weekly = set.cumulative.bestWeeklyVolume
  const weeklyEarned = !!weekly && weekly.distanceKm > 0
  cards.push({
    id: 'weekly-volume',
    tier: 'silver',
    kind: 'weekly',
    scope: 'global',
    title: '주간 최다 거리',
    badgePrefix: '주',
    badgeValue: weeklyEarned ? `${trimKm(weekly!.distanceKm)}km` : '최고',
    earned: weeklyEarned,
    valueText: weeklyEarned ? `${trimKm(weekly!.distanceKm)}km` : null,
    statLabel: weeklyEarned ? '주간 최다 갱신' : null,
    description: weeklyEarned
      ? `한 주에 ${trimKm(weekly!.distanceKm)}km — 최고 기록 주간.`
      : '첫 러닝을 기록하면 실버 카드가 열립니다.',
    achievedAt: weeklyEarned ? weekly!.periodStart : null,
    progress: null,
    fingerprint: weeklyEarned ? `${weekly!.distanceKm}@${weekly!.periodStart}` : null
  })

  const monthly = set.cumulative.bestMonthlyVolume
  const monthlyEarned = !!monthly && monthly.distanceKm > 0
  cards.push({
    id: 'monthly-volume',
    tier: 'silver',
    kind: 'monthly',
    scope: 'global',
    title: '월간 최다 거리',
    badgePrefix: '월',
    badgeValue: monthlyEarned ? `${trimKm(monthly!.distanceKm)}km` : '최고',
    earned: monthlyEarned,
    valueText: monthlyEarned ? `${trimKm(monthly!.distanceKm)}km` : null,
    statLabel: monthlyEarned ? '월간 최다 갱신' : null,
    description: monthlyEarned
      ? `한 달에 ${trimKm(monthly!.distanceKm)}km — 최고 기록 월간.`
      : '첫 러닝을 기록하면 실버 카드가 열립니다.',
    achievedAt: monthlyEarned ? monthly!.periodStart : null,
    progress: null,
    fingerprint: monthlyEarned ? `${monthly!.distanceKm}@${monthly!.periodStart}` : null
  })

  const lifetimeKm = computeLifetimeDistanceKm(runs)
  for (const target of CLUB_TARGETS_KM) {
    const earned = lifetimeKm >= target
    const achievedAt = earned ? clubAchievedAt(runs, target) : null
    cards.push({
      id: `club-${target}`,
      tier: 'bronze',
      kind: 'club',
      scope: 'global',
      title: `누적 ${target}km 클럽`,
      badgePrefix: '누적',
      badgeValue: `${target}km`,
      earned,
      valueText: earned ? `${target}km` : null,
      statLabel: earned ? '클럽 가입' : null,
      description: earned
        ? `평생 누적 ${trimKm(lifetimeKm)}km — ${target}km 클럽 멤버.`
        : `누적 ${target}km를 달리면 브론즈 카드가 열립니다.`,
      achievedAt: dateOnly(achievedAt),
      progress: earned
        ? null
        : { current: lifetimeKm, target, valueText: `${trimKm(lifetimeKm)} / ${target}km`, label: '누적 거리' },
      fingerprint: earned ? (achievedAt ?? 'joined') : null
    })
  }

  return cards
}

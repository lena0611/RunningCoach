import { assessGoalFeasibility, type GoalFeasibilityInput } from './periodizedSchedule'
import { earliestFeasibleRaceDate, type RaceDateOption } from './raceDate'

/**
 * 목표 다시 정하기(#889) — 부상·휴식으로 대회가 빠듯할 때 고를 수 있는 길과 그 날짜.
 *
 * 판정은 온보딩·코치 무리 카드와 **같은 `assessGoalFeasibility`** 다(온보딩이 괜찮다고 한 날을 코치가 무리라고 하면
 * 안 된다). 다만 계산 시작일은 **휴식이 끝난 다음 날**이다 — 쉬는 동안은 늘릴 수 없으니 오늘부터 세면 날짜가
 * 실제보다 이르게 나온다.
 */

/** 휴식 중 '목표 다시 정하기'를 건네는 범위 — 대회가 8주 안일 때만(그보다 멀면 휴식 뒤 플랜이 흡수한다). */
export const GOAL_ADJUST_REST_WINDOW_DAYS = 56
/**
 * 내려놓은 목표를 다시 묻는 시점 — 부상이 해소됐거나, 마지막으로 아픈 날에서 2주가 지났을 때.
 * 설계값이다(검증된 단일 권위 수치 없음) — 다시 '정하자고 묻는' 신호일 뿐 복귀 허가가 아니고, 복귀 강도는 복귀 램프·walk-run 이 맡는다.
 */
export const GOAL_RESUME_PAIN_FREE_DAYS = 14

/** 대회 거리 사다리(긴 것부터) — '거리 낮추기'는 한 칸 아래로. */
const RACE_DISTANCES_KM = [42.195, 21.0975, 10, 5]

export type GoalAdjustInput = Omit<GoalFeasibilityInput, 'today'> & {
  today: Date
  /** 선언한 휴식의 마지막 날(YYYY-MM-DD). 지났거나 없으면 오늘부터 센다. */
  restUntil: string | null
}

export type GoalAdjustOptions = {
  /** 계산 시작일(YYYY-MM-DD) — 휴식 다음 날 또는 오늘. */
  startDate: string
  /** 지금 날짜·거리 그대로도 안전한가. */
  feasibleNow: boolean
  /** 안전하게 닿는 가장 이른 대회일(같은 거리). 지금 날짜가 이미 안전하면 null. */
  postpone: RaceDateOption | null
  /** 한 칸 짧은 거리와 그 거리로 닿는 날(지금 날짜에 되면 지금 날짜). 더 짧은 거리가 없거나 1년 안에 안 되면 null. */
  shorter: (RaceDateOption & { distanceKm: number }) | null
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 계산 시작일 — 휴식이 아직 안 끝났으면 휴식 다음 날. */
export function goalAdjustStartDate(today: Date, restUntil: string | null): Date {
  const todayIso = isoOf(today)
  if (!restUntil || restUntil < todayIso) return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const next = new Date(`${restUntil}T12:00:00`)
  next.setDate(next.getDate() + 1)
  return next
}

export function goalAdjustOptions(input: GoalAdjustInput): GoalAdjustOptions {
  const start = goalAdjustStartDate(input.today, input.restUntil)
  const base = { ...input, today: start }
  const feasibleNow = assessGoalFeasibility(base).feasible
  const postpone = feasibleNow ? null : earliestFeasibleRaceDate(base)

  const shorterKm = RACE_DISTANCES_KM.find((km) => km < (input.goal.distanceKm ?? 0) - 0.01) ?? null
  let shorter: GoalAdjustOptions['shorter'] = null
  if (shorterKm !== null) {
    const goal = { ...input.goal, distanceKm: shorterKm, targetDurationSec: null }
    const sameDay = input.goal.targetDate && assessGoalFeasibility({ ...base, goal }).feasible
    const earliest = sameDay ? null : earliestFeasibleRaceDate({ ...base, goal })
    if (sameDay && input.goal.targetDate) {
      const days = Math.round((new Date(`${input.goal.targetDate}T12:00:00`).getTime() - start.getTime()) / 86_400_000)
      shorter = { distanceKm: shorterKm, date: input.goal.targetDate, weeks: Math.floor(days / 7) }
    } else if (earliest) {
      shorter = { distanceKm: shorterKm, ...earliest }
    }
  }

  return { startDate: isoOf(start), feasibleNow, postpone, shorter }
}

/** 고른 날짜가 안전한가(직접 고르기 경고용). */
export function isGoalDateFeasible(input: GoalAdjustInput, targetDate: string): boolean {
  const start = goalAdjustStartDate(input.today, input.restUntil)
  return assessGoalFeasibility({ ...input, today: start, goal: { ...input.goal, targetDate } }).feasible
}

/** 화면용 거리 이름 — 5K·10K·하프·풀. */
export function raceDistanceLabel(distanceKm: number | null): string {
  if (!distanceKm) return ''
  if (distanceKm > 40) return '풀'
  if (distanceKm > 20) return '하프'
  return `${Math.round(distanceKm)}K`
}

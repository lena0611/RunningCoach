/**
 * 대회일 추천 (#878 B5, 온보딩 목표 단계) — 날짜가 아직 없을 때의 기본 준비 기간과, 고른 날짜가 무리일 때 미룰 날짜.
 *
 * 무리 판정은 코치 경고(goal-feasibility 모먼트)와 **같은 `assessGoalFeasibility`** 를 쓴다 — 온보딩이 괜찮다고 잡아 준
 * 날짜를 다음 날 코치가 무리라고 하면 안 된다. 날짜가 없는 대회 목표는 플랜이 안 지어지므로(주기화는 목표일이 필요)
 * 비워 두지 않고 추천 날짜로 채운다.
 */
import { assessGoalFeasibility, type GoalFeasibilityInput } from './periodizedSchedule'

const DAY_MS = 86_400_000
/** 이보다 먼 날짜는 찾지 않는다 — 1년 넘게 걸리는 목표는 미루기보다 거리를 바꾸는 게 맞다. */
const MAX_SEARCH_WEEKS = 52

/**
 * 대회 날짜가 없을 때의 준비 기간(주) — Higdon Novice 플랜 길이(halhigdon.com): 5K·10K 8주, 하프 Novice 1 12주,
 * 풀 Novice 1 18주. 입문(5K 미완주)은 NHS Couch to 5K 9주가 먼저다 — 5K 는 그 9주가 곧 준비이고(연속 30분 ≈ 5K),
 * 더 긴 거리는 9주를 앞에 더한다.
 */
export function defaultRaceWeeks(distanceKm: number, entryLevel: boolean): number {
  const novice = distanceKm > 25 ? 18 : distanceKm > 12 ? 12 : 8
  if (!entryLevel) return novice
  return distanceKm <= 5 ? 9 : 9 + novice
}

export type RaceDateOption = {
  /** YYYY-MM-DD, 일요일. */
  date: string
  /** 오늘부터 몇 주 뒤인가(내림 — 일요일로 맞추며 며칠 늘어난 걸 한 주로 치지 않는다). */
  weeks: number
}

/** 그날 또는 그 뒤 첫 일요일 — 대회는 대개 일요일이다. */
function sundayOnOrAfter(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + ((7 - out.getDay()) % 7))
  return out
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + days)
  return out
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toOption(today: Date, date: Date): RaceDateOption {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((date.getTime() - start.getTime()) / DAY_MS)
  return { date: formatDateOnly(date), weeks: Math.floor(days / 7) }
}

/** 지금 체력에서 안전한 증가 폭으로 닿는 가장 이른 대회일(일요일). 1년 안에 없으면 null. */
export function earliestFeasibleRaceDate(input: GoalFeasibilityInput): RaceDateOption | null {
  for (let week = 1; week <= MAX_SEARCH_WEEKS; week++) {
    const date = sundayOnOrAfter(addDays(input.today, week * 7))
    const goal = { ...input.goal, targetDate: formatDateOnly(date) }
    if (assessGoalFeasibility({ ...input, goal }).feasible) return toOption(input.today, date)
  }
  return null
}

/**
 * 날짜가 없을 때 추천하는 대회일 — 기본 준비 기간 뒤 첫 일요일. 지금 주행량으로는 그보다 오래 걸리면 안전하게 닿는 날.
 * `extended` = 기본 길이보다 늦췄다(화면이 이유를 다르게 말한다).
 */
export function recommendedRaceDate(input: GoalFeasibilityInput, entryLevel: boolean): RaceDateOption & { extended: boolean } {
  const byLength = toOption(input.today, sundayOnOrAfter(addDays(input.today, defaultRaceWeeks(input.goal.distanceKm ?? 0, entryLevel) * 7)))
  const feasible = earliestFeasibleRaceDate(input)
  return feasible && feasible.date > byLength.date ? { ...feasible, extended: true } : { ...byLength, extended: false }
}

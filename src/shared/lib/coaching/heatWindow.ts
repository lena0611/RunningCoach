import { HEAT_CONFOUND_FELT_C } from '@/shared/lib/coaching/weatherStress'
import { feltTemperatureC } from '@/shared/lib/runningWeather'

/**
 * 하루 중 **언제 뛰느냐**로 조건을 읽는다(#729).
 *
 * "오늘 체감 31도" 한 줄은 사실 아무에게도 안 맞는 숫자다 — 그건 조회한 순간의 값이고,
 * 혹서기 하루는 아침 26도에서 오후 34도까지 벌어진다. 아침 러너에겐 겁을 주고 한낮
 * 러너에겐 방심을 시킨다. 시간별 예보가 이미 들어와 있는데 쓰지 않고 있었다.
 *
 * ⚠️ 임계는 발명하지 않는다 — `HEAT_CONFOUND_FELT_C`(28℃)를 사후 채점과 **같은 값으로** 쓴다.
 * SSOT §외부 조건 "브리핑에서 말한 조건과 사후 채점이 같은 값을 봐야 한다"(앞에서 "더우니
 * 숫자보다 숨으로 보세요" 해놓고 뒤에서 드리프트로 깎으면 신뢰가 거기서 무너진다).
 *
 * ⚠️ 이 판정은 **상대 비교**다. 체감온도는 일사(직사광선)를 포함하지 않아 한낮을 과소평가하므로
 * ("이 시간이면 안전하다"는 보증 금지 — `runningWeather.ts` 주석) "저 시간보다 낫다"까지만 말한다.
 * 안전 판정은 증상 기반 중단 규칙이 담당한다.
 *
 * #397 경계: 신규 모듈이라 entities 를 import 하지 않는다 — 구조적 타입으로만 받는다.
 */

/** 러닝을 권할 만한 시간대(시). 새벽 4시·자정을 "더 나은 창"으로 제안하지 않기 위한 현실 가드. */
const RUNNABLE_HOURS = { start: 5, end: 21 } as const
/** 시간대를 옮길 만하다고 말할 최소 체감온도 차이(℃). 이보다 작으면 옮겨봐야 체감이 안 달라진다. */
const MEANINGFUL_DROP_C = 3
/** 습관 시간대로 인정할 최소 표본 수와 점유율 — 근거가 얇으면 추측하지 않고 null 을 낸다. */
const HABIT_MIN_SAMPLES = 3
const HABIT_MIN_SHARE = 0.3

export type HeatHourPoint = {
  /** ISO 시각. */
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  humidity?: number | null
}

export type HeatWindow = {
  /** 판정 기준 시각(시). */
  hour: number
  feltC: number
  humidity: number | null
  /** 체감이 사후 채점과 같은 더위 임계를 넘었는가. */
  hot: boolean
  /** 의미 있게 서늘한 대안 시간대. 없으면 null. */
  better: { hour: number; feltC: number } | null
  /** 러닝 가능 시간대 전부가 임계 초과 — 시간을 옮겨서 풀 문제가 아니다. */
  allDayHot: boolean
}

/**
 * 러닝 기록의 시작 시각에서 **습관 시간대**를 뽑는다. "언제 뛸지"를 완전히 알 수는 없지만,
 * 이 사람이 보통 몇 시에 뛰는지는 기록에 남아 있다.
 *
 * 최빈 시(hour)를 쓴다 — 아침·저녁 두 봉우리를 가진 러너에게 중앙값을 쓰면 아무도 안 뛰는
 * 한낮이 나온다. 표본이 얇거나 특정 시간대로 쏠리지 않으면 null(추측하지 않는다).
 */
export function deriveHabitualRunHour(runs: { startAt?: string | null }[]): number | null {
  const counts = new Map<number, number>()
  let total = 0
  for (const run of runs) {
    if (!run.startAt) continue
    const hour = new Date(run.startAt).getHours()
    if (!Number.isFinite(hour)) continue
    counts.set(hour, (counts.get(hour) ?? 0) + 1)
    total += 1
  }
  if (total < HABIT_MIN_SAMPLES) return null

  let bestHour: number | null = null
  let bestCount = 0
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      bestHour = hour
      bestCount = count
    }
  }
  if (bestHour === null || bestCount < HABIT_MIN_SAMPLES) return null
  return bestCount / total >= HABIT_MIN_SHARE ? bestHour : null
}

/**
 * 대상 시각의 조건을 읽고, 더 나은 시간대가 있는지 같은 날 안에서 찾는다.
 *
 * `fromHour` 이후만 후보로 본다 — 이미 지난 시간을 "그때가 나았어요"라고 말하면 조언이 아니다.
 */
export function assessHeatWindow(
  hourly: HeatHourPoint[],
  targetHour: number,
  fromHour: number
): HeatWindow | null {
  const byHour = new Map<number, { feltC: number; humidity: number | null }>()
  for (const point of hourly) {
    const hour = new Date(point.time).getHours()
    if (!Number.isFinite(hour) || byHour.has(hour)) continue
    const humidity = point.humidity ?? null
    const felt = point.apparentTemperatureC ?? feltTemperatureC(point.temperatureC, humidity, null)
    if (felt === null) continue
    byHour.set(hour, { feltC: felt, humidity })
  }

  const at = byHour.get(targetHour)
  if (!at) return null

  const searchFrom = Math.max(RUNNABLE_HOURS.start, fromHour)
  let coolest: { hour: number; feltC: number } | null = null
  let anyCool = false
  for (let hour = searchFrom; hour <= RUNNABLE_HOURS.end; hour += 1) {
    const point = byHour.get(hour)
    if (!point) continue
    if (point.feltC < HEAT_CONFOUND_FELT_C) anyCool = true
    if (!coolest || point.feltC < coolest.feltC) coolest = { hour, feltC: point.feltC }
  }

  const better =
    coolest && coolest.hour !== targetHour && coolest.feltC <= at.feltC - MEANINGFUL_DROP_C ? coolest : null
  const hot = at.feltC >= HEAT_CONFOUND_FELT_C
  return {
    hour: targetHour,
    feltC: at.feltC,
    humidity: at.humidity,
    hot,
    better,
    // 남은 시간대에 임계 아래가 하나도 없을 때만 "언제 나가도 덥다"고 말한다.
    allDayHot: hot && !anyCool
  }
}

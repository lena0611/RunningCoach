/**
 * 주간 하드 부하 가드 + 주말 트리아지 순수 로직 (제안훈련 응답, 에픽 #362).
 *
 * - weeklyHardLoadGuard: "더 강하게" 요청에 다는 **주간 하드 부하 소프트 경고**. 막지 않는다(사용자 주권)
 *   — 이번 주 하드/quality 세션이 이미 충분하면 80/20·점진 부하가 흔들릴 수 있음을 부드럽게 알린다.
 *   (running-coaching-standards §훈련 스케줄 모델 "강도 상향 소프트 경고", §시작점 앵커링 ACWR.)
 * - weekEndTriage: 주 마감 임박+백로그가 남은 날 용량 초과일 때, **키 세션 하나를 살리고 나머지는 놓아준다**.
 *   닦달·크래밍 금지(회복은 훈련의 일부). 한 주의 혼잡은 "루틴 변경"(2주+ 반복)이 아니다.
 *
 * 순수 로직 — 영속/표시는 store·UI 가 한다.
 */

import { isHardType, trainingWeekRange, type ScheduledSession } from '@/shared/lib/coaching/periodizedSchedule'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toDateOnly(d: Date): string {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const y = copy.getFullYear()
  const m = String(copy.getMonth() + 1).padStart(2, '0')
  const day = String(copy.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 하드/키로 카운트되는 살아있는 세션(폐기·포기 제외). 완료+계획 모두 그 주의 하드 부하다. */
function isCountedHard(s: ScheduledSession): boolean {
  if (s.status === 'superseded' || s.status === 'skipped' || s.status === 'missed') return false
  return s.keySession || isHardType(s.sessionType)
}

export type HardLoadGuard = {
  hardCount: number
  ceiling: number
  /** 상향이 그 주 하드 상한을 이미 채웠거나 넘기는가(소프트 경고 대상). */
  exceeds: boolean
  /** 경고 문구(exceeds 가 아니면 ''). */
  message: string
}

/**
 * 이번 주(월~일) 하드/quality 세션 수를 세고, 상향(harder)이 상한을 넘는지 본다.
 * `excludeId` = 지금 바꾸려는 세션(이미 하드면 중복 카운트 방지). 상한은 주간 러닝일 기반(quality≤runDays-1, 80/20).
 */
export function weeklyHardLoadGuard(
  sessions: ScheduledSession[],
  today: Date,
  weeklyRunDaysTarget = 4,
  excludeId: string | null = null
): HardLoadGuard {
  const { start, end } = trainingWeekRange(today)
  const hardCount = sessions.filter(
    (s) => s.date >= start && s.date <= end && s.id !== excludeId && isCountedHard(s)
  ).length
  const ceiling = Math.max(1, weeklyRunDaysTarget - 1) // weeklySessionTypes 의 maxQuality 와 동일 개념
  const exceeds = hardCount >= ceiling
  const message = exceeds
    ? `이번 주 강한 세션이 이미 ${hardCount}개예요. 더 강하게는 80/20·회복 흐름을 흔들 수 있어요 — 그래도 진행할까요?`
    : ''
  return { hardCount, ceiling, exceeds, message }
}

export type WeekEndTriage = {
  /** 살릴 키 세션(없으면 null — 살릴 핵심이 없으면 트리아지 비노출). */
  saveSession: ScheduledSession
  /** 놓아줄 나머지 백로그(살릴 세션 제외). */
  releaseSessions: ScheduledSession[]
  /** 코치 안내(닦달 없이 — 하나 살리고 나머지 release). */
  message: string
}

/**
 * 이번 주(월~일) 남은 날 수(오늘 포함). 주 막판 판단·더블 catch-up 슬롯 계산에 쓴다.
 * 더블(#455) 제안 로직(doubleSession.ts)과 트리아지가 동일 기준을 공유하도록 export 한다.
 */
export function weekDaysLeftInclusive(today: Date): number {
  const { end } = trainingWeekRange(today)
  const endDate = new Date(`${end}T00:00:00`)
  const todayDate = new Date(`${toDateOnly(today)}T00:00:00`)
  return Math.round((endDate.getTime() - todayDate.getTime()) / MS_PER_DAY) + 1
}

/**
 * 이번 주 '실제로 밀린'(과거 due) 미수행 백로그. 오늘·미래의 정상 예정 세션은 백로그가 아니다
 * (아직 따라잡을 수 있음 — 정상 일정을 "놓아주라"고 하면 안 된다). missed/planned 둘 다 포함, 런 매칭 안 된 것만.
 * 트리아지·더블(#455) 제안이 같은 백로그 정의를 공유하도록 export 한다.
 */
export function currentWeekBacklog(sessions: ScheduledSession[], today: Date): ScheduledSession[] {
  const { start } = trainingWeekRange(today)
  const todayStr = toDateOnly(today)
  return sessions.filter(
    (s) => s.date >= start && s.date < todayStr && !s.runId && (s.status === 'planned' || s.status === 'missed')
  )
}

/** 키 세션 살리기 우선순위(롱런/레이스 > 템포). 같으면 남은 날(미래) 우선, 그 다음 이른 날. */
function keyPriority(s: ScheduledSession): number {
  if (s.sessionType === 'Race') return 4
  if (s.sessionType === 'LSD' || s.sessionType === 'Steady Long') return 3
  if (s.sessionType === 'Tempo') return 2
  return 1
}

/**
 * 주 마감이 임박(남은 날 ≤2)하고 미수행 백로그가 남은 용량을 넘으면 트리아지를 제안한다.
 * 살릴 키 세션 1개(이번 주 미수행 중 우선순위 최상, 남은 날 우선)와 놓아줄 나머지를 돌려준다.
 * 조건 미충족이거나 살릴 키 세션이 없으면 null(트리아지 비노출).
 */
export function weekEndTriage(sessions: ScheduledSession[], today: Date): WeekEndTriage | null {
  const { start, end } = trainingWeekRange(today)
  const todayStr = toDateOnly(today)
  const daysLeftIncl = weekDaysLeftInclusive(today)
  if (daysLeftIncl > 2) return null // 주 막판(남은 1~2일)에만

  // 백로그 = **실제로 밀린(과거 due) 미수행**만(currentWeekBacklog — 더블 제안과 동일 정의).
  const backlog = currentWeekBacklog(sessions, today)
  // "더블(하루 2회)로도 남은 날에 다 못 끼울 때만" 발동(SSOT). 남은 날 수 = 더블 catch-up 슬롯(일 1개).
  // backlog ≤ 남은 날이면 따라잡기 가능 → 비노출(닦달 금지). 이 조건상 backlog ≥ 2 일 때만 발동.
  if (backlog.length <= daysLeftIncl) return null

  // 살릴 키 세션 = 이번 주 미수행(과거+오늘+미래) 중 키, 우선순위 최상(오늘/미래의 키도 보호 대상).
  const keyCandidates = sessions
    .filter((s) => s.date >= start && s.date <= end && !s.runId && (s.status === 'planned' || s.status === 'missed'))
    .filter((s) => s.keySession || isHardType(s.sessionType))
    .sort(
      (a, b) =>
        Number(b.date >= todayStr) - Number(a.date >= todayStr) || // 남은 날(오늘/미래) 우선
        keyPriority(b) - keyPriority(a) || // 롱런/레이스 > 템포
        a.date.localeCompare(b.date)
    )
  const saveSession = keyCandidates[0]
  if (!saveSession) return null

  // 놓아줄 것 = 과거 밀린 백로그(살릴 키는 제외). 정상 미래 세션은 포함하지 않는다.
  const releaseSessions = backlog.filter((s) => s.id !== saveSession.id)
  if (!releaseSessions.length) return null

  const message =
    '주말이 빠듯해요. 다 하려 하지 말고 이번 주 핵심 하나만 살릴까요? 나머지는 죄책감 없이 놓아줘도 괜찮아요 — 회복도 훈련의 일부예요.'
  return { saveSession, releaseSessions, message }
}

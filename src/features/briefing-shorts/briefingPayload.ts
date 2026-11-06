import type { TodayBriefingPayload } from '@/app/stores/briefingShortsStore'
import type { TrainingGoal } from '@/entities/training-memory/model'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import { sessionTypeLabel, walkRunHeadline, type SessionBriefing, type SessionBriefingContext } from '@/shared/lib/coaching/sessionBriefing'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 세션 머리줄(이름·거리·페이스나 시간) — 요약 탭 히어로와 브리핑 쇼츠가 **같은 함수**를 지난다(#795 두 번째 진실).
 * 걷기·뛰기 날은 브리핑과 같은 이름·기준(입문은 거리·페이스 대신 시간).
 */
export function sessionHeadline(
  session: Pick<ScheduledSession, 'sessionType' | 'prescription'>,
  ctx: Pick<SessionBriefingContext, 'injury' | 'beginnerWalkRun'>
): { title: string; distanceKm: number | null; metaLine: string } {
  const p = session.prescription
  const walkRun = walkRunHeadline(session.sessionType, ctx)
  if (walkRun) {
    return { title: walkRun.title, distanceKm: walkRun.minutes ? null : p.distanceKm ?? null, metaLine: walkRun.minutes ? `약 ${walkRun.minutes}분` : '' }
  }
  return {
    title: sessionTypeLabel(session.sessionType),
    distanceKm: p.distanceKm ?? null,
    metaLine: p.paceRange ?? (p.durationMin ? `약 ${p.durationMin}분` : '')
  }
}

/** 영상 여는 말·제목의 '언제' — 오늘 / 내일 / 목요일. 셋 다 받침이 있어 뒤에 '은'이 붙는다 */
export function briefingDayWord(date: string, today: string): string {
  if (date === today) return '오늘'
  const d = new Date(`${date}T00:00:00`)
  const days = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
  return days === 1 ? '내일' : `${WEEKDAY_KO[d.getDay()]}요일`
}

/** 코치 탭에서 고른 날의 브리핑을 영상으로 다시 볼 때 — 요약 탭이 넘기는 오늘 값과 같은 모양 */
export function buildBriefingPayload(input: {
  date: string
  dayState: string
  today: string
  session: Pick<ScheduledSession, 'sessionType' | 'prescription'>
  briefing: SessionBriefing
  ctx: Pick<SessionBriefingContext, 'injury' | 'beginnerWalkRun'>
  goal: Pick<TrainingGoal, 'title' | 'targetDate'> | null
}): TodayBriefingPayload {
  return {
    date: input.date,
    dayState: input.dayState,
    when: briefingDayWord(input.date, input.today),
    sessionType: input.session.sessionType,
    ...sessionHeadline(input.session, input.ctx),
    briefing: input.briefing,
    goal: input.goal ? { title: input.goal.title, targetDate: input.goal.targetDate ?? null } : null
  }
}

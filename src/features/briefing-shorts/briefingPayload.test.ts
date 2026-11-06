import { describe, expect, it } from 'vitest'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { buildSessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import { briefingDayWord, buildBriefingPayload, sessionHeadline } from './briefingPayload'
import { buildBriefingScript } from './briefingScript'

function session(over: Partial<ScheduledSession> = {}): ScheduledSession {
  return {
    id: 's1', userId: 'u1', goalId: 'g1', date: '2026-11-06', phase: 'Build', sessionType: 'Easy', slot: null, keySession: false,
    prescription: { ...defaultScheduledSessionPrescription(), distanceKm: 8, durationMin: 50, paceRange: '6:10~6:40/km' },
    status: 'planned', source: 'generator', runId: null, createdAt: '', updatedAt: '', ...over
  }
}
const noWalkRun = { injury: null, beginnerWalkRun: null }

describe('briefingDayWord', () => {
  it('오늘 · 내일 · 그 뒤는 요일', () => {
    expect(briefingDayWord('2026-11-06', '2026-11-06')).toBe('오늘')
    expect(briefingDayWord('2026-11-07', '2026-11-06')).toBe('내일')
    expect(briefingDayWord('2026-11-08', '2026-11-06')).toBe('일요일')
    expect(briefingDayWord('2026-11-12', '2026-11-06')).toBe('목요일')
  })
})

describe('sessionHeadline', () => {
  it('일반 세션 = 타입 이름 · 거리 · 페이스', () => {
    expect(sessionHeadline(session(), noWalkRun)).toEqual({ title: '이지', distanceKm: 8, metaLine: '6:10~6:40/km' })
  })
})

describe('buildBriefingPayload', () => {
  it('코치 탭에서 고른 날 값 = 요약 탭과 같은 머리줄 + 그날의 언제', () => {
    const s = session({ date: '2026-11-07', sessionType: 'Tempo' })
    const briefing = buildSessionBriefing(s, { goal: null, injury: null, chronic: null, vdot: 45 })
    const payload = buildBriefingPayload({
      date: s.date, dayState: 'future', today: '2026-11-06', session: s, briefing, ctx: noWalkRun,
      goal: { title: '가을 하프 마라톤', targetDate: '2026-11-29' }
    })
    expect(payload).toMatchObject({ date: '2026-11-07', dayState: 'future', when: '내일', sessionType: 'Tempo', ...sessionHeadline(s, noWalkRun) })
    expect(payload.goal).toEqual({ title: '가을 하프 마라톤', targetDate: '2026-11-29' })
    // 여는 말도 그날로
    expect(buildBriefingScript({ ...payload, briefing })[0].text).toBe('내일은 템포 8km예요.')
  })
})

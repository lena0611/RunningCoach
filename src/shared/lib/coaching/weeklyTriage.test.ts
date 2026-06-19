import { describe, expect, it } from 'vitest'
import type { ScheduledSession, ScheduledSessionStatus } from '@/entities/training-schedule/model'
import type { RunType } from '@/entities/run/model'
import { weekEndTriage, weeklyHardLoadGuard } from '@/shared/lib/coaching/weeklyTriage'

function session(overrides: Partial<ScheduledSession> & { date: string }): ScheduledSession {
  const type: RunType = overrides.sessionType ?? 'Easy'
  const key = overrides.keySession ?? (type === 'Tempo' || type === 'LSD' || type === 'Steady Long' || type === 'Race')
  const status: ScheduledSessionStatus = overrides.status ?? 'planned'
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    userId: 'u1',
    goalId: 'g1',
    date: overrides.date,
    phase: 'Base',
    sessionType: type,
    keySession: key,
    prescription: { distanceKm: 8, durationMin: 48, paceRange: '', note: '' },
    status,
    source: 'generator',
    runId: overrides.runId ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

// 주 = 월 2026-01-12 ~ 일 2026-01-18.
const thursday = new Date('2026-01-15T00:00:00')
const saturday = new Date('2026-01-17T00:00:00')

describe('weeklyHardLoadGuard', () => {
  it('이번 주 하드가 상한(runDays-1) 이상이면 exceeds + 경고', () => {
    const sessions = [
      session({ date: '2026-01-12', sessionType: 'Tempo' }),
      session({ date: '2026-01-14', sessionType: 'LSD' }),
      session({ date: '2026-01-16', sessionType: 'Tempo' })
    ]
    const g = weeklyHardLoadGuard(sessions, thursday, 4)
    expect(g.hardCount).toBe(3)
    expect(g.ceiling).toBe(3)
    expect(g.exceeds).toBe(true)
    expect(g.message).toBeTruthy()
  })

  it('하드가 적으면 경고 없음', () => {
    const g = weeklyHardLoadGuard([session({ date: '2026-01-14', sessionType: 'Tempo' })], thursday, 4)
    expect(g.exceeds).toBe(false)
    expect(g.message).toBe('')
  })

  it('지금 바꾸려는 세션(excludeId)은 카운트에서 뺀다', () => {
    const sessions = [
      session({ id: 'cur', date: '2026-01-15', sessionType: 'Tempo' }),
      session({ date: '2026-01-12', sessionType: 'LSD' })
    ]
    expect(weeklyHardLoadGuard(sessions, thursday, 4, 'cur').hardCount).toBe(1)
  })

  it('폐기·포기·결손 세션은 하드로 안 센다', () => {
    const sessions = [
      session({ date: '2026-01-12', sessionType: 'Tempo', status: 'superseded' }),
      session({ date: '2026-01-13', sessionType: 'Tempo', status: 'skipped' }),
      session({ date: '2026-01-14', sessionType: 'Tempo', status: 'missed' })
    ]
    expect(weeklyHardLoadGuard(sessions, thursday, 4).hardCount).toBe(0)
  })
})

describe('weekEndTriage', () => {
  it('주말 임박+백로그가 남은 날 초과면 키 세션 하나 살리고 나머지 놓아준다', () => {
    // 토요일(남은 날=토·일=2). 미수행 3개(LSD 토 + Easy 화·수) → 3 > 2 → 트리아지.
    const sessions = [
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' }),
      session({ id: 'e1', date: '2026-01-13', sessionType: 'Easy' }),
      session({ id: 'e2', date: '2026-01-14', sessionType: 'Easy' }),
      session({ date: '2026-01-12', sessionType: 'Easy', status: 'done', runId: 'r1' })
    ]
    const t = weekEndTriage(sessions, saturday)
    expect(t).not.toBeNull()
    expect(t!.saveSession.id).toBe('lsd')
    expect(t!.releaseSessions.map((s) => s.id).sort()).toEqual(['e1', 'e2'])
    expect(t!.message).toBeTruthy()
  })

  it('주 초반(목)이라 마감 임박 아니면 null', () => {
    const sessions = [
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' }),
      session({ date: '2026-01-13', sessionType: 'Easy' }),
      session({ date: '2026-01-14', sessionType: 'Easy' })
    ]
    expect(weekEndTriage(sessions, thursday)).toBeNull()
  })

  it('백로그가 남은 용량 이하면 트리아지 비노출', () => {
    // 토요일·미수행 2개지만 남은 날도 2 → 따라잡기 가능 → null.
    const sessions = [
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' }),
      session({ date: '2026-01-18', sessionType: 'Easy' })
    ]
    expect(weekEndTriage(sessions, saturday)).toBeNull()
  })

  it('살릴 키 세션이 없으면 null(이지만 남은 건 자유)', () => {
    const sessions = [
      session({ date: '2026-01-13', sessionType: 'Easy' }),
      session({ date: '2026-01-14', sessionType: 'Easy' }),
      session({ date: '2026-01-15', sessionType: 'Easy' })
    ]
    expect(weekEndTriage(sessions, saturday)).toBeNull()
  })
})

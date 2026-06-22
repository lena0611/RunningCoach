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
    slot: overrides.slot ?? null,
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
const sunday = new Date('2026-01-18T00:00:00')

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

  it('폐기·포기·결손·휴식 세션은 하드로 안 센다', () => {
    const sessions = [
      session({ date: '2026-01-12', sessionType: 'Tempo', status: 'superseded' }),
      session({ date: '2026-01-13', sessionType: 'Tempo', status: 'skipped' }),
      session({ date: '2026-01-14', sessionType: 'Tempo', status: 'missed' }),
      // rested(선언한 휴식, #473): 휴식 중에 "이번 주 강한 세션이 이미 N개" 오경고가 뜨면 안 된다.
      session({ date: '2026-01-15', sessionType: 'Tempo', status: 'rested' })
    ]
    expect(weeklyHardLoadGuard(sessions, thursday, 4).hardCount).toBe(0)
  })
})

describe('weekEndTriage', () => {
  it('일요일·과거 밀린 백로그가 더블로도 안 될 때 키 하나 살리고 과거분 놓아준다', () => {
    // 일요일(남은 날=일=1). 과거 due 미수행 3개(목·금 Easy + 토 LSD) → 3 > 1 → 트리아지.
    const sessions = [
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' }),
      session({ id: 'e1', date: '2026-01-15', sessionType: 'Easy' }),
      session({ id: 'e2', date: '2026-01-16', sessionType: 'Easy' }),
      session({ date: '2026-01-12', sessionType: 'Easy', status: 'done', runId: 'r1' })
    ]
    const t = weekEndTriage(sessions, sunday)
    expect(t).not.toBeNull()
    expect(t!.saveSession.id).toBe('lsd') // 키(롱런) 보호
    expect(t!.releaseSessions.map((s) => s.id).sort()).toEqual(['e1', 'e2']) // 과거 밀린 이지만
    expect(t!.message).toBeTruthy()
  })

  it('rested(선언한 휴식, #473) 과거 세션은 백로그가 아니다 — 트리아지로 놓아주라고 닦달하지 않는다', () => {
    // 일요일. 과거 due 가 전부 rested(선언한 휴식)면 backlog=0 → 트리아지 비노출.
    const sessions = [
      session({ id: 'r1', date: '2026-01-15', sessionType: 'Easy', status: 'rested' }),
      session({ id: 'r2', date: '2026-01-16', sessionType: 'Easy', status: 'rested' }),
      session({ id: 'r3', date: '2026-01-17', sessionType: 'LSD', status: 'rested' })
    ]
    expect(weekEndTriage(sessions, sunday)).toBeNull()
  })

  it('정상 미래 세션은 백로그로 안 센다(놓아주라고 하지 않음)', () => {
    // 토요일. 과거 밀린 건 목 이지 1개뿐, 토 LSD=오늘·일 이지=미래(정상). backlog=1 ≤ 남은 2 → 비노출.
    const sessions = [
      session({ id: 'thu', date: '2026-01-15', sessionType: 'Easy' }),
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' }),
      session({ id: 'sun', date: '2026-01-18', sessionType: 'Easy' })
    ]
    expect(weekEndTriage(sessions, saturday)).toBeNull()
  })

  it('주 초반(목)이라 마감 임박 아니면 null', () => {
    const sessions = [
      session({ date: '2026-01-13', sessionType: 'Easy' }),
      session({ date: '2026-01-14', sessionType: 'Easy' }),
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' })
    ]
    expect(weekEndTriage(sessions, thursday)).toBeNull()
  })

  it('더블로 따라잡을 만하면(과거 ≤ 남은 날) 비노출', () => {
    // 토요일·과거 밀린 2개(화·수)지만 남은 날도 2(토·일) → 더블로 가능 → null.
    const sessions = [
      session({ date: '2026-01-13', sessionType: 'Easy' }),
      session({ date: '2026-01-14', sessionType: 'Easy' }),
      session({ id: 'lsd', date: '2026-01-17', sessionType: 'LSD' })
    ]
    expect(weekEndTriage(sessions, saturday)).toBeNull()
  })

  it('살릴 키 세션이 없으면 null', () => {
    // 일요일·과거 밀린 3개지만 전부 이지(키 없음) → 살릴 핵심이 없어 트리아지 비노출.
    const sessions = [
      session({ date: '2026-01-15', sessionType: 'Easy' }),
      session({ date: '2026-01-16', sessionType: 'Easy' }),
      session({ date: '2026-01-17', sessionType: 'Easy' })
    ]
    expect(weekEndTriage(sessions, sunday)).toBeNull()
  })
})

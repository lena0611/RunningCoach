import { describe, expect, it } from 'vitest'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import { proposeMoveToToday, proposeReschedule, proposeSwap } from '@/shared/lib/coaching/reschedule'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    userId: 'u1',
    goalId: 'g1',
    date: overrides.date ?? '2026-01-16',
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Tempo',
    keySession: overrides.keySession ?? false,
    prescription: overrides.prescription ?? { distanceKm: 8, durationMin: 48, paceRange: '5:10~5:35/km', note: '본 템포 20분' },
    status: overrides.status ?? 'planned',
    source: overrides.source ?? 'generator',
    runId: overrides.runId ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

// 2026-01-15=목. 현재 주=월 01-12~일 01-18. 01-16(금)=같은 주, 01-22(목)=다음 주.
const today = new Date('2026-01-15T00:00:00')

describe('proposeReschedule', () => {
  it('처방·타입·키세션을 보존한 채 날짜만 옮기고 source=manual', () => {
    const current = session({ date: '2026-01-16', sessionType: 'Tempo', keySession: true })
    const { draft } = proposeReschedule(current, '2026-01-17')
    expect(draft.date).toBe('2026-01-17')
    expect(draft.sessionType).toBe('Tempo')
    expect(draft.keySession).toBe(true)
    expect(draft.source).toBe('manual')
    // 처방 보존(재파생 금지, #405) — 동일 값.
    expect(draft.prescription).toEqual(current.prescription)
    // 얕은 복제라 원본과 다른 객체여야 한다(공유 참조 금지).
    expect(draft.prescription).not.toBe(current.prescription)
  })

  it('같은 훈련 주 안 이동은 경고 없음', () => {
    const r = proposeReschedule(session({ date: '2026-01-16' }), '2026-01-17')
    expect(r.crossesWeek).toBe(false)
    expect(r.warning).toBe('')
  })

  it('다른 주로 이동하면 crossesWeek + 소프트 경고', () => {
    const r = proposeReschedule(session({ date: '2026-01-16', keySession: false }), '2026-01-22')
    expect(r.crossesWeek).toBe(true)
    expect(r.warning).toBeTruthy()
  })

  it('키 세션을 다른 주로 옮기면 키세션 전용 경고(이번 주 안 권장)', () => {
    const r = proposeReschedule(session({ date: '2026-01-16', keySession: true }), '2026-01-22')
    expect(r.crossesWeek).toBe(true)
    expect(r.warning).toContain('키 세션')
  })
})

describe('proposeMoveToToday', () => {
  it('지난 세션을 오늘 날짜로 옮긴다', () => {
    const past = session({ date: '2026-01-13', status: 'missed' })
    const { draft } = proposeMoveToToday(past, today)
    expect(draft.date).toBe('2026-01-15')
    expect(draft.source).toBe('manual')
    expect(draft.sessionType).toBe(past.sessionType)
  })
})

describe('proposeSwap', () => {
  it('두 세션의 날짜를 맞바꾸고 원본 id 둘을 superseded 대상으로 반환', () => {
    const moving = session({ id: 'a', date: '2026-01-16', sessionType: 'Tempo' })
    const occupant = session({ id: 'b', date: '2026-01-18', sessionType: 'Easy' })
    const swap = proposeSwap(moving, occupant)
    expect(swap.supersedeIds).toEqual(['a', 'b'])
    // moving → occupant 의 날짜, occupant → moving 의 날짜.
    expect(swap.drafts[0].date).toBe('2026-01-18')
    expect(swap.drafts[0].sessionType).toBe('Tempo')
    expect(swap.drafts[1].date).toBe('2026-01-16')
    expect(swap.drafts[1].sessionType).toBe('Easy')
    expect(swap.drafts.every((d) => d.source === 'manual')).toBe(true)
  })

  it('키 세션끼리 스왑이면 하드-이지 교대 확인 경고', () => {
    const moving = session({ id: 'a', date: '2026-01-16', sessionType: 'Tempo', keySession: true })
    const occupant = session({ id: 'b', date: '2026-01-18', sessionType: 'LSD', keySession: true })
    expect(proposeSwap(moving, occupant).warning).toBeTruthy()
  })
})

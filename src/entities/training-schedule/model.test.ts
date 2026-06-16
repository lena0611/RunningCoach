import { describe, expect, it } from 'vitest'
import {
  defaultScheduledSessionPrescription,
  isActiveSession,
  isPlannedSession,
  normalizeScheduledSessionPrescription,
  selectSessionForRun,
  type ScheduledSession
} from '@/entities/training-schedule/model'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: overrides.id ?? 's1',
    userId: 'u1',
    goalId: overrides.goalId ?? null,
    date: overrides.date ?? '2026-06-16',
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy',
    keySession: overrides.keySession ?? false,
    prescription: overrides.prescription ?? defaultScheduledSessionPrescription(),
    status: overrides.status ?? 'planned',
    source: overrides.source ?? 'generator',
    runId: overrides.runId ?? null,
    createdAt: '2026-06-16T00:00:00Z',
    updatedAt: '2026-06-16T00:00:00Z'
  }
}

describe('normalizeScheduledSessionPrescription', () => {
  it('jsonb 누락/이상값을 안전한 기본값으로 강제한다', () => {
    expect(normalizeScheduledSessionPrescription(null)).toEqual({
      distanceKm: null,
      durationMin: null,
      paceRange: '',
      note: ''
    })
    expect(normalizeScheduledSessionPrescription({ distanceKm: 'x', durationMin: NaN, paceRange: 5, note: null })).toEqual({
      distanceKm: null,
      durationMin: null,
      paceRange: '',
      note: ''
    })
  })

  it('유효한 값은 보존한다', () => {
    expect(
      normalizeScheduledSessionPrescription({ distanceKm: 6.2, durationMin: 35, paceRange: '5:10~5:35/km', note: '스트라이드 x6' })
    ).toEqual({ distanceKm: 6.2, durationMin: 35, paceRange: '5:10~5:35/km', note: '스트라이드 x6' })
  })
})

describe('isPlannedSession / isActiveSession', () => {
  it('planned 이고 runId 없으면 planned 세션', () => {
    expect(isPlannedSession(session({ status: 'planned' }))).toBe(true)
    expect(isPlannedSession(session({ status: 'planned', runId: 'r1' }))).toBe(false)
    expect(isPlannedSession(session({ status: 'done', runId: 'r1' }))).toBe(false)
  })

  it('planned/missed 는 활성(재정렬·대체 대상), done/superseded 는 비활성', () => {
    expect(isActiveSession(session({ status: 'planned' }))).toBe(true)
    expect(isActiveSession(session({ status: 'missed' }))).toBe(true)
    expect(isActiveSession(session({ status: 'done' }))).toBe(false)
    expect(isActiveSession(session({ status: 'superseded' }))).toBe(false)
  })
})

describe('selectSessionForRun (런↔세션 매칭, 어제 빠진 세션 따라잡기)', () => {
  it('동일 날짜 활성 세션을 매칭', () => {
    const sessions = [session({ id: 'a', date: '2026-06-16' }), session({ id: 'b', date: '2026-06-18' })]
    expect(selectSessionForRun(sessions, { date: '2026-06-16' })?.id).toBe('a')
  })

  it('휴식날 런이 어제 빠진(missed) 세션을 ±1일 윈도우로 따라잡음(엑스트라 아님)', () => {
    // 6/16 훈련 미수행(planned), 6/17 휴식(세션 없음). 6/17에 런 → 6/16 세션 매칭.
    const sessions = [session({ id: 'mon', date: '2026-06-16', status: 'planned' })]
    expect(selectSessionForRun(sessions, { date: '2026-06-17' })?.id).toBe('mon')
  })

  it('윈도우 밖이면 매칭 없음 = 진짜 엑스트라 런', () => {
    const sessions = [session({ id: 'far', date: '2026-06-16' })]
    expect(selectSessionForRun(sessions, { date: '2026-06-20' })).toBeNull()
  })

  it('과거 미수행을 미래 세션보다 먼저 따라잡음(동률 시)', () => {
    const sessions = [session({ id: 'past', date: '2026-06-16' }), session({ id: 'future', date: '2026-06-18' })]
    // 6/17 런: past(gap -1)·future(gap +1) 동률 → 과거 먼저
    expect(selectSessionForRun(sessions, { date: '2026-06-17' })?.id).toBe('past')
  })

  it('done/superseded 는 매칭 대상 아님', () => {
    const sessions = [session({ id: 'done', date: '2026-06-16', status: 'done', runId: 'r' })]
    expect(selectSessionForRun(sessions, { date: '2026-06-16' })).toBeNull()
  })
})

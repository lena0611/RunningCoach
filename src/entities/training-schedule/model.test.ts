import { describe, expect, it } from 'vitest'
import {
  defaultScheduledSessionPrescription,
  isActiveSession,
  isPlannedSession,
  normalizeScheduledSessionPrescription,
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

import { describe, expect, it } from 'vitest'
import {
  defaultScheduledSessionPrescription,
  isActiveSession,
  isPlannedSession,
  normalizeScheduledSessionPrescription,
  selectBetterTypeMatchForRun,
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
    slot: overrides.slot ?? null,
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

  it('같은 날 더블이면 런 타입 일치(없으면 키세션) 세션을 결정론적으로 매칭', () => {
    // 이동으로 일요일에 Easy(배열 먼저) + LSD(키) 둘 다 planned. 배열 순서 의존 대신 결정론으로.
    const sessions = [
      session({ id: 'easy', date: '2026-06-21', sessionType: 'Easy', keySession: false }),
      session({ id: 'lsd', date: '2026-06-21', sessionType: 'LSD', keySession: true })
    ]
    expect(selectSessionForRun(sessions, { date: '2026-06-21', type: 'LSD' })?.id).toBe('lsd') // 타입 일치 우선
    expect(selectSessionForRun(sessions, { date: '2026-06-21' })?.id).toBe('lsd') // 타입 미제공이면 키세션 우선
  })

  it('더블(AM/PM)이면 런 시작 시각으로 슬롯을 가른다(#455 결정 B)', () => {
    // 같은 날 AM Tempo + PM Easy. 오전 런→AM, 오후 런→PM. 시각이 타입보다 우선.
    const sessions = [
      session({ id: 'am', date: '2026-06-21', sessionType: 'Tempo', slot: 'AM', keySession: true }),
      session({ id: 'pm', date: '2026-06-21', sessionType: 'Easy', slot: 'PM', keySession: false })
    ]
    expect(selectSessionForRun(sessions, { date: '2026-06-21', startAt: '2026-06-21T07:30:00' })?.id).toBe('am')
    expect(selectSessionForRun(sessions, { date: '2026-06-21', startAt: '2026-06-21T18:30:00' })?.id).toBe('pm')
    // 오후 런이 타입은 Tempo라도(이상 케이스) 시각이 우선이라 PM(Easy)에 붙는다.
    expect(selectSessionForRun(sessions, { date: '2026-06-21', type: 'Tempo', startAt: '2026-06-21T19:00:00' })?.id).toBe('pm')
  })

  it('startAt 없으면 슬롯 중립 — 기존 타입/키세션 우선 동작 유지', () => {
    const sessions = [
      session({ id: 'am', date: '2026-06-21', sessionType: 'Tempo', slot: 'AM', keySession: true }),
      session({ id: 'pm', date: '2026-06-21', sessionType: 'Easy', slot: 'PM', keySession: false })
    ]
    expect(selectSessionForRun(sessions, { date: '2026-06-21', type: 'Easy' })?.id).toBe('pm') // 타입 일치
    expect(selectSessionForRun(sessions, { date: '2026-06-21' })?.id).toBe('am') // 미제공이면 키세션
  })
})

describe('selectBetterTypeMatchForRun (라벨 재추론 후 매칭 재연결)', () => {
  it('재추론으로 LSD가 된 런이 잘못 연결된 Easy(done) 대신 같은 날 활성 LSD를 찾는다', () => {
    // 더블 오매칭: 같은 날 Easy(done·런 연결) + LSD(missed). 런이 LSD로 재추론되면 LSD 세션으로 옮긴다.
    const sessions = [
      session({ id: 'easy', date: '2026-06-21', sessionType: 'Easy', status: 'done', runId: 'r' }),
      session({ id: 'lsd', date: '2026-06-21', sessionType: 'LSD', keySession: true, status: 'missed' })
    ]
    expect(selectBetterTypeMatchForRun(sessions, { date: '2026-06-21', type: 'LSD' }, 'easy')?.id).toBe('lsd')
  })

  it('±1일 윈도우 안의 타입 일치 활성 세션도 찾는다', () => {
    const sessions = [
      session({ id: 'easy', date: '2026-06-21', sessionType: 'Easy', status: 'done', runId: 'r' }),
      session({ id: 'lsd', date: '2026-06-20', sessionType: 'LSD', status: 'missed' })
    ]
    expect(selectBetterTypeMatchForRun(sessions, { date: '2026-06-21', type: 'LSD' }, 'easy')?.id).toBe('lsd')
  })

  it('정확히 일치하는 활성 세션이 없으면 null(재연결 안 함)', () => {
    const sessions = [session({ id: 'easy', date: '2026-06-21', sessionType: 'Easy', status: 'done', runId: 'r' })]
    expect(selectBetterTypeMatchForRun(sessions, { date: '2026-06-21', type: 'LSD' }, 'easy')).toBeNull()
  })

  it('런 타입이 없으면 null', () => {
    const sessions = [session({ id: 'lsd', date: '2026-06-21', sessionType: 'LSD', status: 'missed' })]
    expect(selectBetterTypeMatchForRun(sessions, { date: '2026-06-21' }, 'easy')).toBeNull()
  })

  it('exclude 대상 세션은 후보에서 제외한다', () => {
    // 방어적: 같은 타입 활성 세션이 둘이면 exclude 아닌 쪽을 고른다.
    const sessions = [
      session({ id: 'lsd-self', date: '2026-06-21', sessionType: 'LSD', status: 'missed' }),
      session({ id: 'lsd-other', date: '2026-06-21', sessionType: 'LSD', keySession: true, status: 'planned' })
    ]
    expect(selectBetterTypeMatchForRun(sessions, { date: '2026-06-21', type: 'LSD' }, 'lsd-self')?.id).toBe('lsd-other')
  })
})

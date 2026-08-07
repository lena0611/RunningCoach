import { describe, expect, it } from 'vitest'
import {
  findPrunableSupersededIds,
  SUPERSEDED_PRUNE_BATCH,
  SUPERSEDED_REVERT_WINDOW_DAYS,
  type ScheduledSession,
  type ScheduledSessionStatus
} from './model'

/**
 * superseded 정리 판정 계약(#661).
 *
 * **삭제는 되돌릴 수 없다.** 그래서 "무엇을 지우나"보다 **"무엇을 절대 지키나"** 를 먼저 못박는다.
 * 감사(2026-08-07)로 확인된 superseded 소비처는 정확히 둘이고, 아래 보존 규칙이 그 둘을 막는다:
 *  - `CoachPage.activeOriginal` → "원래 제안 · 되돌리기"  (규칙 1·2)
 *  - `useCoachMoments.scheduleStartDate` → 플랜 시작일(status 무관 최소 날짜)  (규칙 3)
 */
const TODAY = '2026-08-07'

function session(overrides: Partial<ScheduledSession> & { id: string; date: string; status: ScheduledSessionStatus }): ScheduledSession {
  return {
    userId: 'u1',
    goalId: 'g1',
    phase: 'base',
    sessionType: 'Easy',
    slot: null,
    keySession: false,
    prescription: {},
    source: 'auto',
    runId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  } as ScheduledSession
}

describe('findPrunableSupersededIds — 지켜야 할 것부터', () => {
  it('superseded 가 아닌 행은 절대 후보가 아니다', () => {
    const rows = [
      session({ id: 'p', date: '2026-05-01', status: 'planned' }),
      session({ id: 'd', date: '2026-05-02', status: 'done' }),
      session({ id: 'm', date: '2026-05-03', status: 'missed' }),
      session({ id: 'sk', date: '2026-05-04', status: 'skipped' }),
      session({ id: 'r', date: '2026-05-05', status: 'rested' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual([])
  })

  it('규칙 1 — 되돌리기 창(14일) 안의 superseded 는 남긴다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'recent', date: '2026-08-01', status: 'superseded' }), // 6일 전
      session({ id: 'old', date: '2026-06-01', status: 'superseded' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['old'])
  })

  it('규칙 1 경계 — 창 시작일(오늘-14일) 당일은 남기고 그 하루 전은 지운다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'onEdge', date: '2026-07-24', status: 'superseded' }),
      session({ id: 'beforeEdge', date: '2026-07-23', status: 'superseded' })
    ]
    expect(SUPERSEDED_REVERT_WINDOW_DAYS).toBe(14)
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['beforeEdge'])
  })

  it('규칙 2 — 같은 날 활성 세션이 있으면 남긴다 (되돌리기 원본 이중 보호)', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'orig', date: '2026-06-10', status: 'superseded' }),
      session({ id: 'replacement', date: '2026-06-10', status: 'planned', source: 'manual' }),
      session({ id: 'lonely', date: '2026-06-11', status: 'superseded' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['lonely'])
  })

  it('규칙 2 — done 이 남은 날짜도 활성으로 보고 보존한다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'orig', date: '2026-06-10', status: 'superseded' }),
      session({ id: 'ran', date: '2026-06-10', status: 'done', runId: 'r1' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual([])
  })

  it('규칙 3 — 목표별 최초 날짜 행은 남긴다 (플랜 시작일이 밀리면 과거 추가런 판정이 바뀐다)', () => {
    const rows = [
      session({ id: 'first', date: '2026-02-01', status: 'superseded' }),
      session({ id: 'second', date: '2026-03-01', status: 'superseded' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['second'])
  })

  it('규칙 3 — 목표가 여러 개면 각 목표의 최초 날짜를 각각 지킨다', () => {
    const rows = [
      session({ id: 'g1first', date: '2026-02-01', status: 'superseded', goalId: 'g1' }),
      session({ id: 'g1later', date: '2026-03-01', status: 'superseded', goalId: 'g1' }),
      session({ id: 'g2first', date: '2026-04-01', status: 'superseded', goalId: 'g2' }),
      session({ id: 'g2later', date: '2026-05-01', status: 'superseded', goalId: 'g2' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY).sort()).toEqual(['g1later', 'g2later'])
  })

  it('한 번에 지우는 개수를 상한으로 묶는다 (오래된 것부터)', () => {
    const rows = [session({ id: 'anchor', date: '2026-01-01', status: 'planned' })]
    for (let i = 0; i < SUPERSEDED_PRUNE_BATCH + 50; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      const month = String((i % 5) + 2).padStart(2, '0')
      rows.push(session({ id: `s${i}`, date: `2026-${month}-${day}`, status: 'superseded' }))
    }
    const picked = findPrunableSupersededIds(rows, TODAY)
    expect(picked.length).toBe(SUPERSEDED_PRUNE_BATCH)
  })

  it('실측 규모 재현 — 3,715행 중 보존 규칙에 걸리는 것만 남는다', () => {
    const rows: ScheduledSession[] = [session({ id: 'anchor', date: '2026-01-05', status: 'superseded' })]
    // 활성 세션이 함께 있는 날짜(보존) + 단독 superseded(삭제 후보)
    rows.push(session({ id: 'keepPaired', date: '2026-06-01', status: 'superseded' }))
    rows.push(session({ id: 'activeSameDay', date: '2026-06-01', status: 'planned' }))
    rows.push(session({ id: 'keepInWindow', date: '2026-08-05', status: 'superseded' }))
    for (let i = 0; i < 20; i++) rows.push(session({ id: `junk${i}`, date: `2026-04-${String(i + 1).padStart(2, '0')}`, status: 'superseded' }))

    const picked = findPrunableSupersededIds(rows, TODAY)
    expect(picked).not.toContain('anchor')
    expect(picked).not.toContain('keepPaired')
    expect(picked).not.toContain('keepInWindow')
    expect(picked).toHaveLength(20)
  })

  it('빈 입력·잘못된 오늘 날짜는 아무것도 지우지 않는다', () => {
    expect(findPrunableSupersededIds([], TODAY)).toEqual([])
    expect(findPrunableSupersededIds([session({ id: 'x', date: '2026-01-01', status: 'superseded' })], 'nope')).toEqual([])
  })
})

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
 * 감사(2026-08-07)로 확인된 superseded 소비처는 정확히 둘이고, 보존 규칙이 그 둘을 막는다:
 *  - `CoachPage.activeOriginal` → (목표,날짜)별 createdAt 최소 1건이 되돌리기의 재료  (규칙 1)
 *  - `useCoachMoments.scheduleStartDate` → 플랜 시작일(status 무관 최소 날짜)         (규칙 3)
 * 그리고 진행 중 변경 안전 여유가 규칙 2(updatedAt 14일)다.
 */
const TODAY = '2026-08-07'

function session(
  overrides: Partial<ScheduledSession> & { id: string; date: string; status: ScheduledSessionStatus }
): ScheduledSession {
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
    updatedAt: '2026-05-01T00:00:00Z',
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

  /**
   * 규칙 1 — 되돌리기가 읽는 행 자체를 남긴다.
   * CoachPage.activeOriginal 은 같은 날짜 superseded 를 createdAt 오름차순으로 정렬해 [0] 을 고른다.
   */
  it('규칙 1 — (목표,날짜)별 createdAt 가장 이른 폐기본은 남기고 중간 사본만 지운다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'origin', date: '2026-09-01', status: 'superseded', createdAt: '2026-03-01T00:00:00Z' }),
      session({ id: 'mid1', date: '2026-09-01', status: 'superseded', createdAt: '2026-04-01T00:00:00Z' }),
      session({ id: 'mid2', date: '2026-09-01', status: 'superseded', createdAt: '2026-05-01T00:00:00Z' }),
      session({ id: 'live', date: '2026-09-01', status: 'planned', source: 'manual' })
    ]
    const picked = findPrunableSupersededIds(rows, TODAY)
    expect(picked).not.toContain('origin')
    expect(picked.sort()).toEqual(['mid1', 'mid2'])
  })

  it('규칙 1 — 그 날짜에 폐기본이 하나뿐이면 지우지 않는다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'only', date: '2026-09-01', status: 'superseded' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual([])
  })

  it('규칙 1 — 날짜가 다르면 각각 1건씩 지킨다', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'aOld', date: '2026-09-01', status: 'superseded', createdAt: '2026-03-01T00:00:00Z' }),
      session({ id: 'aNew', date: '2026-09-01', status: 'superseded', createdAt: '2026-04-01T00:00:00Z' }),
      session({ id: 'bOld', date: '2026-09-02', status: 'superseded', createdAt: '2026-03-01T00:00:00Z' }),
      session({ id: 'bNew', date: '2026-09-02', status: 'superseded', createdAt: '2026-04-01T00:00:00Z' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY).sort()).toEqual(['aNew', 'bNew'])
  })

  /**
   * 규칙 2 — 나이의 축은 훈련 날짜가 아니라 **폐기된 시점(updatedAt)** 이다.
   * 재정렬은 미래 세션을 supersede 하므로 session_date 로 재면 3개월 전 폐기본도 "미래라 최신"으로 오판한다
   * (2026-08-07 실측: 그 오판으로 3,698행 중 17행만 지워졌다).
   */
  it('규칙 2 — 최근 14일 안에 폐기된 행은 남긴다 (미래 날짜여도 나이는 updatedAt 으로 잰다)', () => {
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'origin', date: '2026-12-01', status: 'superseded', createdAt: '2026-01-02T00:00:00Z' }),
      session({ id: 'justChanged', date: '2026-12-01', status: 'superseded', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' }),
      session({ id: 'longAgo', date: '2026-12-01', status: 'superseded', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' })
    ]
    expect(SUPERSEDED_REVERT_WINDOW_DAYS).toBe(14)
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['longAgo'])
  })

  it('규칙 2 경계 — 창 시작일(오늘-14일) 당일은 남기고 그 하루 전은 지운다', () => {
    const base = { date: '2026-12-01', status: 'superseded' as ScheduledSessionStatus }
    const rows = [
      session({ id: 'anchor', date: '2026-01-01', status: 'planned' }),
      session({ id: 'origin', ...base, createdAt: '2026-01-02T00:00:00Z' }),
      session({ id: 'onEdge', ...base, createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-07-24T00:00:00Z' }),
      session({ id: 'beforeEdge', ...base, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-07-23T00:00:00Z' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['beforeEdge'])
  })

  it('규칙 3 — 목표별 최초 세션 날짜 행은 남긴다 (플랜 시작일이 밀리면 과거 추가런 판정이 바뀐다)', () => {
    const rows = [
      session({ id: 'firstA', date: '2026-02-01', status: 'superseded', createdAt: '2026-01-01T00:00:00Z' }),
      session({ id: 'firstB', date: '2026-02-01', status: 'superseded', createdAt: '2026-01-02T00:00:00Z' }),
      session({ id: 'laterOrigin', date: '2026-03-01', status: 'superseded', createdAt: '2026-01-01T00:00:00Z' }),
      session({ id: 'laterMid', date: '2026-03-01', status: 'superseded', createdAt: '2026-01-02T00:00:00Z' })
    ]
    // firstB 는 규칙 3(최초 날짜), laterOrigin 은 규칙 1(되돌리기 원본)로 보존 → laterMid 만 후보
    expect(findPrunableSupersededIds(rows, TODAY)).toEqual(['laterMid'])
  })

  it('목표가 여러 개면 각 목표를 독립으로 판정한다', () => {
    const rows = [
      session({ id: 'g1anchor', date: '2026-02-01', status: 'planned', goalId: 'g1' }),
      session({ id: 'g1origin', date: '2026-09-01', status: 'superseded', goalId: 'g1', createdAt: '2026-03-01T00:00:00Z' }),
      session({ id: 'g1mid', date: '2026-09-01', status: 'superseded', goalId: 'g1', createdAt: '2026-04-01T00:00:00Z' }),
      session({ id: 'g2anchor', date: '2026-02-05', status: 'planned', goalId: 'g2' }),
      session({ id: 'g2origin', date: '2026-09-01', status: 'superseded', goalId: 'g2', createdAt: '2026-03-01T00:00:00Z' }),
      session({ id: 'g2mid', date: '2026-09-01', status: 'superseded', goalId: 'g2', createdAt: '2026-04-01T00:00:00Z' })
    ]
    expect(findPrunableSupersededIds(rows, TODAY).sort()).toEqual(['g1mid', 'g2mid'])
  })

  it('한 번에 지우는 개수를 상한으로 묶는다 (오래 전에 폐기된 것부터)', () => {
    const rows: ScheduledSession[] = [session({ id: 'anchor', date: '2026-01-01', status: 'planned' })]
    for (let i = 0; i < SUPERSEDED_PRUNE_BATCH + 50; i++) {
      rows.push(
        session({
          id: `s${i}`,
          date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
          status: 'superseded',
          createdAt: `2026-02-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
          updatedAt: '2026-06-01T00:00:00Z'
        })
      )
    }
    expect(findPrunableSupersededIds(rows, TODAY).length).toBe(SUPERSEDED_PRUNE_BATCH)
  })

  /** 실측 형태 재현: 한 날짜에 23층씩 쌓인 구조에서 층당 1개만 남아야 한다. */
  it('실측 형태 재현 — 날짜당 23층이면 22층이 후보, 1층은 되돌리기용으로 보존', () => {
    const rows: ScheduledSession[] = [session({ id: 'anchor', date: '2026-01-01', status: 'planned' })]
    for (let layer = 0; layer < 23; layer++) {
      rows.push(
        session({
          id: `layer${layer}`,
          date: '2026-09-15',
          status: 'superseded',
          createdAt: `2026-02-${String(layer + 1).padStart(2, '0')}T00:00:00Z`,
          updatedAt: '2026-06-01T00:00:00Z'
        })
      )
    }
    const picked = findPrunableSupersededIds(rows, TODAY)
    expect(picked).toHaveLength(22)
    expect(picked).not.toContain('layer0')
  })

  it('빈 입력·잘못된 오늘 날짜는 아무것도 지우지 않는다', () => {
    expect(findPrunableSupersededIds([], TODAY)).toEqual([])
    expect(findPrunableSupersededIds([session({ id: 'x', date: '2026-01-01', status: 'superseded' })], 'nope')).toEqual([])
  })
})

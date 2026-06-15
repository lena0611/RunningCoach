import { describe, expect, it } from 'vitest'
import { defaultSessionIntentTargets, type SessionIntent } from '@/entities/session-intent/model'
import { selectIntentForRun } from '@/entities/session-intent/matchSessionIntent'

function intent(overrides: Partial<SessionIntent>): SessionIntent {
  return {
    id: overrides.id ?? 'i1',
    userId: 'u1',
    goalId: null,
    plannedDate: overrides.plannedDate ?? '2026-06-15',
    sessionType: 'Tempo',
    title: '템포런 6km',
    why: '',
    targets: defaultSessionIntentTargets(),
    successCriteria: [],
    source: 'coach',
    status: overrides.status ?? 'planned',
    runId: overrides.runId ?? null,
    matchedAt: null,
    createdAt: overrides.createdAt ?? '2026-06-15T06:00:00.000Z',
    updatedAt: '2026-06-15T06:00:00.000Z',
    ...overrides
  }
}

describe('selectIntentForRun', () => {
  it('빈 목록이면 null', () => {
    expect(selectIntentForRun([], { date: '2026-06-15' })).toBeNull()
  })

  it('같은 날짜의 미연결 의도를 매칭한다', () => {
    const a = intent({ id: 'a', plannedDate: '2026-06-15' })
    expect(selectIntentForRun([a], { date: '2026-06-15' })?.id).toBe('a')
  })

  it('정확히 같은 날짜를 ±1일 후보보다 우선한다', () => {
    const exact = intent({ id: 'exact', plannedDate: '2026-06-15' })
    const prev = intent({ id: 'prev', plannedDate: '2026-06-14' })
    expect(selectIntentForRun([prev, exact], { date: '2026-06-15' })?.id).toBe('exact')
  })

  it('윈도우(±1일)를 벗어나면 매칭하지 않는다', () => {
    const far = intent({ id: 'far', plannedDate: '2026-06-12' })
    expect(selectIntentForRun([far], { date: '2026-06-15' })).toBeNull()
  })

  it('이미 매칭됐거나 planned 가 아니면 후보에서 제외', () => {
    const completed = intent({ id: 'c', status: 'completed', runId: 'r0' })
    const skipped = intent({ id: 's', status: 'skipped' })
    expect(selectIntentForRun([completed, skipped], { date: '2026-06-15' })).toBeNull()
  })

  it('같은 날짜 동률이면 createdAt 최근을 고른다', () => {
    const older = intent({ id: 'old', createdAt: '2026-06-15T05:00:00.000Z' })
    const newer = intent({ id: 'new', createdAt: '2026-06-15T08:00:00.000Z' })
    expect(selectIntentForRun([older, newer], { date: '2026-06-15' })?.id).toBe('new')
  })
})

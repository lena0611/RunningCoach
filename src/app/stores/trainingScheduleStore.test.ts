import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ScheduledSession } from '@/entities/training-schedule/model'

vi.mock('@/shared/api/supabase', () => ({ isSupabaseConfigured: true }))
vi.mock('@/shared/api/trainingScheduleRepository', () => ({
  fetchTrainingSchedule: vi.fn(),
  deleteSupersededSessions: vi.fn(async () => 0),
  insertTrainingSessions: vi.fn(async () => []),
  markPastPlannedMissed: vi.fn(async () => 0),
  markSessionsRested: vi.fn(async () => 0),
  supersedeSessionsFrom: vi.fn(async () => 0),
  unmarkRestedFrom: vi.fn(async () => 0),
  updateScheduledSessionSlot: vi.fn(),
  updateScheduledSessionStatus: vi.fn()
}))

import { fetchTrainingSchedule } from '@/shared/api/trainingScheduleRepository'
import { useTrainingScheduleStore } from './trainingScheduleStore'

// (#891) 로그인 직후 목표 전환 watch 와 일정 확인이 load 를 동시에 불렀다. 뒤에 부른 쪽이 그냥 돌아가
// 빈 세션을 '예정 세션 없음'으로 읽고 플랜을 한 벌 더 지었다 — 겹쳐 부르면 앞 load 가 끝날 때까지 기다려야 한다.

function session(goalId: string, id: string): ScheduledSession {
  return {
    id,
    userId: 'u1',
    goalId,
    date: '2026-10-30',
    phase: 'Base',
    sessionType: 'Easy',
    slot: null,
    keySession: false,
    prescription: { distanceKm: 2.4, durationMin: null, note: '', paceRange: '' },
    status: 'planned',
    source: 'generator',
    runId: null,
    createdAt: '2026-10-27T00:00:00Z',
    updatedAt: '2026-10-27T00:00:00Z'
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('trainingScheduleStore.load 겹침 (#891)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchTrainingSchedule).mockReset()
  })

  it('같은 목표를 겹쳐 부르면 앞 load 가 끝날 때까지 기다린다 — 빈 세션으로 돌아가지 않는다', async () => {
    const pending = deferred<ScheduledSession[]>()
    vi.mocked(fetchTrainingSchedule).mockReturnValueOnce(pending.promise)
    const store = useTrainingScheduleStore()

    const first = store.load('g1')
    // 일정 확인처럼 load 를 기다린 직후 세션을 읽는다.
    let seen: string[] | null = null
    const second = store.load('g1').then(() => {
      seen = store.sessions.map((s) => s.id)
    })
    // 앞 load 가 끝나기 전에 대기열을 다 흘려 본다 — 여기서 이미 끝났다면 빈 세션을 본 것이다.
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toBeNull()

    pending.resolve([session('g1', 's1')])
    await Promise.all([first, second])
    expect(seen).toEqual(['s1'])
    expect(store.loadedGoalId).toBe('g1')
    expect(fetchTrainingSchedule).toHaveBeenCalledTimes(1)
  })

  it('다른 목표를 불러오던 중이면 끝난 뒤 이 목표로 다시 불러온다', async () => {
    const pending = deferred<ScheduledSession[]>()
    vi.mocked(fetchTrainingSchedule)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([session('g2', 's2')])
    const store = useTrainingScheduleStore()

    const first = store.load('g1')
    const second = store.load('g2')
    pending.resolve([session('g1', 's1')])
    await Promise.all([first, second])

    expect(store.loadedGoalId).toBe('g2')
    expect(store.sessions.map((s) => s.id)).toEqual(['s2'])
    expect(fetchTrainingSchedule).toHaveBeenNthCalledWith(2, 'g2')
  })
})

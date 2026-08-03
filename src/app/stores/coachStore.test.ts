import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCoachStore } from './coachStore'
import type { RunLog } from '@/entities/run/model'

const run = { id: 'run-1', date: '2026-08-01', type: 'Easy' } as RunLog

describe('coachStore scope (#616)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts closed', () => {
    const store = useCoachStore()
    expect(store.isOpen).toBe(false)
    expect(store.scope).toBeNull()
    expect(store.activeRun).toBeNull()
  })

  it('opens a session scope with the target run', () => {
    const store = useCoachStore()
    store.open(run)
    expect(store.isOpen).toBe(true)
    expect(store.scope).toBe('session')
    expect(store.activeRun?.id).toBe('run-1')
  })

  // 전역 대화는 런이 없는 채로 **열려 있다** — activeRun 만 보면 닫힘으로 오판한다.
  it('opens a global scope without any run', () => {
    const store = useCoachStore()
    store.openGlobal()
    expect(store.isOpen).toBe(true)
    expect(store.scope).toBe('global')
    expect(store.activeRun).toBeNull()
  })

  it('drops the previous run when switching from session to global', () => {
    const store = useCoachStore()
    store.open(run)
    store.openGlobal()
    expect(store.activeRun).toBeNull()
    expect(store.scope).toBe('global')
  })

  it('closes both scopes', () => {
    const store = useCoachStore()
    store.openGlobal()
    store.close()
    expect(store.isOpen).toBe(false)
    expect(store.scope).toBeNull()

    store.open(run)
    store.close()
    expect(store.isOpen).toBe(false)
    expect(store.activeRun).toBeNull()
  })
})

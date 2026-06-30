import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRunStore } from '@/app/stores/runStore'
import { SELF_RACE_TAG } from '@/entities/competition/model'
import { makeRun } from './factories'

// Supabase 미설정(localStorage 모드): 세션·의도·경쟁결과 회수와 heal 은 no-op 이고,
// deny-list 적재/재추론 가드는 동작한다. Supabase-only 경로(G2 unlink/unmatch·G4 heal)는
// 그 자체가 store 액션 단위로 검증되며 여기선 비파괴(localStorage) 동작과 가드를 확인한다.
vi.mock('@/shared/api/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  requireSupabase: vi.fn(),
  getSupabaseFunctionUrl: vi.fn(),
  getSupabaseAnonKey: vi.fn()
}))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('runStore deleteRun deny-list 적재 (#235 후속 G3)', () => {
  it('healthkit + externalId 런 삭제 시 externalId 를 deny-list 에 적재', async () => {
    const store = useRunStore()
    store.runs = [makeRun({ id: 'r1', source: 'healthkit', externalId: 'hk-1' })]
    store.loaded = true

    await store.deleteRun('r1')

    expect(store.runs).toHaveLength(0)
    expect(store.deniedExternalIds).toContain('hk-1')
    // localStorage 영속 확인.
    expect(JSON.parse(localStorage.getItem('pacelab.runImportDenylist') ?? '[]')).toContain('hk-1')
  })

  it('수기(externalId 없음) 런 삭제는 deny-list 에 적재하지 않는다', async () => {
    const store = useRunStore()
    store.runs = [makeRun({ id: 'r2', source: 'manual', externalId: null })]
    store.loaded = true

    await store.deleteRun('r2')

    expect(store.deniedExternalIds).toHaveLength(0)
  })

  it('releaseDenied 는 deny-list 에서 해제하고 영속한다(과거 마이그레이션 재유입 허용)', async () => {
    const store = useRunStore()
    store.deniedExternalIds = ['hk-1', 'hk-2']
    localStorage.setItem('pacelab.runImportDenylist', JSON.stringify(['hk-1', 'hk-2']))

    await store.releaseDenied(['hk-1'])

    expect(store.deniedExternalIds).toEqual(['hk-2'])
    expect(JSON.parse(localStorage.getItem('pacelab.runImportDenylist') ?? '[]')).toEqual(['hk-2'])
  })
})

describe('runStore reinferMislabeledLongRuns self-race 가드 (#235 후속 M3)', () => {
  it('self-race 런은 타입 재추론 대상에서 제외된다(type 변조·집계 오염 방지)', async () => {
    const store = useRunStore()
    // 거리·시간상 LSD/Steady Long 으로 재추론될 법한 긴 Easy 레이싱 런.
    store.runs = [
      makeRun({
        id: 'race',
        source: 'healthkit',
        type: 'Easy',
        distanceKm: 18,
        durationSec: 7200,
        avgPaceSec: 400,
        tags: ['healthkit', 'type:auto', SELF_RACE_TAG]
      })
    ]
    store.loaded = true

    const changed = await store.reinferMislabeledLongRuns(null)

    expect(changed).toHaveLength(0)
    expect(store.runs[0].type).toBe('Easy')
  })
})

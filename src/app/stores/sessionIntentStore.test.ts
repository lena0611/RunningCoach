import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SessionIntent, SessionIntentDraft, SessionIntentStatus } from '@/entities/session-intent/model'

// Supabase 를 설정됨으로 강제(env 미설정 테스트 환경에서 store no-op 회피).
vi.mock('@/shared/api/supabase', () => ({ isSupabaseConfigured: true }))

// 인메모리 repository 모킹 — 실제 네트워크 없이 store 로직만 검증.
let store: SessionIntent[] = []
let seq = 0
function makeIntent(draft: SessionIntentDraft): SessionIntent {
  seq += 1
  return {
    id: `i${seq}`,
    userId: 'u1',
    goalId: draft.goalId,
    plannedDate: draft.plannedDate,
    sessionType: draft.sessionType,
    title: draft.title,
    why: draft.why,
    targets: draft.targets,
    successCriteria: draft.successCriteria,
    source: draft.source,
    status: 'planned',
    runId: null,
    matchedAt: null,
    createdAt: new Date(2026, 5, 29, seq).toISOString(),
    updatedAt: ''
  }
}
vi.mock('@/shared/api/sessionIntentRepository', () => ({
  fetchSessionIntents: vi.fn(async () => [...store]),
  insertSessionIntent: vi.fn(async (draft: SessionIntentDraft) => {
    const intent = makeIntent(draft)
    store.push(intent)
    return intent
  }),
  matchSessionIntentToRun: vi.fn(),
  unmatchSessionIntentFromRun: vi.fn(),
  updateSessionIntentStatus: vi.fn(async (id: string, status: SessionIntentStatus) => {
    const target = store.find((i) => i.id === id)!
    target.status = status
    return { ...target }
  })
}))

import { useSessionIntentStore } from './sessionIntentStore'

function draft(overrides: Partial<SessionIntentDraft> = {}): SessionIntentDraft {
  return {
    goalId: null,
    plannedDate: '2026-06-29',
    sessionType: 'Easy + Strides',
    title: '이지 + 스트라이드',
    why: '',
    targets: { hrCeilingBpm: 150, hrRange: [138, 150], rpeRange: [3, 6], paceHold: '편안한 페이스' },
    successCriteria: [],
    source: 'coach',
    ...overrides
  }
}

describe('sessionIntentStore.ensureIntentFor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    store = []
    seq = 0
  })

  it('creates an intent when none exists for the day', async () => {
    const s = useSessionIntentStore()
    const made = await s.ensureIntentFor(draft())
    expect(made?.sessionType).toBe('Easy + Strides')
    expect(s.pendingIntents).toHaveLength(1)
  })

  it('returns the same planned intent when the session type is unchanged (idempotent)', async () => {
    const s = useSessionIntentStore()
    const first = await s.ensureIntentFor(draft())
    const second = await s.ensureIntentFor(draft())
    expect(second?.id).toBe(first?.id)
    expect(s.pendingIntents).toHaveLength(1)
  })

  // 핵심 회귀(#473 후속): 복귀 램프가 "Easy + Strides"→"Easy" 로 세션 타입을 낮춘 뒤
  // 같은 날 의도를 다시 ensure 하면, 옛 planned 의도는 superseded 로 내려가고
  // 새 "Easy" 의도가 생성돼야 한다(디브리핑이 폐기된 처방으로 채점·표시되는 화석 제거).
  it('supersedes a stale planned intent and recreates it when the session type changed', async () => {
    const s = useSessionIntentStore()
    const stale = await s.ensureIntentFor(draft({ sessionType: 'Easy + Strides', title: '이지 + 스트라이드' }))
    const fresh = await s.ensureIntentFor(
      draft({
        sessionType: 'Easy',
        title: '이지',
        targets: { hrCeilingBpm: 150, hrRange: [138, 150], rpeRange: [3, 5], paceHold: '편안한 페이스' }
      })
    )

    expect(fresh?.id).not.toBe(stale?.id)
    expect(fresh?.sessionType).toBe('Easy')
    // 옛 의도는 superseded 로 내려가 더 이상 매칭 후보(planned)가 아니다.
    const oldOne = s.intents.find((i) => i.id === stale?.id)
    expect(oldOne?.status).toBe('superseded')
    // 같은 날 planned 의도는 새 'Easy' 단 하나.
    expect(s.pendingIntents).toHaveLength(1)
    expect(s.pendingIntents[0]?.sessionType).toBe('Easy')
  })

  // (#723) 부상 심각도·상태가 바뀌면 타입은 그대로여도 why 문구가 낡는다. DB 에 why UPDATE 경로가
  // 없으므로 갱신 수단은 supersede→재생성뿐이다.
  it('supersedes and recreates when only the why text changed (부상 심각도 변경)', async () => {
    const s = useSessionIntentStore()
    const stale = await s.ensureIntentFor(draft({ why: '통증 4/5라 회복주나 휴식을 우선합니다.' }))
    const fresh = await s.ensureIntentFor(draft({ why: '통증 1/5로 가볍게 진행합니다.' }))

    expect(fresh?.id).not.toBe(stale?.id)
    expect(fresh?.why).toBe('통증 1/5로 가볍게 진행합니다.')
    expect(s.intents.find((i) => i.id === stale?.id)?.status).toBe('superseded')
    expect(s.pendingIntents).toHaveLength(1)
  })

  // 부상이 해소되면 문구가 통째로 사라진다 — 밴드에이드(숫자만 치환)가 못 고치던 바로 그 경우.
  it('부상 해소로 why 가 비어도 재생성한다', async () => {
    const s = useSessionIntentStore()
    const stale = await s.ensureIntentFor(draft({ why: '통증 3/5라 강도를 낮춥니다.' }))
    const fresh = await s.ensureIntentFor(draft({ why: '오늘 계획된 세션을 수행합니다.' }))

    expect(fresh?.id).not.toBe(stale?.id)
    expect(s.intents.find((i) => i.id === stale?.id)?.status).toBe('superseded')
  })

  // 멱등 가드: 재생성 후 같은 draft 로 다시 부르면 행이 늘지 않는다(#693 churn 방지).
  it('why 재생성은 1회로 수렴한다 — 같은 문구로 다시 부르면 그대로', async () => {
    const s = useSessionIntentStore()
    await s.ensureIntentFor(draft({ why: 'A' }))
    const regenerated = await s.ensureIntentFor(draft({ why: 'B' }))
    const again = await s.ensureIntentFor(draft({ why: 'B' }))

    expect(again?.id).toBe(regenerated?.id)
    expect(s.pendingIntents).toHaveLength(1)
    expect(s.intents).toHaveLength(2)
  })

  // 안전 가드: completed(런 매칭 끝난) 의도는 절대 건드리지 않는다 — 과거 디브리핑 소급 변조 금지.
  it('never touches a completed intent — only planned ones are re-synced', async () => {
    const s = useSessionIntentStore()
    const done = await s.ensureIntentFor(draft({ sessionType: 'Easy + Strides' }))
    // 매칭 완료로 전환(런이 점유).
    done!.status = 'completed'
    done!.runId = 'run-1'

    const made = await s.ensureIntentFor(draft({ sessionType: 'Easy', title: '이지' }))
    // completed 는 그대로 남고, 새 planned 가 별도로 생성된다(매칭 끝난 기록은 불변).
    expect(s.intents.find((i) => i.id === done?.id)?.status).toBe('completed')
    expect(made?.id).not.toBe(done?.id)
    expect(made?.sessionType).toBe('Easy')
  })
})

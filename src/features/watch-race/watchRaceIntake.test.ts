import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import type { RaceFinishInput } from '@/shared/lib/selfRace/raceResult'

/**
 * 워치 결과 인입(#552 Phase 3) — recordFinish 의 watchResultId 멱등 가드.
 * WCSession 재전송(ACK 유실)이 같은 결과를 두 번 올려도 보류는 1건이어야 한다.
 */

function watchFinish(overrides: Partial<RaceFinishInput> = {}): RaceFinishInput {
  return {
    racedAt: '2026-06-11T07:00:00.000Z',
    racedDistanceM: 5000,
    racedDurationSec: 1480,
    targetPb: { distanceM: 5000, elapsedSec: 1500, sourceRunId: 'pb-run' },
    finalGap: { timeGapSec: -20, leadState: 'ahead' },
    watchResultId: 'watch-uuid-1',
    ...overrides
  }
}

describe('competitionStore.recordFinish 워치 멱등 가드', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('같은 watchResultId 재전송은 이중 보류를 만들지 않는다', () => {
    const store = useCompetitionStore()
    store.recordFinish(watchFinish())
    store.recordFinish(watchFinish())
    expect(store.pending.length).toBe(1)
    expect(store.pending[0].watchResultId).toBe('watch-uuid-1')
    expect(store.pending[0].outcome).toBe('win')
    expect(store.pending[0].resultGapSec).toBe(-20)
  })

  it('다른 watchResultId 는 각각 보류된다', () => {
    const store = useCompetitionStore()
    store.recordFinish(watchFinish())
    store.recordFinish(watchFinish({ watchResultId: 'watch-uuid-2', racedAt: '2026-06-12T07:00:00.000Z' }))
    expect(store.pending.length).toBe(2)
  })

  it('watchResultId 없는 폰 레이스 경로는 기존 동작 그대로(가드 미적용)', () => {
    const store = useCompetitionStore()
    store.recordFinish(watchFinish({ watchResultId: undefined }))
    store.recordFinish(watchFinish({ watchResultId: undefined }))
    expect(store.pending.length).toBe(2)
    expect(store.pending[0].watchResultId).toBeUndefined()
  })

  it('타겟 없음(자유 TT) 워치 결과도 태깅 목적 보류를 만든다', () => {
    const store = useCompetitionStore()
    store.recordFinish(watchFinish({ targetPb: null, finalGap: null }))
    expect(store.pending.length).toBe(1)
    expect(store.pending[0].outcome).toBeNull()
    expect(store.pending[0].targetPb).toBeNull()
  })

  it('동시 linkPendingResults(워치 인입↔HK sync 경합) + 진행 중 recordFinish 에도 보류가 유실되지 않는다', async () => {
    const store = useCompetitionStore()
    store.recordFinish(watchFinish())
    // 직렬화 체인: 두 호출이 겹쳐 불려도(레이스 종료 시 실제 발생하는 경합) 한 번에 하나만 돈다.
    const first = store.linkPendingResults()
    const second = store.linkPendingResults()
    // 처리 비행 중 새 결과 도착 — '전체 치환' 쓰기에 지워지면 안 된다(신규 병합 보존).
    store.recordFinish(watchFinish({ watchResultId: 'watch-uuid-2', racedAt: '2026-06-12T07:00:00.000Z' }))
    await Promise.all([first, second])
    const ids = store.pending.map((p) => p.watchResultId).sort()
    // 매칭 런이 없으므로 둘 다 생존해야 정상.
    expect(ids).toEqual(['watch-uuid-1', 'watch-uuid-2'])
  })
})

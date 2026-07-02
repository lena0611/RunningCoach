import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { useWatchRaceStore } from '@/app/stores/watchRaceStore'
import {
  registerWatchRaceBridge,
  unregisterWatchRaceBridge,
  type WatchRaceResultPayload
} from './watchRaceBridge'

/**
 * 워치 결과 인입 파이프(#552 Phase 3) — 브리지 정규화 + store 처리 + ACK.
 * 시뮬 WCSession 데몬 계층은 이 환경에서 검증 불가(실기기 몫) — 웹 쪽 끝단을 결정론으로 고정한다.
 */

function payload(overrides: Partial<WatchRaceResultPayload> = {}): WatchRaceResultPayload {
  return {
    id: 'watch-uuid-1',
    racedAt: '2026-06-11T07:00:00.000Z',
    racedDistanceM: 5000,
    racedDurationSec: 1480,
    targetPb: { distanceM: 5000, elapsedSec: 1500, sourceRunId: 'pb-run' },
    finalGap: { timeGapSec: -20, leadState: 'ahead' },
    ...overrides
  }
}

describe('registerWatchRaceBridge 정규화', () => {
  const onResult = vi.fn()

  beforeEach(() => {
    onResult.mockClear()
    registerWatchRaceBridge({ onResult })
  })

  afterEach(() => {
    unregisterWatchRaceBridge()
  })

  it('정상 페이로드는 그대로 전달한다', () => {
    window.RunContextWatchRace!.receiveResult(payload())
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0]).toEqual(payload())
  })

  it('id/racedAt 가 깨진 페이로드는 버린다(ACK 없이 큐 보존)', () => {
    window.RunContextWatchRace!.receiveResult(payload({ id: '' }))
    window.RunContextWatchRace!.receiveResult(payload({ racedAt: 'not-a-date' }))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('손상된 targetPb/finalGap 은 null 로 강등한다(자유 TT 취급)', () => {
    window.RunContextWatchRace!.receiveResult(
      payload({
        targetPb: { distanceM: Number.NaN, elapsedSec: 1500, sourceRunId: 'pb-run' },
        finalGap: { timeGapSec: -20, leadState: 'sideways' as never }
      })
    )
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0].targetPb).toBeNull()
    expect(onResult.mock.calls[0][0].finalGap).toBeNull()
  })
})

describe('watchRaceStore.handleResult', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('보류 기록(watchResultId 포함) 후 중복 배달에도 1건 유지', async () => {
    const watchRaceStore = useWatchRaceStore()
    const competitionStore = useCompetitionStore()
    await watchRaceStore.handleResult(payload())
    await watchRaceStore.handleResult(payload()) // ACK 유실 재전송 시나리오
    expect(competitionStore.pending.length).toBe(1)
    expect(competitionStore.pending[0].watchResultId).toBe('watch-uuid-1')
    expect(competitionStore.pending[0].outcome).toBe('win')
  })

  it('매칭 런이 없어도 보류는 남는다(다음 HealthKit 동기화 재시도 계약)', async () => {
    const watchRaceStore = useWatchRaceStore()
    const competitionStore = useCompetitionStore()
    await watchRaceStore.handleResult(payload({ targetPb: null, finalGap: null }))
    expect(competitionStore.pending.length).toBe(1)
    expect(competitionStore.pending[0].targetPb).toBeNull()
  })
})

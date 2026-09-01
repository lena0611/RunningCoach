import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CrossTrainingSession } from '@/shared/api/crossTrainingRepository'

vi.mock('@/shared/api/supabase', () => ({ isSupabaseConfigured: true }))
vi.mock('@/shared/api/crossTrainingRepository', () => ({
  fetchCrossTrainingSessions: vi.fn(async () => []),
  insertCrossTrainingSessions: vi.fn(async () => []),
  deleteCrossTrainingSession: vi.fn(async () => {})
}))

import { useCrossTrainingStore } from './crossTrainingStore'

// (#739) 러닝 대체 운동. 이 스토어의 핵심 계약은 **러닝과 섞이지 않는 것**과
// **거리로 환산하지 않는 것**이다 — 검증된 종목 간 환산 공식이 없다.

function session(over: Partial<CrossTrainingSession> = {}): CrossTrainingSession {
  return {
    id: 'c1',
    externalId: 'wk-1',
    modality: 'cycling',
    indoor: true,
    date: '2026-09-01',
    startAt: null,
    endAt: null,
    durationSec: 2520, // 42분
    avgHeartRate: 128,
    maxHeartRate: 150,
    activeEnergyKcal: 310,
    rpe: null,
    source: 'healthkit',
    sourceName: 'Apple Watch',
    note: '',
    ...over
  }
}

describe('crossTrainingStore (#739)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('그날의 대체 운동을 날짜로 찾는다', () => {
    const s = useCrossTrainingStore()
    s.sessions = [session(), session({ id: 'c2', date: '2026-08-30' })]
    expect(s.byDate('2026-09-01').map((i) => i.id)).toEqual(['c1'])
  })

  it('기간 합계를 **분**으로 낸다 — 거리로 환산하지 않는다', () => {
    const s = useCrossTrainingStore()
    s.sessions = [
      session({ durationSec: 2520 }), // 42분
      session({ id: 'c2', date: '2026-09-02', durationSec: 1800 }) // 30분
    ]
    expect(s.totalMinutesBetween('2026-09-01', '2026-09-07')).toBe(72)
  })

  it('기간 밖 기록은 합계에서 빠진다', () => {
    const s = useCrossTrainingStore()
    s.sessions = [session({ date: '2026-08-25', durationSec: 3600 }), session({ id: 'c2', durationSec: 1800 })]
    expect(s.totalMinutesBetween('2026-09-01', '2026-09-07')).toBe(30)
  })

  it('시간이 없는 기록은 0분으로 흡수한다(합계를 깨뜨리지 않는다)', () => {
    const s = useCrossTrainingStore()
    s.sessions = [session({ durationSec: null }), session({ id: 'c2', durationSec: 1800 })]
    expect(s.totalMinutesBetween('2026-09-01', '2026-09-07')).toBe(30)
  })

  it('이미 저장된 워크아웃은 다시 넣지 않는다 — 사용자가 단 메모·RPE 를 덮어쓰면 안 된다', async () => {
    const repo = await import('@/shared/api/crossTrainingRepository')
    const s = useCrossTrainingStore()
    s.loaded = true
    s.sessions = [session({ externalId: 'wk-1' })]

    await s.ingestFromHealthKit([
      {
        externalId: 'wk-1',
        sourceName: 'Apple Watch',
        modality: 'cycling',
        indoor: true,
        date: '2026-09-01',
        startAt: '',
        endAt: '',
        durationSec: 2520,
        avgHeartRate: 128,
        maxHeartRate: 150,
        activeEnergyKcal: 310
      }
    ])
    expect(repo.insertCrossTrainingSessions).not.toHaveBeenCalled()
  })

  it('새 워크아웃만 저장 대상으로 올린다', async () => {
    const repo = await import('@/shared/api/crossTrainingRepository')
    const s = useCrossTrainingStore()
    s.loaded = true
    s.sessions = [session({ externalId: 'wk-1' })]

    await s.ingestFromHealthKit([
      { externalId: 'wk-1', sourceName: null, modality: 'cycling', indoor: true, date: '2026-09-01', startAt: '', endAt: '', durationSec: 2520, avgHeartRate: null, maxHeartRate: null, activeEnergyKcal: null },
      { externalId: 'wk-2', sourceName: null, modality: 'swimming', indoor: false, date: '2026-09-02', startAt: '', endAt: '', durationSec: 1800, avgHeartRate: null, maxHeartRate: null, activeEnergyKcal: null }
    ])
    const drafts = vi.mocked(repo.insertCrossTrainingSessions).mock.calls[0][0]
    expect(drafts.map((d) => d.externalId)).toEqual(['wk-2'])
    expect(drafts[0].source).toBe('healthkit')
  })
})

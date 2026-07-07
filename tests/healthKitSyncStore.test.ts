import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useToastStore } from '@/app/stores/toastStore'
import type { HealthKitRunCandidate } from '@/features/import-healthkit-run/healthKitBridge'

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

describe('healthKitSyncStore', () => {
  it('does not show a toast for activation sync with no changes', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()
    const toastStore = useToastStore()
    const show = vi.spyOn(toastStore, 'show')

    runStore.loaded = true
    syncStore.syncFeedbackMode = 'changes-only'

    await syncStore.handleRuns([])

    expect(syncStore.status).toBe('HealthKit 변화 없음 · 새 러닝 없음')
    expect(syncStore.lastCompletedAt).toBeGreaterThan(0)
    expect(syncStore.lastChangedAt).toBe(0)
    expect(show).not.toHaveBeenCalled()
  })

  it('marks real inserted HealthKit runs as changes and shows the sync toast', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()
    const memoryStore = useMemoryStore()
    const toastStore = useToastStore()
    const show = vi.spyOn(toastStore, 'show')

    runStore.loaded = true
    syncStore.syncFeedbackMode = 'changes-only'

    await syncStore.handleRuns([createCandidate({
      externalId: 'hk-2026-05-30',
      date: '2026-05-30',
      startAt: '2026-05-30T06:00:00.000Z',
      endAt: '2026-05-30T06:40:00.000Z'
    })])

    expect(runStore.runs).toHaveLength(1)
    expect(runStore.runs[0].userId).toBe(memoryStore.selectedUserId)
    expect(syncStore.status).toContain('새 러닝 1개 저장')
    expect(syncStore.lastChangedAt).toBeGreaterThan(0)
    expect(show).toHaveBeenCalledWith(expect.stringContaining('새 러닝 1개 저장'), 'success', expect.objectContaining({
      placement: 'top'
    }))
  })

  it('deny-list 의 externalId 후보는 handleRuns 에서 재삽입되지 않는다 (#235 후속 G3)', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()

    runStore.loaded = true
    runStore.deniedExternalIds = ['hk-denied']
    syncStore.syncFeedbackMode = 'changes-only'

    await syncStore.handleRuns([createCandidate({
      externalId: 'hk-denied',
      date: '2026-05-31',
      startAt: '2026-05-31T06:00:00.000Z',
      endAt: '2026-05-31T06:40:00.000Z'
    })])

    expect(runStore.runs).toHaveLength(0)
  })

  it('최근 저장일과 같은 날 새 러닝(오늘 2번째)도 유입된다 (healthkit-sync-sameday-miss)', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()
    runStore.loaded = true
    syncStore.syncFeedbackMode = 'changes-only'

    // 오전 러닝 저장 → 최근 저장일 = 오늘
    await syncStore.handleRuns([createCandidate({
      externalId: 'hk-morning',
      date: '2026-06-02',
      startAt: '2026-06-02T00:00:00.000Z',
      endAt: '2026-06-02T00:30:00.000Z'
    })])
    expect(runStore.runs).toHaveLength(1)

    // 저녁 러닝(같은 날, 다른 externalId) → strict `>`면 누락되던 케이스. `>=` 로 유입돼야 한다.
    await syncStore.handleRuns([createCandidate({
      externalId: 'hk-evening',
      date: '2026-06-02',
      startAt: '2026-06-02T10:00:00.000Z',
      endAt: '2026-06-02T10:40:00.000Z'
    })])

    expect(runStore.runs).toHaveLength(2)
    expect(runStore.runs.some((run) => run.externalId === 'hk-evening')).toBe(true)
  })

  it('isSelfRace 후보는 handleRuns 유입 시 self-race 태그가 붙는다 (#235 후속 G1)', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()

    runStore.loaded = true
    syncStore.syncFeedbackMode = 'changes-only'

    await syncStore.handleRuns([createCandidate({
      externalId: 'hk-race',
      date: '2026-06-01',
      startAt: '2026-06-01T06:00:00.000Z',
      endAt: '2026-06-01T06:10:00.000Z',
      isSelfRace: true
    })])

    expect(runStore.runs).toHaveLength(1)
    expect(runStore.runs[0].tags).toContain('self-race')
  })
})

function createCandidate(overrides: Partial<HealthKitRunCandidate> = {}): HealthKitRunCandidate {
  return {
    externalId: 'hk-run',
    sourceName: 'Apple Watch',
    date: '2026-05-30',
    startAt: '2026-05-30T06:00:00.000Z',
    endAt: '2026-05-30T06:40:00.000Z',
    durationSec: 2400,
    distanceKm: 5,
    avgPaceSec: 480,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    rpe: null,
    routeAvailable: false,
    laps: [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    rawAvailability: {
      workout: true,
      heartRate: false,
      route: false,
      cadence: false,
      runningDynamics: false
    },
    isSelfRace: false,
    ...overrides
  }
}

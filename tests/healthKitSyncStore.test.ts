import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useToastStore } from '@/app/stores/toastStore'
import type { HealthKitRunCandidate } from '@/features/import-healthkit-run/healthKitBridge'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('healthKitSyncStore', () => {
  it('does not show a toast for silent activation sync with no changes', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()
    const toastStore = useToastStore()
    const show = vi.spyOn(toastStore, 'show')

    runStore.loaded = true
    syncStore.syncFeedbackMode = 'silent'

    await syncStore.handleRuns([])

    expect(syncStore.status).toBe('HealthKit 변화 없음 · 새 러닝 없음')
    expect(syncStore.lastCompletedAt).toBeGreaterThan(0)
    expect(syncStore.lastChangedAt).toBe(0)
    expect(show).not.toHaveBeenCalled()
  })

  it('marks real inserted HealthKit runs as changes without showing activation toast', async () => {
    const syncStore = useHealthKitSyncStore()
    const runStore = useRunStore()
    const memoryStore = useMemoryStore()
    const toastStore = useToastStore()
    const show = vi.spyOn(toastStore, 'show')

    runStore.loaded = true
    syncStore.syncFeedbackMode = 'silent'

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
    expect(show).not.toHaveBeenCalled()
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
    ...overrides
  }
}

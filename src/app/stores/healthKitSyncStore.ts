import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useRunStore } from '@/app/stores/runStore'
import { useToastStore } from '@/app/stores/toastStore'
import {
  registerHealthKitBridge,
  requestHealthKitRuns,
  toExtractedRunData,
  unregisterHealthKitBridge,
  type HealthKitRunCandidate
} from '@/features/import-healthkit-run/healthKitBridge'
import { hasNativeBridge } from '@/shared/lib/runtime'

const defaultLookbackDays = 90
const maxLookbackDays = 365
const minSyncIntervalMs = 30_000
let listenersAttached = false

export const useHealthKitSyncStore = defineStore('healthKitSyncStore', {
  state: () => ({
    initialized: false,
    syncing: false,
    status: '',
    error: '',
    lastRequestedAt: 0,
    lastCompletedAt: 0
  }),
  actions: {
    init() {
      if (this.initialized) return
      registerHealthKitBridge({
        onRuns: (runs) => void this.handleRuns(runs),
        onError: (message) => this.handleError(message)
      })
      this.initialized = true
    },
    dispose() {
      unregisterHealthKitBridge()
      this.initialized = false
    },
    attachActivationListeners() {
      if (listenersAttached) return
      listenersAttached = true

      window.addEventListener('focus', () => void this.syncAfterActivation())
      window.addEventListener('pageshow', () => void this.syncAfterActivation())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.syncAfterActivation()
      })
    },
    async syncAfterActivation() {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return
      const now = Date.now()
      if (this.syncing || now - this.lastRequestedAt < minSyncIntervalMs) return
      await this.requestSync()
    },
    async requestSync() {
      this.init()
      const authStore = useAuthStore()
      const runStore = useRunStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return

      if (!runStore.loaded && !runStore.loading) {
        await runStore.load()
      }

      this.syncing = true
      this.error = ''
      this.status = 'HealthKit 동기화 중'
      this.lastRequestedAt = Date.now()

      try {
        requestHealthKitRuns(getLookbackDays(getLatestSavedDate()))
      } catch (err) {
        this.syncing = false
        this.status = ''
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 요청 실패'
      }
    },
    async handleRuns(runs: HealthKitRunCandidate[]) {
      const runStore = useRunStore()
      try {
        if (!runStore.loaded && !runStore.loading) {
          await runStore.load()
        }

        const latestDate = getLatestSavedDate()
        const newRuns = runs
          .filter((candidate) => isAfterLatestSaved(candidate, latestDate))
          .filter((candidate) => !isAlreadySaved(candidate))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt))

        if (newRuns.length) {
          const inserted = await runStore.addRuns(newRuns.map((candidate) => toExtractedRunData(candidate)), 'healthkit')
          this.status = `HealthKit 동기화 완료 · 새 러닝 ${inserted.length}개 저장`
          useToastStore().success(this.status)
        } else {
          this.status = latestDate
            ? `HealthKit 동기화 완료 · ${latestDate} 이후 새 러닝 없음`
            : 'HealthKit 동기화 완료 · 새 러닝 없음'
          useToastStore().success(this.status)
        }
        this.error = ''
        this.lastCompletedAt = Date.now()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 저장 실패'
        useToastStore().error(this.error)
      } finally {
        this.syncing = false
      }
    },
    handleError(message: string) {
      this.syncing = false
      this.status = ''
      this.error = message || 'HealthKit 동기화 실패'
      useToastStore().error(this.error)
    }
  }
})

function getLatestSavedDate() {
  const runStore = useRunStore()
  return runStore.sortedRuns[0]?.date ?? null
}

function getLookbackDays(latestDate: string | null) {
  if (!latestDate) return defaultLookbackDays
  const latest = parseDateOnly(latestDate)
  if (!Number.isFinite(latest.getTime())) return defaultLookbackDays
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((today.getTime() - latest.getTime()) / 86400000) + 1
  return Math.min(Math.max(diffDays, 1), maxLookbackDays)
}

function isAfterLatestSaved(candidate: HealthKitRunCandidate, latestDate: string | null) {
  return !latestDate || candidate.date > latestDate
}

function isAlreadySaved(candidate: HealthKitRunCandidate) {
  const runStore = useRunStore()
  return runStore.runs.some((run) => {
    if (run.externalId && run.externalId === candidate.externalId) return true
    return (
      run.source === 'healthkit' &&
      run.date === candidate.date &&
      run.distanceKm === (candidate.distanceKm ?? 0) &&
      run.durationSec === candidate.durationSec
    )
  })
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { useToastStore } from '@/app/stores/toastStore'
import type { RunLog } from '@/entities/run/model'
import {
  registerHealthKitBridge,
  requestHealthKitRuns,
  requestHealthKitRunUpdate,
  toExtractedRunData,
  unregisterHealthKitBridge,
  type HealthKitRunCandidate
} from '@/features/import-healthkit-run/healthKitBridge'
import { mergeHealthKitRefreshRun } from '@/features/import-healthkit-run/mergeHealthKitRefreshRun'
import { notifyHealthKitNewRuns } from '@/features/sync-native-notifications/notificationBridge'
import { hasNativeBridge } from '@/shared/lib/runtime'

const defaultLookbackDays = 90
const maxLookbackDays = 365
const minSyncIntervalMs = 30_000
const syncToastDelayMs = 900
let listenersAttached = false

export const useHealthKitSyncStore = defineStore('healthKitSyncStore', {
  state: () => ({
    initialized: false,
    syncing: false,
    refreshingRunId: '',
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
        onRunUpdate: (run) => void this.handleRunUpdate(run),
        onError: (message) => this.handleError(message),
        onRunUpdateError: (externalId, message) => this.handleRunUpdateError(externalId, message)
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
      if (!authStore.isAuthenticated || !hasNativeBridge()) return

      const requestedAt = Date.now()
      this.syncing = true
      this.error = ''
      this.status = 'HealthKit 동기화 중'
      this.lastRequestedAt = requestedAt

      try {
        await ensureRunStoreLoaded()
        requestHealthKitRuns(getLookbackDays(getLatestSavedDate()))
      } catch (err) {
        this.syncing = false
        this.status = ''
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 요청 실패'
        showSyncToast('error', this.error, 4200)
      }
    },
    async requestRunRefresh(run: RunLog) {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return
      if (!canRequestHealthKitRefresh(run)) {
        this.error = 'HealthKit으로 갱신할 수 있는 세션 정보가 부족합니다.'
        showSyncToast('error', this.error, 3600)
        return
      }

      this.refreshingRunId = run.id
      this.error = ''
      this.status = 'HealthKit 세션 갱신 중'

      try {
        requestHealthKitRunUpdate({
          externalId: run.externalId,
          date: run.date,
          startAt: null,
          endAt: null,
          distanceKm: run.distanceKm,
          durationSec: run.durationSec
        })
      } catch (err) {
        this.refreshingRunId = ''
        this.status = ''
        this.error = err instanceof Error ? err.message : 'HealthKit 세션 갱신 요청 실패'
        showSyncToast('error', this.error, 4200)
      }
    },
    async handleRuns(runs: HealthKitRunCandidate[]) {
      const runStore = useRunStore()
      try {
        await ensureRunStoreLoaded()

        const latestDate = getLatestSavedDate()
        const memoryStore = useMemoryStore()
        const repaired = await repairExistingHealthKitRuns(runs, memoryStore.memory.weeklyPattern)
        const newRuns = runs
          .filter((candidate) => isAfterLatestSaved(candidate, latestDate))
          .filter((candidate) => !isAlreadySaved(candidate))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt))

        if (newRuns.length) {
          const inserted = await runStore.addRuns(newRuns.map((candidate) => toExtractedRunData(candidate, memoryStore.memory.weeklyPattern)), 'healthkit')
          notifyHealthKitNewRuns(useSettingsStore().notificationSettings, inserted.length)
          const skipped = newRuns.length - inserted.length
          const repairText = repaired.length ? ` · 기존 ${repaired.length}개 보강` : ''
          this.status = skipped > 0
            ? `HealthKit 동기화 완료 · 새 러닝 ${inserted.length}개 저장 · 중복 ${skipped}개 제외${repairText}`
            : `HealthKit 동기화 완료 · 새 러닝 ${inserted.length}개 저장${repairText}`
          showSyncToast('success', this.status, 3600)
        } else if (repaired.length) {
          this.status = `HealthKit 동기화 완료 · 기존 러닝 ${repaired.length}개 보강`
          showSyncToast('success', this.status, 3200)
        } else {
          this.status = latestDate
            ? `HealthKit 변화 없음 · ${latestDate} 이후 새 러닝 없음`
            : 'HealthKit 변화 없음 · 새 러닝 없음'
          showSyncToast('neutral', this.status, 2600)
        }
        this.error = ''
        this.lastCompletedAt = Date.now()
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 저장 실패'
        showSyncToast('error', this.error, 4200)
      } finally {
        this.syncing = false
      }
    },
    handleError(message: string) {
      this.syncing = false
      this.status = ''
      this.error = message || 'HealthKit 동기화 실패'
      showSyncToast('error', this.error, 4200)
    },
    async handleRunUpdate(candidate: HealthKitRunCandidate) {
      const runStore = useRunStore()
      try {
        await ensureRunStoreLoaded()
        const target = findRefreshTargetRun(candidate, this.refreshingRunId)
        if (!target) throw new Error('갱신할 RunLog를 찾지 못했습니다.')

        const memoryStore = useMemoryStore()
        const extracted = toExtractedRunData(candidate, memoryStore.memory.weeklyPattern)
        const updated = await runStore.updateRun(mergeHealthKitRefreshRun(target, extracted))
        this.status = `${updated.date} HealthKit 세션 갱신 완료`
        this.error = ''
        showSyncToast('success', this.status, 3200)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'HealthKit 세션 갱신 저장 실패'
        showSyncToast('error', this.error, 4200)
      } finally {
        this.refreshingRunId = ''
      }
    },
    handleRunUpdateError(externalId: string | null, message: string) {
      const runStore = useRunStore()
      const target = externalId ? runStore.runs.find((run) => run.externalId === externalId) : null
      if (!target || this.refreshingRunId === target.id) this.refreshingRunId = ''
      this.status = ''
      this.error = message || 'HealthKit 세션 갱신 실패'
      showSyncToast('error', this.error, 4200)
    }
  }
})

function canRequestHealthKitRefresh(run: RunLog) {
  if (run.externalId) return true
  return run.source === 'healthkit' && Boolean(run.date) && run.distanceKm > 0
}

function findRefreshTargetRun(candidate: HealthKitRunCandidate, refreshingRunId: string) {
  const runStore = useRunStore()
  if (refreshingRunId) {
    const target = runStore.runs.find((run) => run.id === refreshingRunId)
    if (target) return target
  }
  return runStore.runs.find((run) => run.externalId === candidate.externalId) ?? null
}

function showSyncToast(tone: 'neutral' | 'success' | 'error', message: string, durationMs: number) {
  const toastStore = useToastStore()
  toastStore.show(message, tone, {
    durationMs,
    placement: 'top',
    delayMs: syncToastDelayMs
  })
}

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

async function repairExistingHealthKitRuns(candidates: HealthKitRunCandidate[], weeklyPattern: string[]) {
  const runStore = useRunStore()
  const repaired: RunLog[] = []
  for (const candidate of candidates) {
    const target = findRepairableHealthKitRun(candidate)
    if (!target) continue
    const extracted = toExtractedRunData(candidate, weeklyPattern)
    const updated = await runStore.updateRun({
      ...target,
      externalId: extracted.externalId ?? target.externalId,
      type: target.tags.includes('type:user') || extracted.type === 'Unknown' ? target.type : extracted.type,
      distanceKm: extracted.distanceKm || target.distanceKm,
      durationSec: extracted.durationSec ?? target.durationSec,
      avgPaceSec: extracted.avgPaceSec ?? target.avgPaceSec,
      avgHeartRate: extracted.avgHeartRate ?? target.avgHeartRate,
      maxHeartRate: extracted.maxHeartRate ?? target.maxHeartRate,
      cadence: extracted.cadence ?? target.cadence,
      activeEnergyKcal: extracted.activeEnergyKcal ?? target.activeEnergyKcal,
      elevationGainM: extracted.elevationGainM ?? target.elevationGainM,
      elevationLossM: extracted.elevationLossM ?? target.elevationLossM,
      courseType: extracted.courseType === 'Unknown' ? target.courseType : extracted.courseType,
      laps: extracted.laps.length ? extracted.laps : target.laps,
      fastSegments: extracted.fastSegments?.length ? extracted.fastSegments : target.fastSegments,
      metricSamples: extracted.metricSamples?.length ? extracted.metricSamples : target.metricSamples,
      routePoints: extracted.routePoints?.length ? extracted.routePoints : target.routePoints,
      tags: mergeHealthKitRepairTags(target.tags ?? []),
      source: 'healthkit'
    })
    repaired.push(updated)
  }
  return repaired
}

function mergeHealthKitRepairTags(tags: string[]) {
  if (tags.includes('type:user')) {
    return Array.from(new Set([...tags.filter((tag) => tag !== 'type:auto'), 'healthkit', 'healthkit-repaired']))
  }
  return Array.from(new Set([...tags.filter((tag) => tag !== 'type:user'), 'healthkit', 'healthkit-repaired', 'type:auto']))
}

function findRepairableHealthKitRun(candidate: HealthKitRunCandidate) {
  const runStore = useRunStore()
  return runStore.runs.find((run) => {
    if (run.externalId || run.source !== 'healthkit') return false
    return isSameWorkoutLike(run, candidate)
  }) ?? null
}

function isSameWorkoutLike(run: RunLog, candidate: HealthKitRunCandidate) {
  const distanceKm = candidate.distanceKm ?? 0
  const durationSec = candidate.durationSec ?? null
  const distanceClose = Math.abs(run.distanceKm - distanceKm) <= 0.03
  const durationClose = run.durationSec !== null && durationSec !== null
    ? Math.abs(run.durationSec - durationSec) <= 8
    : true
  return run.date === candidate.date && distanceClose && durationClose
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

async function ensureRunStoreLoaded() {
  const runStore = useRunStore()
  if (runStore.loaded) return
  if (!runStore.loading) {
    await runStore.load()
    return
  }

  await new Promise<void>((resolve) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (!runStore.loading || runStore.loaded || Date.now() - startedAt > 5000) {
        window.clearInterval(timer)
        resolve()
      }
    }, 80)
  })
}

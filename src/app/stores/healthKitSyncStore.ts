import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { useToastStore } from '@/app/stores/toastStore'
import type { RunLog } from '@/entities/run/model'
import {
  registerHealthKitBridge,
  requestHealthKitRuns,
  requestHealthKitRunsInRange,
  requestHealthKitRunUpdate,
  requestLatestVo2Max,
  toExtractedRunData,
  unregisterHealthKitBridge,
  type HealthKitRunCandidate,
  type HealthKitVo2MaxSample
} from '@/features/import-healthkit-run/healthKitBridge'
import { mergeHealthKitRefreshRun } from '@/features/import-healthkit-run/mergeHealthKitRefreshRun'
import { notifyHealthKitNewRuns } from '@/features/sync-native-notifications/notificationBridge'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { deriveHeartRateModel, deriveObservedMaxHr, type HeartRateModel } from '@/shared/lib/heartRateZones'

const defaultLookbackDays = 90
const maxLookbackDays = 365
const minSyncIntervalMs = 30_000
const syncToastDelayMs = 900
let listenersAttached = false
type SyncFeedbackMode = 'changes-only' | 'toast'
type HistoricalMigrationRange = { startDate: string; endDate: string }

export const useHealthKitSyncStore = defineStore('healthKitSyncStore', {
  state: () => ({
    initialized: false,
    syncing: false,
    refreshingRunId: '',
    status: '',
    error: '',
    lastRequestedAt: 0,
    lastCompletedAt: 0,
    lastChangedAt: 0,
    syncFeedbackMode: 'toast' as SyncFeedbackMode,
    historicalMigrationRange: null as HistoricalMigrationRange | null,
    vo2MaxRequesting: false,
    lastVo2MaxAt: 0,
    lastVo2MaxSample: null as HealthKitVo2MaxSample | null
  }),
  actions: {
    init() {
      if (this.initialized) return
      registerHealthKitBridge({
        onRuns: (runs) => void this.handleRuns(runs),
        onRunUpdate: (run) => void this.handleRunUpdate(run),
        onHealthKitChanged: () => void this.syncAfterNativeChange(),
        onError: (message) => this.handleError(message),
        onRunUpdateError: (externalId, message) => this.handleRunUpdateError(externalId, message),
        onVo2Max: (sample) => void this.handleVo2Max(sample),
        onVo2MaxError: (message) => this.handleVo2MaxError(message)
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
      await this.requestSync({ feedback: 'changes-only' })
    },
    async syncAfterNativeChange() {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge() || this.syncing) return
      await this.requestSync({ feedback: 'changes-only' })
    },
    async requestSync(options: { feedback?: SyncFeedbackMode } = {}) {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return

      const requestedAt = Date.now()
      this.syncing = true
      this.error = ''
      this.status = 'HealthKit 동기화 중'
      this.lastRequestedAt = requestedAt
      this.syncFeedbackMode = options.feedback ?? 'toast'

      try {
        await ensureRunStoreLoaded()
        requestHealthKitRuns(getLookbackDays(getLatestSavedDate()))
      } catch (err) {
        this.syncing = false
        this.status = ''
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 요청 실패'
        if (this.syncFeedbackMode === 'toast') showSyncToast('error', this.error, 4200)
        this.syncFeedbackMode = 'toast'
      }
    },
    async requestHistoricalMigration(startDate: string, endDate: string) {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return
      if (this.syncing) return

      const range = normalizeHistoricalMigrationRange(startDate, endDate)
      this.syncing = true
      this.error = ''
      this.status = `HealthKit 과거 기록 마이그레이션 요청 중 · ${formatRange(range)}`
      this.historicalMigrationRange = range
      this.lastRequestedAt = Date.now()

      try {
        await ensureRunStoreLoaded()
        requestHealthKitRunsInRange(range)
      } catch (err) {
        this.syncing = false
        this.historicalMigrationRange = null
        this.status = ''
        this.error = err instanceof Error ? err.message : 'HealthKit 과거 기록 마이그레이션 요청 실패'
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
          startAt: run.startAt,
          endAt: run.endAt,
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
      if (this.historicalMigrationRange) {
        await this.handleHistoricalMigrationRuns(runs, this.historicalMigrationRange)
        return
      }

      const runStore = useRunStore()
      try {
        await ensureRunStoreLoaded()

        const latestDate = getLatestSavedDate()
        const memoryStore = useMemoryStore()
        const heartRateModel = buildInferenceHeartRateModel()
        const repaired = await repairExistingHealthKitRuns(runs, memoryStore.memory.weeklyPattern, heartRateModel)
        const newRuns = runs
          .filter((candidate) => isAfterLatestSaved(candidate, latestDate))
          .filter((candidate) => !isAlreadySaved(candidate))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt))

        if (newRuns.length) {
          const inserted = await runStore.addRuns(newRuns.map((candidate) => toExtractedRunData(candidate, memoryStore.memory.weeklyPattern, heartRateModel)), 'healthkit')
          const insertedCount = inserted.length
          notifyHealthKitNewRuns(useSettingsStore().notificationSettings, insertedCount)
          const skipped = newRuns.length - insertedCount
          const repairText = repaired.length ? ` · 기존 ${repaired.length}개 보강` : ''
          if (insertedCount > 0) {
            this.status = skipped > 0
              ? `HealthKit 동기화 완료 · 새 러닝 ${insertedCount}개 저장 · 중복 ${skipped}개 제외${repairText}`
              : `HealthKit 동기화 완료 · 새 러닝 ${insertedCount}개 저장${repairText}`
            this.lastChangedAt = Date.now()
            showSyncToast('success', this.status, 3600)
          } else if (repaired.length) {
            this.status = `HealthKit 동기화 완료 · 기존 러닝 ${repaired.length}개 보강 · 중복 ${skipped}개 제외`
            this.lastChangedAt = Date.now()
            showSyncToast('success', this.status, 3200)
          } else {
            this.status = `HealthKit 변화 없음 · 중복 ${skipped}개 제외`
            if (this.syncFeedbackMode === 'toast') showSyncToast('neutral', this.status, 2600)
          }
        } else if (repaired.length) {
          this.status = `HealthKit 동기화 완료 · 기존 러닝 ${repaired.length}개 보강`
          this.lastChangedAt = Date.now()
          showSyncToast('success', this.status, 3200)
        } else {
          this.status = latestDate
            ? `HealthKit 변화 없음 · ${latestDate} 이후 새 러닝 없음`
            : 'HealthKit 변화 없음 · 새 러닝 없음'
          if (this.syncFeedbackMode === 'toast') showSyncToast('neutral', this.status, 2600)
        }
        this.error = ''
        this.lastCompletedAt = Date.now()
        await linkSelfRaceResults() // 가상레이싱 보류 결과 ↔ 정본 RunLog 근접 매칭(#233)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'HealthKit 동기화 저장 실패'
        if (this.syncFeedbackMode === 'toast') showSyncToast('error', this.error, 4200)
      } finally {
        this.syncing = false
        this.syncFeedbackMode = 'toast'
      }
    },
    async handleHistoricalMigrationRuns(runs: HealthKitRunCandidate[], range: HistoricalMigrationRange) {
      const runStore = useRunStore()
      try {
        await ensureRunStoreLoaded()

        const memoryStore = useMemoryStore()
        const rangeRuns = runs
          .filter((candidate) => isWithinRange(candidate, range))
          .sort((a, b) => a.date.localeCompare(b.date) || a.startAt.localeCompare(b.startAt))
        const heartRateModel = buildInferenceHeartRateModel()
        const repaired = await repairExistingHealthKitRuns(rangeRuns, memoryStore.memory.weeklyPattern, heartRateModel)
        const newRuns = rangeRuns.filter((candidate) => !isAlreadySaved(candidate))

        const inserted = await runStore.addRuns(newRuns.map((candidate) => toExtractedRunData(candidate, memoryStore.memory.weeklyPattern, heartRateModel)), 'healthkit')
        const skipped = Math.max(0, rangeRuns.length - inserted.length - repaired.length)
        const outsideRange = Math.max(0, runs.length - rangeRuns.length)
        const parts = [
          `저장 ${inserted.length}개`,
          skipped ? `중복 ${skipped}개 제외` : '',
          repaired.length ? `기존 ${repaired.length}개 보강` : '',
          outsideRange ? `범위 밖 ${outsideRange}개 무시` : ''
        ].filter(Boolean)
        this.status = `HealthKit 과거 기록 마이그레이션 완료 · ${formatRange(range)} · ${parts.join(' · ')}`
        this.error = ''
        this.lastCompletedAt = Date.now()
        await linkSelfRaceResults() // 가상레이싱 보류 결과 ↔ 정본 RunLog 근접 매칭(#233)
        showSyncToast('success', this.status, 4200)
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'HealthKit 과거 기록 마이그레이션 저장 실패'
        this.status = ''
        showSyncToast('error', this.error, 4200)
      } finally {
        this.historicalMigrationRange = null
        this.syncing = false
        this.syncFeedbackMode = 'toast'
      }
    },
    handleError(message: string) {
      this.syncing = false
      this.historicalMigrationRange = null
      this.status = ''
      this.error = message || 'HealthKit 동기화 실패'
      if (this.syncFeedbackMode === 'toast') showSyncToast('error', this.error, 4200)
      this.syncFeedbackMode = 'toast'
    },
    async handleRunUpdate(candidate: HealthKitRunCandidate) {
      const runStore = useRunStore()
      try {
        await ensureRunStoreLoaded()
        const target = findRefreshTargetRun(candidate, this.refreshingRunId)
        if (!target) throw new Error('갱신할 RunLog를 찾지 못했습니다.')

        const memoryStore = useMemoryStore()
        const extracted = toExtractedRunData(candidate, memoryStore.memory.weeklyPattern, buildInferenceHeartRateModel())
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
    },
    // 프로필 화면의 'VO2max 갱신' 버튼이 호출한다. 네이티브가 receiveVo2Max로 응답한다.
    requestVo2Max() {
      this.init()
      try {
        this.vo2MaxRequesting = true
        requestLatestVo2Max()
      } catch (err) {
        this.vo2MaxRequesting = false
        showSyncToast('error', err instanceof Error ? err.message : 'VO2max 조회 요청 실패', 4200)
      }
    },
    // 받은 샘플은 state에만 둔다. 프로필 화면이 watch해서 draft에 채우고, 사용자가 저장할 때 영속화한다.
    // (여기서 바로 memory.update를 하면 프로필 편집 중인 draft가 초기화될 수 있다.)
    handleVo2Max(sample: HealthKitVo2MaxSample) {
      this.vo2MaxRequesting = false
      this.lastVo2MaxSample = sample
      this.lastVo2MaxAt = Date.now()
      if (sample.value === null) {
        showSyncToast('neutral', 'HealthKit에 VO2max(심폐 체력) 기록이 아직 없습니다.', 3600)
        return
      }
      showSyncToast('success', `VO2max ${sample.value} mL/kg·min 불러옴 · 저장을 눌러 반영`, 3600)
    },
    handleVo2MaxError(message: string) {
      this.vo2MaxRequesting = false
      showSyncToast('error', message || 'HealthKit VO2max 조회 실패', 4200)
    }
  }
})

// 가상레이싱 종료 후 보류된 결과를 방금 동기화된 RunLog 와 매칭해 'self-race' 태깅 + 결과 생성한다.
// 매칭 실패/없음은 정상(다음 동기화 재시도)이며 HealthKit 동기화 상태에는 영향을 주지 않는다.
async function linkSelfRaceResults() {
  try {
    await useCompetitionStore().linkPendingResults()
  } catch {
    // 매칭 단계 오류는 동기화 결과 보고와 분리한다.
  }
}

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

function isWithinRange(candidate: HealthKitRunCandidate, range: HistoricalMigrationRange) {
  return candidate.date >= range.startDate && candidate.date <= range.endDate
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

// 자동 유형 판정용 개인 심박 모델. 누적 RunLog 관측 최대심박으로 나이 추정을 보정한다.
function buildInferenceHeartRateModel(): HeartRateModel {
  const memoryStore = useMemoryStore()
  const runStore = useRunStore()
  const observed = deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  return deriveHeartRateModel(memoryStore.memory.athleteProfile, new Date().getFullYear(), observed)
}

async function repairExistingHealthKitRuns(candidates: HealthKitRunCandidate[], weeklyPattern: string[], heartRateModel: HeartRateModel | null = null) {
  const runStore = useRunStore()
  const repaired: RunLog[] = []
  for (const candidate of candidates) {
    const target = findRepairableHealthKitRun(candidate)
    if (!target) continue
    const extracted = toExtractedRunData(candidate, weeklyPattern, heartRateModel)
    const updated = await runStore.updateRun({
      ...target,
      externalId: extracted.externalId ?? target.externalId,
      startAt: extracted.startAt ?? target.startAt,
      endAt: extracted.endAt ?? target.endAt,
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

function normalizeHistoricalMigrationRange(startDate: string, endDate: string): HistoricalMigrationRange {
  const start = normalizeDateKey(startDate)
  const end = normalizeDateKey(endDate)
  if (!start || !end) throw new Error('마이그레이션 날짜 범위가 올바르지 않습니다.')
  if (start > end) throw new Error('마이그레이션 시작일이 종료일보다 늦습니다.')
  return { startDate: start, endDate: end }
}

function normalizeDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = parseDateOnly(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const normalized = `${year}-${month}-${day}`
  return normalized === value ? normalized : ''
}

function formatRange(range: HistoricalMigrationRange) {
  return `${range.startDate}~${range.endDate}`
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

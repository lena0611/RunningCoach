import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { SELF_RACE_TAG } from '@/entities/competition/model'
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
import { friendlyErrorMessage } from '@/shared/lib/friendlyError'
import { deriveHeartRateModel, deriveObservedMaxHr, type HeartRateModel } from '@/shared/lib/heartRateZones'
import { computeTempoCeilingAdaptation } from '@/shared/lib/coaching/tempoAdaptation'
import { getActiveInjuryItem } from '@/entities/training-memory/model'

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
        this.error = friendlyErrorMessage(err, 'HealthKit 동기화 요청 실패')
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
        this.error = friendlyErrorMessage(err, 'HealthKit 과거 기록 마이그레이션 요청 실패')
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
        this.error = friendlyErrorMessage(err, 'HealthKit 세션 갱신 요청 실패')
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
        await applyTempoCeilingAdaptation() // Tempo 상한 적응 채택값 영속화(#301)
      } catch (err) {
        this.error = friendlyErrorMessage(err, 'HealthKit 동기화 저장 실패')
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
        // (#235 후속 G3) 과거 마이그레이션은 "사용자가 기간을 직접 골라 다시 부른" 의사 → deny-list 를 무시·해제한다
        // ("자동 재유입은 막되, 직접 다시 부르면 허용"). 범위 내 deny 된 externalId 를 풀어 재유입을 허용한다.
        await releaseDeniedForCandidates(rangeRuns)
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
        await applyTempoCeilingAdaptation() // Tempo 상한 적응 채택값 영속화(#301)
        showSyncToast('success', this.status, 4200)
      } catch (err) {
        this.error = friendlyErrorMessage(err, 'HealthKit 과거 기록 마이그레이션 저장 실패')
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
        this.error = friendlyErrorMessage(err, 'HealthKit 세션 갱신 저장 실패')
        showSyncToast('error', this.error, 4200)
      } finally {
        this.refreshingRunId = ''
      }
    },
    // #235: 레이싱 종료 후 네이티브가 HealthKit에 저장한 운동을 '단건'으로 RunLog에 유입한다.
    // requestSync(전체)는 isAfterLatestSaved의 `date > latestDate` strict 필터 때문에 '오늘 이미
    // 기록이 있으면' 같은 날 레이싱을 누락한다(Codex 리뷰 #1). 그래서 그 externalId 1건만 날짜
    // 필터 없이 직접 추가하고, 중복은 isAlreadySaved(externalId 우선)로 막아 정기 sync와 멱등하게 둔다.
    async importCompetitionRun(payload: { externalId: string; distanceM: number; durationSec: number; startMs: number; endMs: number; cadence?: number | null }) {
      this.init()
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated || !hasNativeBridge()) return
      try {
        await ensureRunStoreLoaded()
        const start = new Date(payload.startMs)
        const end = new Date(payload.endMs)
        const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
        // 칼로리: 사용자 체중(kg)이 있으면 체중 × 거리(km) × 1.036 로 추정, 없으면 미산출(null).
        const distanceKm = payload.distanceM > 0 ? payload.distanceM / 1000 : null
        const weightKg = useMemoryStore().memory.athleteProfile.weightKg
        const activeEnergyKcal =
          weightKg !== null && weightKg > 0 && distanceKm !== null
            ? Math.round(weightKg * distanceKm * 1.036)
            : null
        const cadence = Number.isFinite(payload.cadence as number) ? (payload.cadence as number) : null
        const candidate: HealthKitRunCandidate = {
          externalId: payload.externalId,
          sourceName: 'PaceLAB',
          date,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          durationSec: payload.durationSec > 0 ? payload.durationSec : null,
          distanceKm,
          avgPaceSec: null,
          avgHeartRate: null,
          maxHeartRate: null,
          cadence,
          activeEnergyKcal,
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
          rawAvailability: { workout: true, heartRate: false, route: false, cadence: cadence !== null, runningDynamics: false },
          // 단건 레이싱 유입은 정의상 self-race. toExtractedRunData 가 이 플래그로 self-race 태그를 박는다.
          isSelfRace: true
        }
        // self-race는 workout uuid(externalId)가 유니크하므로 externalId로만 중복 판정한다.
        // (isAlreadySaved의 날짜+거리+시간 폴백은 '같은 날 비슷한 레이싱 2개'를 중복 오판해 2회째를
        //  누락시킨다 — 50m 레이싱을 반복하면 거리·시간이 비슷해 두 번째가 통째로 걸러지던 버그.)
        // (#235 후속 G3) 삭제 후 deny 된 externalId 면 단건 유입도 막는다(자동 sync 와 동일 게이트).
        const alreadyImported =
          useRunStore().runs.some((run) => run.externalId === candidate.externalId) ||
          useRunStore().deniedExternalIds.includes(candidate.externalId)
        if (!alreadyImported) {
          const memoryStore = useMemoryStore()
          const extracted = toExtractedRunData(candidate, memoryStore.memory.weeklyPattern, buildInferenceHeartRateModel())
          // #235/§10: 레이싱 런은 '생성 시점부터' self-race 태그를 달아, 저장 직후 matchSessionIntent의
          // 세션·의도 매칭에서 제외되게 한다. (태그를 linkSelfRaceResults에서 뒤늦게 붙이면 이미 처방
          // 세션을 '완료'로 소비한 뒤라 늦음 — 레이싱이 부상복귀 Easy 처방을 먹어버리던 버그.)
          const existingTags = extracted.tags ?? []
          extracted.tags = existingTags.includes(SELF_RACE_TAG) ? existingTags : [...existingTags, SELF_RACE_TAG]
          await useRunStore().addRuns([extracted], 'healthkit')
          this.lastChangedAt = Date.now()
        }
        await linkSelfRaceResults() // 방금 유입된 RunLog ↔ competition_result 근접 매칭(#233)
      } catch (err) {
        // 비치명적: 결과 요약은 PendingSelfRace로 이미 표시됨. 실패 시 다음 정기 sync가 재시도.
        this.error = friendlyErrorMessage(err, '레이싱 결과 HealthKit 유입 실패')
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
        showSyncToast('error', friendlyErrorMessage(err, 'VO2max 조회 요청에 실패했어요. 잠시 후 다시 시도해요.'), 4200)
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

// Tempo 상한 적응(#301): 새 기록 반영 후 검증(고신뢰)이 충족되면 채택 상한을 메모리에 영속화한다.
// 상향만(채택값보다 클 때만), 부상 시 차단. 실패는 동기화 보고와 분리한다.
async function applyTempoCeilingAdaptation() {
  try {
    const memoryStore = useMemoryStore()
    const runStore = useRunStore()
    // 메모리가 아직 로드되지 않았으면 쓰지 않는다(기본값으로 실제 영속 메모리를 덮어쓰는 사고 방지).
    if (!memoryStore.loaded) return
    const memory = memoryStore.memory
    const observed = deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
    const base = deriveHeartRateModel(memory.athleteProfile, new Date().getFullYear(), observed).tempoCeilingBpm
    if (base === null) return
    const current = memory.adaptiveTrainingProfile.tempoCeiling ?? { adoptedBpm: null, baseBpm: null, adoptedAt: null }
    const adaptation = computeTempoCeilingAdaptation(runStore.sortedRuns, base, {
      injuryActive: Boolean(getActiveInjuryItem(memory)),
      adoptedCeilingBpm: current.adoptedBpm
    })
    const proposed = adaptation.proposedAdoptedCeilingBpm
    if (proposed !== null && proposed > (current.adoptedBpm ?? base)) {
      const now = new Date().toISOString()
      await memoryStore.update({
        ...memory,
        adaptiveTrainingProfile: {
          ...memory.adaptiveTrainingProfile,
          tempoCeiling: { adoptedBpm: proposed, baseBpm: base, adoptedAt: now },
          updatedAt: now
        }
      })
    }
  } catch {
    // 적응 영속화 오류는 동기화 결과 보고와 분리한다.
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

// (#235 후속 G3) 과거 마이그레이션 전용: 범위 후보 중 deny 된 externalId 를 해제해 재유입을 허용한다.
async function releaseDeniedForCandidates(candidates: HealthKitRunCandidate[]) {
  const ids = candidates.map((c) => c.externalId).filter(Boolean)
  if (!ids.length) return
  try {
    await useRunStore().releaseDenied(ids)
  } catch {
    // best-effort: 해제 실패는 마이그레이션을 막지 않는다(이번엔 일부가 deny 로 걸러질 뿐).
  }
}

function isAlreadySaved(candidate: HealthKitRunCandidate) {
  const runStore = useRunStore()
  // (#235 후속 G3) 사용자가 삭제한 워크아웃은 deny-list 로 재유입 차단(자동 sync·단건 유입 게이트).
  if (candidate.externalId && runStore.deniedExternalIds.includes(candidate.externalId)) return true
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
      tags: mergeHealthKitRepairTags(target.tags ?? [], candidate.isSelfRace),
      source: 'healthkit'
    })
    repaired.push(updated)
  }
  return repaired
}

// #235/§10 (M1): repair 는 기존 target 태그 기준으로 병합하므로, self-race 워크아웃이 무-externalId 기존
// 런을 보강하면 candidate.isSelfRace 가 버려진다. 이걸 G4 치유로 미루면 태그가 없어 isSelfRaceRun 레이더에
// 영영 안 잡히는 순환이 생긴다 → 유입 시점(여기)에서 self-race 태그를 주입해 닫는다(멱등).
function mergeHealthKitRepairTags(tags: string[], isSelfRace = false) {
  const base = tags.includes('type:user')
    ? [...tags.filter((tag) => tag !== 'type:auto'), 'healthkit', 'healthkit-repaired']
    : [...tags.filter((tag) => tag !== 'type:user'), 'healthkit', 'healthkit-repaired', 'type:auto']
  if (isSelfRace) base.push(SELF_RACE_TAG)
  return Array.from(new Set(base))
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
  if (runStore.loading) {
    // 부트 로드가 진행 중이면 끝날 때까지 기다린다. 느린 회선(5G 약전계)에서 전체 run_logs 페치는
    // 수 초를 훌쩍 넘길 수 있어 짧게 포기하면 아래 재시도·실패 경로로 새는 것이 예사가 된다.
    await new Promise<void>((resolve) => {
      const startedAt = Date.now()
      const timer = window.setInterval(() => {
        if (!runStore.loading || Date.now() - startedAt > 60000) {
          window.clearInterval(timer)
          resolve()
        }
      }, 120)
    })
  }
  // 실패했으면 1회 재시도(순간적인 회선 문제 흡수).
  if (!runStore.loaded && !runStore.loading) await runStore.load()
  // ⚠ 그래도 미적재면 동기화를 진행하면 안 된다 — 빈 기록 기준으로 latestSavedDate=null 이 되어
  // HealthKit 후보 전체를 "새 러닝"으로 오판, 대량 재삽입을 시도하다 타임아웃·중복 위험이 커진다.
  // (기존엔 조용히 진행해 이 경로가 5G 시작 직후 "The request timed out." 토스트의 근원이었다.)
  if (!runStore.loaded) {
    throw new Error('러닝 기록을 아직 불러오지 못했어요. 연결이 안정되면 자동으로 다시 동기화해요.')
  }
}

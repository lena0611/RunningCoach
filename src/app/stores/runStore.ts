import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { inferRunType } from '@/features/infer-run-type/inferRunType'
import type { HeartRateModel } from '@/shared/lib/heartRateZones'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { deleteRunLog, fetchRunLogs, insertRunLog, insertRunLogs, updateRunLog } from '@/shared/api/runRepository'

const storageKey = 'runcontext.runLogs'

export const useRunStore = defineStore('runStore', {
  state: () => ({
    runs: [] as RunLog[],
    loaded: false,
    loading: false,
    error: '',
    // 운동 직후 코치 인터뷰(#311) 대상 run. HealthKit 임포트 직후 설정되고 App.vue 가 시트를 띄운다.
    pendingInterviewRunId: null as string | null
  }),
  getters: {
    selectedUserRuns: (state) => {
      if (isSupabaseConfigured) return state.runs
      const memoryStore = useMemoryStore()
      return state.runs.filter((run) => run.userId === memoryStore.selectedUserId)
    },
    sortedRuns(): RunLog[] {
      return [...this.selectedUserRuns].sort((a, b) => b.date.localeCompare(a.date) || (b.startAt ?? '').localeCompare(a.startAt ?? ''))
    }
  },
  actions: {
    async load() {
      this.loading = true
      this.error = ''
      try {
        this.runs = isSupabaseConfigured ? await fetchRunLogs() : loadRuns()
        this.loaded = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : '러닝 기록을 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    },
    async addRun(data: ExtractedRunData, source: RunLog['source'] = 'file_import') {
      if (isSupabaseConfigured) {
        const run = await insertRunLog(data, source)
        this.runs.push(run)
        // 세션 의도 매칭은 best-effort — 실패해도 런 저장은 유지한다(#308).
        await this.matchSessionIntent(run)
        return run
      }

      const now = new Date().toISOString()
      const memoryStore = useMemoryStore()
      const run: RunLog = {
        ...data,
        id: nanoid(),
        userId: memoryStore.selectedUserId,
        externalId: data.externalId ?? null,
        source,
        rpe: data.rpe ?? null,
        fastSegments: data.fastSegments ?? [],
        metricSamples: data.metricSamples ?? [],
        routePoints: data.routePoints ?? [],
        tags: data.tags ?? [],
        createdAt: now,
        updatedAt: now
      }
      this.runs.push(run)
      this.persist()
      return run
    },
    async addRuns(items: ExtractedRunData[], source: RunLog['source'] = 'file_import') {
      if (!items.length) return []
      if (isSupabaseConfigured) {
        const inserted = await insertRunLogs(items, source)
        this.runs.push(...inserted)
        // 벌크/HealthKit 인입도 단건(addRun)과 동일하게 예정 세션·의도를 done 매칭한다.
        // 누락 시 수행해도 스케줄이 planned 로 남아 정산에서 missed 오확정 + 디브리핑 달성률 카드 소실.
        for (const run of inserted) await this.matchSessionIntent(run)
        this.flagInterviewForImport(inserted, source)
        return inserted
      }

      const now = new Date().toISOString()
      const memoryStore = useMemoryStore()
      const runs = items.map((item) => ({
        ...item,
        id: nanoid(),
        userId: memoryStore.selectedUserId,
        externalId: item.externalId ?? null,
        source,
        rpe: item.rpe ?? null,
        fastSegments: item.fastSegments ?? [],
        metricSamples: item.metricSamples ?? [],
        routePoints: item.routePoints ?? [],
        tags: item.tags ?? [],
        createdAt: now,
        updatedAt: now
      }))
      this.runs.push(...runs)
      this.persist()
      this.flagInterviewForImport(runs, source)
      return runs
    },
    /** HealthKit 임포트 직후 가장 최근 run 을 인터뷰 대상으로 표시한다(#311). */
    flagInterviewForImport(runs: RunLog[], source: RunLog['source']) {
      if (source !== 'healthkit' || !runs.length) return
      const newest = [...runs].sort(
        (a, b) => b.date.localeCompare(a.date) || (b.startAt ?? '').localeCompare(a.startAt ?? '')
      )[0]
      this.pendingInterviewRunId = newest?.id ?? null
    },
    openInterview(runId: string) {
      this.pendingInterviewRunId = runId
    },
    clearInterview() {
      this.pendingInterviewRunId = null
    },
    async updateRun(run: RunLog) {
      if (isSupabaseConfigured) {
        const updated = await updateRunLog(run)
        const index = this.runs.findIndex((item) => item.id === run.id)
        if (index >= 0) this.runs[index] = updated
        return updated
      }

      const index = this.runs.findIndex((item) => item.id === run.id)
      if (index >= 0) {
        this.runs[index] = { ...run, updatedAt: new Date().toISOString() }
        this.persist()
        return this.runs[index]
      }
      return run
    },
    /**
     * 과거 오분류 롱런 라벨 자가치유(로드 시 멱등): 자동 추론으로 들어온 런 중 **Easy/Recovery 로 잘못 잡힌**
     * 런을 재추론해, 거리/시간 기준 롱런(LSD/Steady Long)으로 재판정되면 타입을 교정한다.
     * 과거 inferRunType 의 롱런 게이트가 토요일/12km 에만 걸려, 비-토요일로 옮겨 뛴 10~12km 긴 이지런이
     * Easy 로 박히던 버그의 기존 기록 치유(타입은 임포트 시점 고정이라 포워드 수정만으론 안 바뀜).
     * - 사용자 수동 지정(type:user)·수기 입력(manual/image_extracted) 런은 건드리지 않는다.
     * - Easy/Recovery → LSD/Steady Long 방향만 교정(이지↔이지 churn 없음). 한 번 교정되면 다음 로드엔 후보가
     *   아니므로 멱등. 롱런 게이트는 거리/시간(런별 고정값) 기반이라 심박모델 드리프트에도 흔들리지 않는다.
     * 반환: 타입이 바뀐 런 목록(스케줄 매칭 재연결 repointReinferredRuns 입력).
     */
    async reinferMislabeledLongRuns(heartRateModel: HeartRateModel | null): Promise<RunLog[]> {
      const changed: RunLog[] = []
      for (const run of this.runs) {
        if (run.source !== 'healthkit' && run.source !== 'file_import') continue
        if (run.tags?.includes('type:user')) continue
        if (run.type !== 'Easy' && run.type !== 'Recovery') continue
        const inferred = inferRunType({
          date: run.date,
          distanceKm: run.distanceKm,
          avgPaceSec: run.avgPaceSec,
          avgHeartRate: run.avgHeartRate,
          laps: run.laps,
          fastSegments: run.fastSegments,
          metricSamples: run.metricSamples,
          routePoints: run.routePoints,
          weeklyPattern: [],
          heartRateModel
        })
        if (inferred !== 'LSD' && inferred !== 'Steady Long') continue
        const updated = await this.updateRun({
          ...run,
          type: inferred,
          tags: Array.from(new Set([...(run.tags ?? []), 'type:reinferred']))
        })
        changed.push(updated)
      }
      return changed
    },
    async deleteRun(id: string) {
      if (isSupabaseConfigured) {
        await deleteRunLog(id)
      }
      this.runs = this.runs.filter((run) => run.id !== id)
      if (!isSupabaseConfigured) this.persist()
    },
    async matchSessionIntent(run: RunLog) {
      try {
        await useSessionIntentStore().matchRun({ id: run.id, date: run.date })
      } catch {
        // best-effort: 의도 매칭 실패가 런 저장을 막지 않는다.
      }
      try {
        // 스케줄 세션도 done 매칭 — 안 하면 수행한 세션이 'planned'로 남아 재정렬에서 미수행 오판(#378).
        await useTrainingScheduleStore().matchRun({ id: run.id, date: run.date, type: run.type, startAt: run.startAt })
      } catch {
        // best-effort
      }
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify(this.runs))
    }
  }
})

function loadRuns(): RunLog[] {
  try {
    const raw = localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.map((run) => ({
          ...run,
          userId: run.userId ?? 'default',
          externalId: run.externalId ?? null,
          startAt: run.startAt ?? null,
          endAt: run.endAt ?? null,
          activeEnergyKcal: run.activeEnergyKcal ?? null,
          fastSegments: run.fastSegments ?? [],
          metricSamples: run.metricSamples ?? [],
          routePoints: run.routePoints ?? []
        }))
      : []
  } catch {
    return []
  }
}

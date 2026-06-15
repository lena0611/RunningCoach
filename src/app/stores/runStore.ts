import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
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

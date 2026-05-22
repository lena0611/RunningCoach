import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { deleteRunLog, fetchRunLogs, insertRunLog, updateRunLog } from '@/shared/api/runRepository'

const storageKey = 'runcontext.runLogs'

export const useRunStore = defineStore('runStore', {
  state: () => ({
    runs: [] as RunLog[],
    loaded: false,
    loading: false,
    error: ''
  }),
  getters: {
    selectedUserRuns: (state) => {
      if (isSupabaseConfigured) return state.runs
      const memoryStore = useMemoryStore()
      return state.runs.filter((run) => run.userId === memoryStore.selectedUserId)
    },
    sortedRuns(): RunLog[] {
      return [...this.selectedUserRuns].sort((a, b) => b.date.localeCompare(a.date))
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
        return run
      }

      const now = new Date().toISOString()
      const memoryStore = useMemoryStore()
      const run: RunLog = {
        ...data,
        id: nanoid(),
        userId: memoryStore.selectedUserId,
        source,
        rpe: data.rpe ?? null,
        tags: data.tags ?? [],
        createdAt: now,
        updatedAt: now
      }
      this.runs.push(run)
      this.persist()
      return run
    },
    async updateRun(run: RunLog) {
      if (isSupabaseConfigured) {
        const updated = await updateRunLog(run)
        const index = this.runs.findIndex((item) => item.id === run.id)
        if (index >= 0) this.runs[index] = updated
        return
      }

      const index = this.runs.findIndex((item) => item.id === run.id)
      if (index >= 0) {
        this.runs[index] = { ...run, updatedAt: new Date().toISOString() }
        this.persist()
      }
    },
    async deleteRun(id: string) {
      if (isSupabaseConfigured) {
        await deleteRunLog(id)
      }
      this.runs = this.runs.filter((run) => run.id !== id)
      if (!isSupabaseConfigured) this.persist()
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
          userId: run.userId ?? 'default'
        }))
      : []
  } catch {
    return []
  }
}

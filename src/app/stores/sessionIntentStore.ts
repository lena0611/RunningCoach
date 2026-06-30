import { defineStore } from 'pinia'
import { isPendingIntent, type SessionIntent, type SessionIntentDraft, type SessionIntentStatus } from '@/entities/session-intent/model'
import { selectIntentForRun } from '@/entities/session-intent/matchSessionIntent'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import {
  fetchSessionIntents,
  insertSessionIntent,
  matchSessionIntentToRun,
  unmatchSessionIntentFromRun,
  updateSessionIntentStatus
} from '@/shared/api/sessionIntentRepository'

/**
 * 세션 의도 store (#308). Phase 1(생성)·Phase 2(매칭 소비)가 사용한다.
 * 영속은 Supabase 전용 — 미설정 환경에선 no-op 으로 둔다(런 저장을 막지 않기 위함).
 */
export const useSessionIntentStore = defineStore('sessionIntentStore', {
  state: () => ({
    intents: [] as SessionIntent[],
    loaded: false,
    loading: false,
    error: ''
  }),
  getters: {
    pendingIntents: (state): SessionIntent[] => state.intents.filter(isPendingIntent),
    /** 가장 최근의 미연결 의도(Pre-run 카드 표시 후보). */
    activePlannedIntent(): SessionIntent | null {
      return (
        [...this.pendingIntents].sort(
          (a, b) => b.plannedDate.localeCompare(a.plannedDate) || b.createdAt.localeCompare(a.createdAt)
        )[0] ?? null
      )
    }
  },
  actions: {
    async load() {
      if (!isSupabaseConfigured) {
        this.loaded = true
        return
      }
      if (this.loading) return
      this.loading = true
      this.error = ''
      try {
        this.intents = await fetchSessionIntents()
        this.loaded = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : '세션 의도를 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    },
    async plan(draft: SessionIntentDraft): Promise<SessionIntent | null> {
      if (!isSupabaseConfigured) return null
      const intent = await insertSessionIntent(draft)
      this.intents.unshift(intent)
      return intent
    },
    /** 해당 날짜에 미연결(planned) 의도가 있으면 그대로, 없으면 생성한다(하루 1건 idempotent). */
    async ensureIntentFor(draft: SessionIntentDraft): Promise<SessionIntent | null> {
      if (!isSupabaseConfigured) return null
      if (!this.loaded) await this.load()
      const existing = this.intents.find(
        (item) => item.plannedDate === draft.plannedDate && item.status === 'planned'
      )
      if (existing) return existing
      return this.plan(draft)
    },
    /** 런 저장 직후 호출. 가장 가까운 미연결 의도를 매칭한다(best-effort). */
    async matchRun(run: { id: string; date: string }): Promise<SessionIntent | null> {
      if (!isSupabaseConfigured) return null
      if (!this.loaded) await this.load()
      const candidate = selectIntentForRun(this.intents, run)
      if (!candidate) return null
      const matched = await matchSessionIntentToRun(candidate.id, run.id)
      this.replace(matched)
      return matched
    },
    /**
     * 런 삭제/치유 시 호출(#235 후속 G2/G4). 그 런이 'completed' 로 점유한 의도를 planned 로 되돌린다.
     * 사용자가 수동 전환한 skipped/superseded 는 건드리지 않는다(completed 만 자동 회수 — 의도된 동작).
     */
    async unmatchRun(runId: string): Promise<void> {
      if (!isSupabaseConfigured) return
      const target = this.intents.find((i) => i.runId === runId && i.status === 'completed')
      if (!target) return
      this.replace(await unmatchSessionIntentFromRun(target.id))
    },
    async setStatus(id: string, status: SessionIntentStatus): Promise<void> {
      if (!isSupabaseConfigured) return
      const updated = await updateSessionIntentStatus(id, status)
      this.replace(updated)
    },
    replace(intent: SessionIntent) {
      const index = this.intents.findIndex((item) => item.id === intent.id)
      if (index >= 0) this.intents[index] = intent
      else this.intents.unshift(intent)
    }
  }
})

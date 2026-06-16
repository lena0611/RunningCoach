import { defineStore } from 'pinia'
import {
  isActiveSession,
  isPlannedSession,
  type ScheduledSession,
  type ScheduledSessionDraft,
  type ScheduledSessionStatus
} from '@/entities/training-schedule/model'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import {
  fetchTrainingSchedule,
  insertTrainingSessions,
  markPastPlannedMissed,
  supersedeSessionsFrom,
  updateScheduledSessionStatus
} from '@/shared/api/trainingScheduleRepository'

/**
 * 날짜축 주기화 스케줄 store (#363). F2 생성기·A1 재정렬·A2 작전 바꾸기가 사용한다.
 * 영속은 Supabase 전용 — 미설정 환경에선 no-op(런 저장·대시보드를 막지 않기 위함).
 */
export const useTrainingScheduleStore = defineStore('trainingScheduleStore', {
  state: () => ({
    sessions: [] as ScheduledSession[],
    loaded: false,
    loading: false,
    error: ''
  }),
  getters: {
    /** 날짜별 활성(planned/missed) 세션 1건 조회. */
    sessionOnDate(state) {
      return (date: string): ScheduledSession | null =>
        state.sessions.find((s) => s.date === date && isActiveSession(s)) ?? null
    },
    /** 오늘 이후의 계획 세션(날짜 오름차순). */
    upcoming(state) {
      return (fromDate: string): ScheduledSession[] =>
        state.sessions
          .filter((s) => s.date >= fromDate && isPlannedSession(s))
          .sort((a, b) => a.date.localeCompare(b.date))
    }
  },
  actions: {
    async load(goalId?: string | null) {
      if (!isSupabaseConfigured) {
        this.loaded = true
        return
      }
      if (this.loading) return
      this.loading = true
      this.error = ''
      try {
        this.sessions = await fetchTrainingSchedule(goalId)
        this.loaded = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : '훈련 스케줄을 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    },
    /** F2/A1 생성·재구축 결과 벌크 반영. */
    async insertMany(drafts: ScheduledSessionDraft[]): Promise<ScheduledSession[]> {
      if (!isSupabaseConfigured || !drafts.length) return []
      const created = await insertTrainingSessions(drafts)
      this.sessions.push(...created)
      return created
    },
    /**
     * A1 재정렬: fromDate 이후 활성 세션을 superseded 로 비우고, 과거 planned 누락은 missed 로
     * 확정(같은 누락 재트리거 방지, B2), 재구축 drafts 를 insert.
     */
    async realign(goalId: string | null, fromDate: string, drafts: ScheduledSessionDraft[]): Promise<void> {
      if (!isSupabaseConfigured) return
      await supersedeSessionsFrom(goalId, fromDate)
      await markPastPlannedMissed(goalId, fromDate)
      this.sessions.forEach((s) => {
        if (s.date >= fromDate && isActiveSession(s)) s.status = 'superseded'
        else if (s.date < fromDate && s.status === 'planned' && !s.runId) s.status = 'missed'
      })
      await this.insertMany(drafts)
    },
    /** 런 임포트 직후: 그 날짜의 활성 세션을 done 으로 매칭한다(없으면 no-op). 미수행 오판·재정렬 방지. */
    async matchRun(run: { id: string; date: string }): Promise<void> {
      if (!isSupabaseConfigured) return
      if (!this.loaded) await this.load()
      const target = this.sessions.find((s) => s.date === run.date && isActiveSession(s))
      if (!target) return
      await this.setStatus(target.id, 'done', run.id)
    },
    async setStatus(id: string, status: ScheduledSessionStatus, runId: string | null = null): Promise<void> {
      if (!isSupabaseConfigured) return
      const updated = await updateScheduledSessionStatus(id, status, runId)
      this.replace(updated)
    },
    replace(session: ScheduledSession) {
      const index = this.sessions.findIndex((item) => item.id === session.id)
      if (index >= 0) this.sessions[index] = session
      else this.sessions.push(session)
    }
  }
})

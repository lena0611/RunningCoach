import { defineStore } from 'pinia'
import {
  isActiveSession,
  isPlannedSession,
  selectBetterTypeMatchForRun,
  selectSessionForRun,
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
    error: '',
    /** 현재 로딩된 세션이 어느 목표의 것인지(#398). 활성 목표가 바뀌면 재로딩 판단에 쓴다. */
    loadedGoalId: null as string | null | undefined
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
        this.loadedGoalId = goalId ?? null
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
     * A1 재정렬: fromDate 이후 활성 세션을 superseded 로 비우고 재구축 drafts 를 insert.
     * open→missed 확정은 realign 책임이 아니다 — settleClosedWeeks 가 닫힌 주(월~일)만 확정한다
     * (현재 주의 지난 날은 'open' 으로 열어 둔다). 호출부(doEnsureSchedule)가 realign 직후 정산을 돌린다.
     */
    async realign(goalId: string | null, fromDate: string, drafts: ScheduledSessionDraft[]): Promise<void> {
      if (!isSupabaseConfigured) return
      await supersedeSessionsFrom(goalId, fromDate)
      this.sessions.forEach((s) => {
        if (s.date >= fromDate && isActiveSession(s)) s.status = 'superseded'
      })
      await this.insertMany(drafts)
    },
    /**
     * 주간 정산: **닫힌 주**(weekStart=이번 주 월요일) 이전의 미수행 planned 세션을 missed 로 확정한다.
     * 현재 주는 건드리지 않는다(지난 날도 'open' — 따라잡기 가능). 로드 시 무조건·멱등으로 돌린다.
     * weekStart 는 호출부가 trainingWeekRange(today).start 로 계산해 넘긴다(스토어→코칭lib 의존 회피).
     */
    async settleClosedWeeks(goalId: string | null, weekStart: string): Promise<void> {
      if (!isSupabaseConfigured) return
      await markPastPlannedMissed(goalId, weekStart)
      this.sessions.forEach((s) => {
        if (s.date < weekStart && s.status === 'planned' && !s.runId) s.status = 'missed'
      })
    },
    /** 사용자가 세션을 의도적으로 포기(skipped). active 제외 — 단 UI 카드는 계속 보이고 재시도 가능. */
    async skip(id: string): Promise<void> {
      await this.setStatus(id, 'skipped')
    },
    /**
     * 세션 조정/이동/스왑: 원본(들)을 superseded 로 비우고 새 날짜 draft(들)을 insert.
     * 이동=supersede 1+insert 1, 스왑=supersede 2+insert 2. (작전 바꾸기와 동일한 supersede+insert 패턴)
     */
    async reschedule(supersedeIds: string[], drafts: ScheduledSessionDraft[]): Promise<void> {
      if (!isSupabaseConfigured) return
      for (const id of supersedeIds) await this.setStatus(id, 'superseded')
      await this.insertMany(drafts)
    },
    /** 작전 되돌리기: 변경본(modified)을 superseded 로 비우고 원본(superseded)을 planned 로 복원. */
    async revert(modifiedId: string, originalId: string): Promise<void> {
      if (!isSupabaseConfigured) return
      await this.setStatus(modifiedId, 'superseded')
      await this.setStatus(originalId, 'planned')
    },
    /**
     * 런 임포트 직후: 동일 날짜 또는 ±윈도우 내 가장 가까운 활성 세션을 done 으로 매칭(없으면 no-op).
     * "어제 빠진 세션을 오늘 따라잡기"를 엑스트라+미수행 이중계산 대신 따라잡음으로 인정한다.
     */
    async matchRun(run: { id: string; date: string; type?: ScheduledSession['sessionType'] }): Promise<void> {
      if (!isSupabaseConfigured) return
      if (!this.loaded) await this.load()
      const target = selectSessionForRun(this.sessions, run)
      if (!target) return
      await this.setStatus(target.id, 'done', run.id)
    },
    /**
     * 이미 들어온 런들을 아직 연결 안 된 예정 세션에 일괄 매칭(done) — 과거 HealthKit 인입(매칭 누락)·
     * 이동 직후 등 '수행했는데 planned 로 남은' 세션 치유. 이미 연결된 런·활성 세션 없음이면 건너뜀(멱등).
     * 정산(settleClosedWeeks) 전에 돌려야 수행 세션이 missed 로 오확정되지 않는다.
     */
    async reconcileRuns(
      runs: { id: string; date: string; type?: ScheduledSession['sessionType'] }[]
    ): Promise<void> {
      if (!isSupabaseConfigured || !this.sessions.some(isActiveSession)) return
      const linkedRunIds = new Set(this.sessions.filter((s) => s.runId).map((s) => s.runId))
      for (const run of runs) {
        if (linkedRunIds.has(run.id)) continue
        const target = selectSessionForRun(this.sessions, run)
        if (!target) continue
        await this.setStatus(target.id, 'done', run.id)
        linkedRunIds.add(run.id)
      }
    },
    /**
     * 라벨 재추론(runStore.reinferMislabeledLongRuns)으로 타입이 바뀐 런이, 이미 done 으로 연결된 세션과
     * 타입이 어긋나고 같은 윈도우 안에 **새 타입과 정확히 맞는** 활성 세션(예: 같은 날 LSD)이 있으면 그쪽으로
     * 재연결한다. 잘못 크레딧된 세션은 planned 로 되돌려(주간 정산이 missed 로 정직하게 확정) "같은 날 Easy done·
     * LSD missed" 더블 오매칭을 치유한다. 정확 타입 일치가 있을 때만 동작 — 결정론·멱등(정산 전에 호출).
     */
    async repointReinferredRuns(
      runs: { id: string; date: string; type?: ScheduledSession['sessionType'] }[]
    ): Promise<void> {
      if (!isSupabaseConfigured) return
      for (const run of runs) {
        if (!run.type) continue
        const linked = this.sessions.find((s) => s.runId === run.id && s.status === 'done')
        if (!linked || linked.sessionType === run.type) continue
        const better = selectBetterTypeMatchForRun(this.sessions, run, linked.id)
        if (!better) continue
        await this.setStatus(linked.id, 'planned', null) // 잘못 크레딧된 세션 비우기(정산이 missed 확정)
        await this.setStatus(better.id, 'done', run.id) // 실제 수행한 타입의 세션에 크레딧
      }
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

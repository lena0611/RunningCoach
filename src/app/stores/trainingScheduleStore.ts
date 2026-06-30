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
  markSessionsRested,
  supersedeSessionsFrom,
  unmarkRestedFrom,
  updateScheduledSessionSlot,
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
    /** 날짜별 활성(planned/missed) 세션 전부(AM→PM→단일 정렬). 같은 날 더블(#455) 표시·충돌 판정에 쓴다. */
    sessionsOnDate(state) {
      const slotRank = (s: ScheduledSession) => (s.slot === 'AM' ? 0 : s.slot === 'PM' ? 1 : 2)
      return (date: string): ScheduledSession[] =>
        state.sessions
          .filter((s) => s.date === date && isActiveSession(s))
          .sort((a, b) => slotRank(a) - slotRank(b))
    },
    /** 날짜별 활성 세션 1건(하위호환 — 더블이면 AM 우선). */
    sessionOnDate(): (date: string) => ScheduledSession | null {
      return (date: string) => this.sessionsOnDate(date)[0] ?? null
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
     * 범용 휴식 선언(#473, SSOT §휴식과 복귀): [startDate, endDate] (양끝 포함) 구간의 미수행 세션
     * (planned/missed, run 미연결)을 'rested' 로 일괄 전환한다. 부상·날씨·개인 일정 등 이유 무관.
     * rested 는 active/planned 아니므로 정산·트리아지·재정렬·런 매칭이 자동으로 건드리지 않는다(닦달 차단).
     * done/superseded/skipped 는 보존. 영향받은 세션 수를 반환(없으면 0). 휴식 기간 메타(이유·복귀일)는
     * 별도(memoryStore.activeRest)에 저장한다 — 이 액션은 스케줄 레이어의 상태 전환만 담당한다.
     */
    async declareRest(goalId: string | null, startDate: string, endDate: string): Promise<number> {
      if (!isSupabaseConfigured) return 0
      const affected = await markSessionsRested(goalId, startDate, endDate)
      this.sessions.forEach((s) => {
        if (
          s.date >= startDate &&
          s.date <= endDate &&
          (s.status === 'planned' || s.status === 'missed') &&
          !s.runId
        ) {
          s.status = 'rested'
        }
      })
      return affected
    },
    /**
     * 휴식 복귀/단축(#473): fromDate(포함) 이후 'rested' 세션을 'planned' 로 되돌린다("지금 복귀"·복귀일 앞당김).
     * 과거(이미 쉰 날)는 보존. 되돌린 뒤 정상 정산·재정렬 파이프라인(doEnsureSchedule)이 이어서 forward 정리한다.
     */
    async unrestFrom(goalId: string | null, fromDate: string): Promise<number> {
      if (!isSupabaseConfigured) return 0
      const affected = await unmarkRestedFrom(goalId, fromDate)
      this.sessions.forEach((s) => {
        if (s.date >= fromDate && s.status === 'rested') s.status = 'planned'
      })
      return affected
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
    /**
     * 같은 날 더블(#455): 기존 세션(amSessionId → AM)에 오후 PM 세션을 덧붙인다.
     * - 기존 세션 slot 이 null 이면 'AM' 으로 표시(런 매칭 시각 우선 — 결정 B).
     * - pmDraft 를 slot 'PM' 으로 insert.
     * 구조 불변식만 강제한다: **같은 날·중복 PM 금지·N≥3 금지**(같은 날 활성 PM 이 이미 있으면 no-op).
     * **PM=이지 강제·적격 게이트는 호출부(coaching lib: buildPmEasyDraft / evaluateDoubleEligibility)** 책임 —
     * store↔coaching 의존을 피한다(settleClosedWeeks 가 weekStart 를 주입받는 것과 같은 경계).
     * 추가 못 하면(미설정/대상 없음/중복) null 반환.
     */
    async addDouble(amSessionId: string, pmDraft: ScheduledSessionDraft): Promise<ScheduledSession | null> {
      if (!isSupabaseConfigured) return null
      const am = this.sessions.find((s) => s.id === amSessionId)
      if (!am || am.status === 'superseded') return null
      if (pmDraft.date !== am.date) return null // 같은 날만 더블
      // 중복 PM / 트리플 가드: 같은 날 활성(폐기·포기 아님) PM 이 이미 있으면 막는다(N≥3 보류).
      const hasActivePm = this.sessions.some(
        (s) => s.date === am.date && s.slot === 'PM' && s.status !== 'superseded' && s.status !== 'skipped'
      )
      if (hasActivePm) return null
      // 기존 단일 세션을 AM 으로 표시(이미 슬롯이 있으면 보존).
      if (am.slot === null) {
        const updatedAm = await updateScheduledSessionSlot(am.id, 'AM')
        this.replace(updatedAm)
      }
      const [created] = await this.insertMany([{ ...pmDraft, slot: 'PM' }])
      return created ?? null
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
    async matchRun(run: { id: string; date: string; type?: ScheduledSession['sessionType']; startAt?: string | null }): Promise<void> {
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
      runs: { id: string; date: string; type?: ScheduledSession['sessionType']; startAt?: string | null }[]
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
    /**
     * 런 삭제/치유 시 호출(#235 후속 G2/G4). 그 런에 done 으로 연결된 세션을 planned 로 되돌리고 runId 를 비운다.
     * runId 직접 역참조(날짜 재매칭 금지 — 그새 다른 세션이 끼면 엉뚱한 걸 푼다). setStatus(.., 'planned', null) 가
     * 이미 run_id 를 비우므로(repository) 신규 repo 함수 불필요. 멱등: 풀고 나면 runId===run.id 가 없어 no-op.
     */
    async unlinkRunSessions(runId: string): Promise<void> {
      if (!isSupabaseConfigured) return
      const linked = this.sessions.filter((s) => s.runId === runId && s.status === 'done')
      for (const s of linked) await this.setStatus(s.id, 'planned', null)
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

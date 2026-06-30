import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { SELF_RACE_TAG, isSelfRaceRun } from '@/entities/competition/model'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { inferRunType } from '@/features/infer-run-type/inferRunType'
import type { HeartRateModel } from '@/shared/lib/heartRateZones'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { deleteRunLog, fetchRunLogs, insertRunLog, insertRunLogs, updateRunLog } from '@/shared/api/runRepository'
import {
  deleteDeniedExternalId,
  fetchDeniedExternalIds,
  insertDeniedExternalId
} from '@/shared/api/runImportDenylistRepository'

const storageKey = 'runcontext.runLogs'
const denylistKey = 'pacelab.runImportDenylist'

export const useRunStore = defineStore('runStore', {
  state: () => ({
    runs: [] as RunLog[],
    loaded: false,
    loading: false,
    error: '',
    // 운동 직후 코치 인터뷰(#311) 대상 run. HealthKit 임포트 직후 설정되고 App.vue 가 시트를 띄운다.
    pendingInterviewRunId: null as string | null,
    // 삭제된 HealthKit 워크아웃 externalId deny-list(#235 후속 G3). 재유입 게이트가 참조한다.
    deniedExternalIds: [] as string[]
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
        // deny-list 동시 hydrate(#235 후속 G3). 재유입 게이트가 runs 와 같은 타이밍에 참조하도록 함께 적재.
        try {
          this.deniedExternalIds = isSupabaseConfigured ? await fetchDeniedExternalIds() : loadDenylist()
        } catch {
          this.deniedExternalIds = isSupabaseConfigured ? [] : loadDenylist()
        }
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
        // #235/§10 (M3): 레이싱 런은 훈련 타입 재추론 대상이 아니다(type 변조→부하·예측 집계 오염 방지).
        if (isSelfRaceRun(run)) continue
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
      const target = this.runs.find((run) => run.id === id) ?? null

      // (#235 후속 G2) 삭제 전 세션·의도·경쟁결과 크레딧 회수 — done→planned 복원(레이싱·일반 공통, 태그 무관).
      // ⚠️ 반드시 DB delete '전에' 푼다. delete 가 FK SET NULL 로 run_id 링크를 끊으면 그 뒤엔 어느 세션이
      //    이 런과 연결됐었는지 runId 로 못 찾는다. unmatch 실패는 best-effort(좀비는 다음 로드의 G4 가 청소).
      try {
        await useTrainingScheduleStore().unlinkRunSessions(id)
      } catch {
        /* best-effort */
      }
      try {
        await useSessionIntentStore().unmatchRun(id)
      } catch {
        /* best-effort */
      }
      // (#235 후속 M2) self-race 였다면 링크된 competition_result 도 회수(좀비 결과 재링크·유령 사다리 방지).
      if (target && isSelfRaceRun(target)) {
        try {
          await useCompetitionStore().reclaimResultsForRun(id)
        } catch {
          /* best-effort */
        }
      }

      // (#235 후속 G3) HealthKit 원본 재유입 차단: externalId 있고 healthkit 출신일 때만 deny-list 적재.
      // 수기/이미지 추출(externalId null)은 재유입원이 아니라 제외. in-memory 배열을 네트워크 await '전에'
      // 동기 push 해 같은 틱 ObserverQuery sync 도 막는다. (S1) deny 적재가 delete 보다 먼저라, deny 영속
      // 실패 시에도 런이 사라지기 전에 막혀 즉시 재유입은 안 난다 — 단 다음 부팅 fetch 가 in-memory 를 덮으니
      // 영속 실패는 사용자 경고로 노출한다.
      if (target?.externalId && target.source === 'healthkit') {
        if (!this.deniedExternalIds.includes(target.externalId)) this.deniedExternalIds.push(target.externalId)
        if (isSupabaseConfigured) {
          try {
            await insertDeniedExternalId(target.externalId)
          } catch (err) {
            this.error =
              err instanceof Error
                ? `삭제는 됐지만 재유입 차단 저장에 실패했어요(앱 재시작 시 다시 들어올 수 있어요): ${err.message}`
                : '삭제는 됐지만 재유입 차단 저장에 실패했어요(앱 재시작 시 다시 들어올 수 있어요).'
          }
        } else {
          persistDenylist(this.deniedExternalIds)
        }
      }

      if (isSupabaseConfigured) {
        await deleteRunLog(id)
      }
      this.runs = this.runs.filter((run) => run.id !== id)
      if (!isSupabaseConfigured) this.persist()
    },
    /**
     * 가상레이싱 잔재 자동 치유(로드 시 멱등, #235 후속 G4). f7a03ae 이전 무태그/늦은-태깅 레이스로 self-race 가
     * 점유한 세션·의도를 비운다. G2 의 unlinkRunSessions/unmatchRun 을 그대로 재사용(한 메커니즘 두 진입점).
     * ⚠️ Supabase 전용 — 세션·의도가 Supabase 전용이라 localStorage 모드는 치유 불가(집계 필터로만 표시 정합).
     * 호출부(DashboardPage)는 이걸 reconcileRuns '전에' 돌리고, reconcile/repoint 입력에서 self-race 를 빼야
     * 멱등 수렴한다(안 그러면 떼도 다시 붙는 도돌이).
     */
    /**
     * deny-list 에서 externalId 들을 해제한다(#235 후속 G3). 과거 마이그레이션이 "직접 다시 부른" 워크아웃의
     * 재유입을 허용하기 위해 호출(자동 sync 경로에서는 호출하지 않는다). in-memory + 영속 동시 갱신, best-effort.
     */
    async releaseDenied(externalIds: string[]): Promise<void> {
      const release = new Set(externalIds.filter((id) => this.deniedExternalIds.includes(id)))
      if (!release.size) return
      this.deniedExternalIds = this.deniedExternalIds.filter((id) => !release.has(id))
      if (isSupabaseConfigured) {
        for (const id of release) {
          try {
            await deleteDeniedExternalId(id)
          } catch {
            /* best-effort: 다음 마이그레이션에서 재시도 */
          }
        }
      } else {
        persistDenylist(this.deniedExternalIds)
      }
    },
    async healSelfRaceLinks(): Promise<void> {
      if (!isSupabaseConfigured) return
      for (const run of this.runs.filter(isSelfRaceRun)) {
        await this.healSelfRaceLink(run.id)
      }
    },
    /**
     * 단일 self-race 런이 점유한 세션·의도를 즉시 비운다(#235 후속 M2). healSelfRaceLinks 의 1건 버전.
     * linkPendingResults 가 '늦게' self-race 태그를 붙인 직후 호출해, 그 사이 matchSessionIntent 가 처방
     * 세션(부상복귀 Easy 등)을 'done'/'completed' 로 소비했던 걸 같은 틱에 되돌린다(§10 "지연 부착" 경합의
     * 안전망 — G4 가 다음 doEnsureSchedule 까지 기다리지 않게 한다). unlink/unmatch 는 runId 직접 역참조라 멱등.
     */
    async healSelfRaceLink(runId: string): Promise<void> {
      if (!isSupabaseConfigured) return
      try {
        await useTrainingScheduleStore().unlinkRunSessions(runId)
      } catch {
        /* best-effort */
      }
      try {
        await useSessionIntentStore().unmatchRun(runId)
      } catch {
        /* best-effort */
      }
    },
    async matchSessionIntent(run: RunLog) {
      // #235/competition-domain §10: 레이싱(self-race) 런은 예정 처방 세션·의도를 소비하지 않는다.
      // 레이싱은 기록(RunLog)·경쟁결과로만 남고, 오늘의 코칭 처방/디브리핑/의도평가·스케줄 완료는
      // 건드리지 않는다(레이싱≠훈련). 부상복귀 Easy 처방을 50m 레이싱이 '완료'로 먹어버리던 버그 차단.
      if (run.tags?.includes(SELF_RACE_TAG)) return
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

function loadDenylist(): string[] {
  try {
    const raw = localStorage.getItem(denylistKey)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as string[]).filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function persistDenylist(ids: string[]) {
  try {
    localStorage.setItem(denylistKey, JSON.stringify(ids))
  } catch {
    // 저장 실패는 치명적 아님(다음 삭제 때 다시 적재).
  }
}

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

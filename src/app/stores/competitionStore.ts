import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import {
  deleteCompetitionResultsByRunId,
  fetchCompetitionResults,
  insertCompetitionResult,
  type CompetitionResultInput
} from '@/shared/api/competitionRepository'
import { SELF_RACE_TAG, type CompetitionResult, type PendingSelfRace } from '@/entities/competition/model'
import {
  addSelfRaceTag,
  deriveResultFields,
  isMeaningfulFinish,
  isPendingExpired,
  pickBestMatch,
  type RaceFinishInput
} from '@/shared/lib/selfRace/raceResult'

/**
 * 가상레이싱 결과 store (#233).
 * - results: 영속 CompetitionResult (Supabase competition_results, 또는 비로그인 시 localStorage).
 * - pending: 라이브 종료 직후 임시 보관(항상 localStorage). 다음 HealthKit import 의 RunLog 와
 *   근접 매칭되면 'self-race' 태깅 + (타겟 있으면) CompetitionResult 생성 후 제거된다.
 */

const resultsKey = 'pacelab.competitionResults'
const pendingKey = 'pacelab.pendingSelfRaces'
const PENDING_MAX_AGE_MS = 3 * 86400000 // 3일 미매칭 시 만료

export const useCompetitionStore = defineStore('competitionStore', {
  state: () => ({
    results: [] as CompetitionResult[],
    pending: [] as PendingSelfRace[],
    loaded: false,
    loading: false,
    error: ''
  }),
  actions: {
    async load() {
      this.pending = loadPending()
      this.loading = true
      this.error = ''
      try {
        this.results = isSupabaseConfigured ? await fetchCompetitionResults() : loadLocalResults()
        this.loaded = true
      } catch (err) {
        this.error = err instanceof Error ? err.message : '레이싱 결과를 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    },

    async ensureLoaded() {
      if (this.loaded) return
      if (!this.loading) await this.load()
    },

    /**
     * 라이브 종료 결과를 임시 보관한다. target='없음'도 보관(태깅 목적). 거리 0 이면 버린다.
     * 실제 RunLog 매칭/태깅/결과생성은 다음 HealthKit 동기화 때 linkPendingResults 가 한다.
     */
    recordFinish(input: RaceFinishInput) {
      if (!isMeaningfulFinish(input.racedDistanceM)) return
      const pending: PendingSelfRace = {
        id: nanoid(),
        createdAt: new Date().toISOString(),
        ...deriveResultFields(input)
      }
      // localStorage 를 기준으로 병합해 (store 미로드 상태에서도) 기존 보류를 덮어쓰지 않는다.
      const next = [...loadPending(), pending]
      this.pending = next
      persistPending(next)
    },

    /**
     * 보류 결과를 현재 import 된 RunLog 들과 매칭한다. HealthKit 동기화 직후 호출.
     * 매칭 성공 → 'self-race' 태깅 + (타겟 있으면) CompetitionResult 생성, 보류 제거.
     * 만료된 보류는 버린다. 부분 실패(태깅 ok·결과 insert 실패)는 보류 유지로 다음 동기화에 재시도.
     */
    async linkPendingResults() {
      if (!this.pending.length) return
      await this.ensureLoaded()
      const runStore = useRunStore()
      const now = Date.now()
      const linkedRunIds = new Set(this.results.map((r) => r.linkedRunId).filter((id): id is string => Boolean(id)))
      const survivors: PendingSelfRace[] = []

      for (const pending of this.pending) {
        if (isPendingExpired(pending, now, PENDING_MAX_AGE_MS)) continue
        const candidates = runStore.runs.filter((run) => !linkedRunIds.has(run.id))
        const match = pickBestMatch(candidates, pending)
        if (!match) {
          survivors.push(pending)
          continue
        }
        linkedRunIds.add(match.id)

        // (a) 'self-race' 태깅(멱등). type 은 건드리지 않는다.
        if (!(match.tags ?? []).includes(SELF_RACE_TAG)) {
          try {
            await runStore.updateRun({ ...match, tags: addSelfRaceTag(match.tags) })
          } catch {
            survivors.push(pending) // 태깅 실패 → 다음 동기화에 재시도
            continue
          }
          // (a-2) §10/M2: 태깅이 '늦어' 그 사이 matchSessionIntent 가 처방 세션·의도를 이미 소비했을 수 있다
          // (정규 sync 가 importCompetitionRun 보다 먼저 이겨 무태그로 유입된 경우 — 부상복귀 Easy 가 50m 레이싱에
          //  'done' 으로 먹히던 버그). 태그가 막 붙은 '지금' 그 점유를 즉시 되돌려, 다음 doEnsureSchedule 의 G4 까지
          // 기다리지 않고 오늘의 처방을 planned 로 복원한다. 태그가 붙은 뒤이므로 reconcileRuns 재소비도 차단됨(멱등).
          try {
            await runStore.healSelfRaceLink(match.id)
          } catch {
            /* best-effort: 복원 실패해도 태그는 남아 다음 로드의 G4 가 청소 */
          }
        }

        // (b) 타겟이 있으면 CompetitionResult 생성. 없으면(자유 TT) 태깅만.
        if (pending.targetPb && pending.outcome && pending.resultGapSec != null) {
          try {
            await this.addResult({
              mode: 'self-pb',
              targetPb: pending.targetPb,
              racedDistanceM: pending.racedDistanceM,
              racedDurationSec: pending.racedDurationSec,
              resultGapSec: pending.resultGapSec,
              outcome: pending.outcome,
              linkedRunId: match.id,
              racedAt: pending.racedAt
            })
          } catch (err) {
            this.error = err instanceof Error ? err.message : '레이싱 결과 저장 실패'
            survivors.push(pending) // 결과 저장 실패 → 태그는 유지된 채 다음에 결과만 재시도
            continue
          }
        }
        // 매칭·처리 완료 → 보류 소비(survivors 에 넣지 않음)
      }

      this.pending = survivors
      persistPending(this.pending)
    },

    /**
     * RunLog 삭제 시 그 런에 링크된 경쟁 결과를 회수한다(#235 후속 M2). 좀비 결과가 다음 sync 에서
     * 엉뚱한 런에 재링크되거나 업적 사다리에 유령으로 남는 걸 막는다. best-effort — 실패해도 삭제는 진행.
     */
    async reclaimResultsForRun(runId: string): Promise<void> {
      if (isSupabaseConfigured) {
        await deleteCompetitionResultsByRunId(runId)
        this.results = this.results.filter((r) => r.linkedRunId !== runId)
        return
      }
      const next = loadLocalResults().filter((r) => r.linkedRunId !== runId)
      this.results = next
      persistLocalResults(next)
    },

    async addResult(input: CompetitionResultInput) {
      if (isSupabaseConfigured) {
        const result = await insertCompetitionResult(input)
        this.results = [result, ...this.results]
        return result
      }
      const now = new Date().toISOString()
      const memoryStore = useMemoryStore()
      const result: CompetitionResult = {
        ...input,
        id: nanoid(),
        userId: memoryStore.selectedUserId,
        createdAt: now,
        updatedAt: now
      }
      this.results = [result, ...this.results]
      persistLocalResults(this.results)
      return result
    }
  }
})

function loadPending(): PendingSelfRace[] {
  return parseArray<PendingSelfRace>(pendingKey)
}

function persistPending(pending: PendingSelfRace[]) {
  try {
    localStorage.setItem(pendingKey, JSON.stringify(pending))
  } catch {
    // 저장 실패는 치명적 아님(다음 종료 때 다시 시도)
  }
}

function loadLocalResults(): CompetitionResult[] {
  return parseArray<CompetitionResult>(resultsKey)
}

function persistLocalResults(results: CompetitionResult[]) {
  try {
    localStorage.setItem(resultsKey, JSON.stringify(results))
  } catch {
    // 저장 실패는 치명적 아님
  }
}

function parseArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

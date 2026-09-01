import { defineStore } from 'pinia'
import {
  deleteCrossTrainingSession,
  fetchCrossTrainingSessions,
  insertCrossTrainingSessions,
  type CrossTrainingSession,
  type CrossTrainingSessionDraft
} from '@/shared/api/crossTrainingRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import type { HealthKitCrossTrainingCandidate } from '@/features/import-healthkit-run/healthKitBridge'

/**
 * 러닝 대체 운동(#739). 장마·더위·부상 복귀로 러닝을 못 할 때 한 운동을 **사실 그대로** 남긴다.
 *
 * ⚠️ 이 스토어의 값은 **러닝 통계에 절대 섞이지 않는다** — 주간 볼륨(km)·VDOT·처방 앵커는
 * `runStore` 만 본다. 여기 있는 건 "며칠에 무엇을 얼마나 했나"이지 러닝 부하가 아니다.
 * 환산(자전거 X분 = 러닝 Y km)은 검증된 공식이 없어 **하지 않는다**(#739 리서치 ⚠1).
 */
export const useCrossTrainingStore = defineStore('crossTrainingStore', {
  state: () => ({
    sessions: [] as CrossTrainingSession[],
    loaded: false,
    loading: false,
    error: ''
  }),
  getters: {
    /** 특정 날짜의 대체 운동(그날 훈련 카드에 "자전거 42분"을 붙일 때 쓴다). */
    byDate: (state) => (date: string) => state.sessions.filter((item) => item.date === date),
    /** 기간 내 총 분. **거리로 환산하지 않는다** — 종목 간 비교 가능한 건 시간뿐이다. */
    totalMinutesBetween: (state) => (startDate: string, endDate: string) =>
      state.sessions
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .reduce((sum, item) => sum + Math.round((item.durationSec ?? 0) / 60), 0)
  },
  actions: {
    async load() {
      if (!isSupabaseConfigured || this.loading) return
      this.loading = true
      try {
        this.sessions = await fetchCrossTrainingSessions()
        this.loaded = true
        this.error = ''
      } catch (err) {
        this.error = err instanceof Error ? err.message : '대체 운동 기록을 불러오지 못했습니다.'
      } finally {
        this.loading = false
      }
    },
    /**
     * HealthKit 후보를 저장한다. 이미 있는 워크아웃은 유니크 인덱스가 막으므로 조용히 넘어간다
     * (덮어쓰지 않는다 — 사용자가 단 메모·RPE 를 지우면 안 된다).
     */
    async ingestFromHealthKit(candidates: HealthKitCrossTrainingCandidate[]) {
      if (!isSupabaseConfigured || !candidates.length) return
      if (!this.loaded) await this.load()
      const known = new Set(this.sessions.map((item) => item.externalId).filter(Boolean))
      const drafts: CrossTrainingSessionDraft[] = candidates
        .filter((candidate) => candidate.externalId && !known.has(candidate.externalId))
        .map((candidate) => ({
          externalId: candidate.externalId,
          modality: candidate.modality,
          indoor: candidate.indoor,
          date: candidate.date,
          startAt: candidate.startAt || null,
          endAt: candidate.endAt || null,
          durationSec: candidate.durationSec === null ? null : Math.round(candidate.durationSec),
          avgHeartRate: candidate.avgHeartRate === null ? null : Math.round(candidate.avgHeartRate),
          maxHeartRate: candidate.maxHeartRate === null ? null : Math.round(candidate.maxHeartRate),
          activeEnergyKcal: candidate.activeEnergyKcal === null ? null : Math.round(candidate.activeEnergyKcal),
          rpe: null,
          source: 'healthkit',
          sourceName: candidate.sourceName,
          note: ''
        }))
      if (!drafts.length) return
      try {
        const inserted = await insertCrossTrainingSessions(drafts)
        if (inserted.length) {
          this.sessions = [...inserted, ...this.sessions].sort((a, b) => b.date.localeCompare(a.date))
        }
      } catch (err) {
        // best-effort: 대체 운동 저장 실패가 러닝 동기화를 막지 않는다.
        this.error = err instanceof Error ? err.message : '대체 운동 저장에 실패했습니다.'
      }
    },
    async remove(id: string) {
      await deleteCrossTrainingSession(id)
      this.sessions = this.sessions.filter((item) => item.id !== id)
    }
  }
})

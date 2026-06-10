import { defineStore } from 'pinia'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import {
  fetchLevelState,
  saveLevelState,
  updateAcknowledged,
  insertReward,
  insertQuestLog,
  hasQuestLog,
  fetchCoinTotal,
  type LevelPlacementInput,
  type LevelStateRow
} from '@/shared/api/levelStateRepository'
import { COIN_REWARD, detectLevelUps, type LevelUpEvent, type RunnerProgress } from '@/shared/lib/level/levelModel'

export type PendingCelebration = { events: LevelUpEvent[]; coins: number }

/** 해당 날짜가 속한 주의 월요일(YYYY-MM-DD, 로컬). 주간 루틴 idempotency 키. */
function mondayKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const offset = (d.getDay() + 6) % 7 // 월=0
  d.setDate(d.getDate() - offset)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

/**
 * 레벨 상태 스토어 (#263 온보딩 게이트 / #277 보상·축하).
 * needsOnboarding: 로드 완료 + (행 없음 또는 placed_at 없음).
 * 보상은 전부 자동·idempotent(acknowledged 갱신 + quest_log 키). 코인은 등급에 영향 없는 참여 보상.
 */
export const useLevelStore = defineStore('levelStore', {
  state: () => ({
    row: null as LevelStateRow | null,
    loaded: false,
    loading: false,
    error: '',
    coins: 0,
    pendingCelebration: null as PendingCelebration | null,
    syncing: false
  }),
  getters: {
    needsOnboarding: (state): boolean => state.loaded && (state.row === null || !state.row.placed_at),
    selfReportedMaxDistanceM: (state): number | null => state.row?.self_reported_max_distance_m ?? null
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
        this.row = await fetchLevelState()
        this.coins = await fetchCoinTotal()
      } catch (err) {
        this.error = err instanceof Error ? err.message : '레벨 상태를 불러오지 못했습니다.'
      } finally {
        this.loaded = true
        this.loading = false
      }
    },
    async complete(input: LevelPlacementInput) {
      this.row = await saveLevelState(input)
    },
    /**
     * 진척을 acknowledged 와 비교해 레벨업 보상/축하를 처리하고, 주간 루틴 완주 코인을 적립한다.
     * 전부 자동: 첫 감지는 baseline(소급 축하 방지), 이후 클래스/등급 상승만 코인+축하.
     */
    async syncRewards(progress: RunnerProgress, weeklyDone: number, weeklyTarget: number, lastSelfRaceRunId: string | null = null, today = new Date()) {
      if (!isSupabaseConfigured || !this.row || this.syncing) return
      this.syncing = true
      try {
        const curClass = progress.distanceClass.key
        const curGrade = progress.grade?.key ?? null
        const { baseline, events } = detectLevelUps(curClass, curGrade, this.row.acknowledged_class, this.row.acknowledged_grade)

        if (baseline) {
          this.row = (await updateAcknowledged(curClass, curGrade)) ?? this.row
        } else if (events.length) {
          for (const event of events) {
            await insertReward('coin', event.coins, `${event.kind}_up:${event.toKey}`)
          }
          this.row = (await updateAcknowledged(curClass, curGrade)) ?? this.row
          this.pendingCelebration = { events, coins: events.reduce((sum, e) => sum + e.coins, 0) }
        }

        // 주간 루틴 완주(주당 목표 달성) — 주 월요일 키로 1회만 적립.
        if (weeklyTarget > 0 && weeklyDone >= weeklyTarget) {
          const weekKey = mondayKey(today)
          if (!(await hasQuestLog('routine', weekKey))) {
            await insertQuestLog('routine', weekKey, COIN_REWARD.weeklyRoutine)
            await insertReward('coin', COIN_REWARD.weeklyRoutine, `routine_week:${weekKey}`)
          }
        }

        // 유지 점검: self-race(나만의 레이싱/타임트라이얼 재측정) 1건당 +20, run_id 키로 1회만.
        if (lastSelfRaceRunId && !(await hasQuestLog('maintenance', lastSelfRaceRunId))) {
          await insertQuestLog('maintenance', lastSelfRaceRunId, COIN_REWARD.maintenance)
          await insertReward('coin', COIN_REWARD.maintenance, `maintenance:${lastSelfRaceRunId}`)
        }

        this.coins = await fetchCoinTotal()
      } catch (err) {
        this.error = err instanceof Error ? err.message : '보상 동기화에 실패했습니다.'
      } finally {
        this.syncing = false
      }
    },
    dismissCelebration() {
      this.pendingCelebration = null
    }
  }
})

import { defineStore } from 'pinia'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { fetchLevelState, saveLevelState, type LevelPlacementInput, type LevelStateRow } from '@/shared/api/levelStateRepository'

/**
 * 레벨 상태 스토어 (#263). 온보딩 게이트와 자기보고 잠정 배치를 보관한다.
 * needsOnboarding: 로드 완료 + (행 없음 또는 placed_at 없음).
 */
export const useLevelStore = defineStore('levelStore', {
  state: () => ({
    row: null as LevelStateRow | null,
    loaded: false,
    loading: false,
    error: ''
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
      } catch (err) {
        this.error = err instanceof Error ? err.message : '레벨 상태를 불러오지 못했습니다.'
      } finally {
        this.loaded = true
        this.loading = false
      }
    },
    async complete(input: LevelPlacementInput) {
      this.row = await saveLevelState(input)
    }
  }
})

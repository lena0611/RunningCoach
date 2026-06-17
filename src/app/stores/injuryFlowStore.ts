import { defineStore } from 'pinia'

/**
 * 코치 모먼트(대시보드) → 전용 부상 시트(App.vue) 오픈 요청 브리지 (#386).
 * 대시보드가 직접 못 여는 시트를, 요청 플래그로 App.vue 가 감지해 연다.
 */
export const useInjuryFlowStore = defineStore('injuryFlowStore', {
  state: () => ({
    /** 'screening' = 새 부상 스크리닝 시트 요청. null = 없음. */
    request: null as 'screening' | null
  }),
  actions: {
    requestScreening() {
      this.request = 'screening'
    },
    clear() {
      this.request = null
    }
  }
})

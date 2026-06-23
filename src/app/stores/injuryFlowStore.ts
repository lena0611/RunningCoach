import { defineStore } from 'pinia'
import type { RestReason } from '@/entities/training-memory/model'

/**
 * 코치 모먼트(대시보드) → 전용 부상 시트(App.vue) 오픈 요청 브리지 (#386).
 * 대시보드가 직접 못 여는 시트를, 요청 플래그로 App.vue 가 감지해 연다.
 *
 * 역방향(#473 PR3): 부상 체크인 시트(App.vue) → 대시보드 휴식 선언 시트.
 * "한동안 쉴게요" 진입을 restRequest 로 대시보드가 감지해 RestDeclarationSheet 를 연다.
 */
export const useInjuryFlowStore = defineStore('injuryFlowStore', {
  state: () => ({
    /** 'screening' = 새 부상 스크리닝 시트 요청. null = 없음. */
    request: null as 'screening' | null,
    /** 휴식 선언 시트 오픈 요청 + 프리셋 이유(부상 체크인 진입이면 'injury'). null = 없음. */
    restRequest: null as RestReason | null
  }),
  actions: {
    requestScreening() {
      this.request = 'screening'
    },
    clear() {
      this.request = null
    },
    requestRestDeclaration(reason: RestReason = 'injury') {
      this.restRequest = reason
    },
    clearRest() {
      this.restRequest = null
    }
  }
})

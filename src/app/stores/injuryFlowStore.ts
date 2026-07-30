import { defineStore } from 'pinia'
import type { RestReason } from '@/entities/training-memory/model'

/**
 * 코치 모먼트(대시보드) → 전용 부상 시트(App.vue) 오픈 요청 브리지 (#386).
 * 대시보드가 직접 못 여는 시트를, 요청 플래그로 App.vue 가 감지해 연다.
 *
 * 역방향(#473 PR3): 부상 체크인 시트(App.vue) → 대시보드 휴식 선언 시트.
 * "한동안 쉴게요" 진입을 restRequest 로 대시보드가 감지해 RestDeclarationSheet 를 연다.
 *
 * 같은 역방향 경로를 코치 대화 제안(#639 declare_rest)도 재사용한다 — 진입점만 늘고 동작은 동일하다.
 * (이름이 부상 전용처럼 보이는 부채는 인지하고 있다. 변경면을 넓히지 않으려 v1 에선 유지한다.)
 */
export const useInjuryFlowStore = defineStore('injuryFlowStore', {
  state: () => ({
    /** 'screening' = 새 부상 스크리닝 시트 요청. null = 없음. */
    request: null as 'screening' | null,
    /** 휴식 선언 시트 오픈 요청 + 프리셋 이유(부상 체크인 진입이면 'injury'). null = 없음. */
    restRequest: null as RestReason | null,
    /**
     * 휴식 종료일 프리셋(YYYY-MM-DD). 코치 제안(#639)이 **사용자가 발화에서 명시한** 기간을 옮겨줄 때만 채운다.
     * null 이면 시트 기본값을 쓴다 — 기간은 코치가 아니라 사용자가 정한다(SSOT §80).
     */
    restRequestUntil: null as string | null
  }),
  actions: {
    requestScreening() {
      this.request = 'screening'
    },
    clear() {
      this.request = null
    },
    requestRestDeclaration(reason: RestReason = 'injury', untilDate: string | null = null) {
      this.restRequest = reason
      this.restRequestUntil = untilDate
    },
    clearRest() {
      this.restRequest = null
      this.restRequestUntil = null
    }
  }
})

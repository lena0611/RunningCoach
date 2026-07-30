import { defineStore } from 'pinia'

/**
 * 코치 대화 제안(#639) → 실제 액션 화면 오픈 요청 브리지.
 *
 * 코치 카드는 스케줄을 **직접 바꾸지 않는다.** 대신 이 스토어에 "어느 날 세션을 보여달라"고 요청하고,
 * 코치 탭이 그 날짜로 이동해 **기존 세션 카드(더 쉽게/더 강하게/다른 날로/놓아주기)** 를 띄운다.
 * 이렇게 하면 키 세션 재배치 선권유(SSOT §36)·주간 하드부하 소프트 경고(§37)·되돌리기가
 * 전부 기존 경로 그대로 붙는다 — 카드가 직접 변이하면 이 가드를 복제해야 하고, 복제는 어긋난다.
 *
 * 휴식 선언은 이 스토어를 쓰지 않는다 — 이미 있는 injuryFlowStore.requestRestDeclaration 경로
 * (부상 체크인 "한동안 쉴게요"와 동일)를 재사용한다.
 */
export const useCoachActionBridgeStore = defineStore('coachActionBridgeStore', {
  state: () => ({
    /** 코치 탭이 포커스할 세션 날짜(YYYY-MM-DD). null = 요청 없음. */
    focusDate: null as string | null
  }),
  actions: {
    focusSession(date: string) {
      this.focusDate = date
    },
    clearFocus() {
      this.focusDate = null
    }
  }
})

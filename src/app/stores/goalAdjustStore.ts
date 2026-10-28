import { defineStore } from 'pinia'

/**
 * '목표 다시 정하기' 시트(#889)의 열림 상태. 시트는 App 레벨에 하나 두고, 코치 모먼트·코치 탭·요약 탭·기억 탭
 * 어디서든 이 스토어로 연다(스택은 App 레벨 오버레이 — 탭 자식이면 다른 탭에서 못 연다).
 */
export const useGoalAdjustStore = defineStore('goalAdjust', {
  state: () => ({
    open: false,
    /** 열 목표. null 이면 활성 목표. */
    goalId: null as string | null
  }),
  actions: {
    show(goalId: string | null = null) {
      this.goalId = goalId
      this.open = true
    },
    close() {
      this.open = false
    }
  }
})

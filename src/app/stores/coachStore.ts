import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RunLog } from '@/entities/run/model'

/**
 * 코치 세션 런처 스토어 — 스택을 탭에서 분리(독립 구조)하기 위한 첫 단계.
 *
 * AI 코칭은 어느 탭(요약/기록)에서든 열릴 수 있어야 하고, 닫으면 호출한 탭(스크롤 그대로)으로
 * 복귀해야 한다. 기존엔 코치 뷰가 기록탭(RunLogPage) 안에 있어 다른 탭에서 열려면 라우팅(탭 점프)이
 * 필요했다 — 게다가 탭은 지연로드라 방문 전엔 마운트조차 안 됨.
 *
 * 그래서 코치 뷰는 App 레벨 컴포넌트(CoachSessionOverlay)로 올리고, 이 스토어가 "지금 코칭 중인 런"
 * 하나만 들고 있는다. open(run)/close()는 어디서든 호출 가능하며, 오버레이는 현재 탭 위에 뜬다.
 */
export const useCoachStore = defineStore('coach', () => {
  // 코칭 대상 런. null이면 코치 오버레이 닫힘.
  const activeRun = ref<RunLog | null>(null)

  function open(run: RunLog) {
    activeRun.value = run
  }

  function close() {
    activeRun.value = null
  }

  return { activeRun, open, close }
})

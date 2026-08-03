import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RunLog } from '@/entities/run/model'

/**
 * 코치 세션 런처 스토어 — 스택을 탭에서 분리(독립 구조)하기 위한 첫 단계.
 *
 * AI 코칭은 어느 탭(요약/기록)에서든 열릴 수 있어야 하고, 닫으면 호출한 탭(스크롤 그대로)으로
 * 복귀해야 한다. 기존엔 코치 뷰가 기록탭(RunLogPage) 안에 있어 다른 탭에서 열려면 라우팅(탭 점프)이
 * 필요했다 — 게다가 탭은 지연로드라 방문 전엔 마운트조차 안 됨.
 *
 * 그래서 코치 뷰는 App 레벨 컴포넌트(CoachSessionOverlay)로 올리고, 이 스토어가 현재 대화 범위를
 * 들고 있는다. open·openGlobal·close 는 어디서든 호출 가능하며, 오버레이는 현재 탭 위에 뜬다.
 *
 * **범위(scope) 2종(#616):**
 * - `session` — 특정 런의 디브리핑. 리포트가 그 런에 귀속(`selected_run_id = run.id`).
 * - `global` — 런과 무관한 일상 대화(휴식·일정·컨디션·개념질문). 리포트는 `selected_run_id = null`.
 *
 * `activeRun` 만으로 열림을 판정하지 않는 이유: 전역 대화는 런이 없는 채로 **열려 있는** 상태라
 * "런 없음 = 닫힘" 이 성립하지 않는다.
 */
export type CoachScope = 'session' | 'global'

export const useCoachStore = defineStore('coach', () => {
  /** 현재 대화 범위. null 이면 오버레이 닫힘. */
  const scope = ref<CoachScope | null>(null)
  /** 코칭 대상 런. scope === 'global' 이면 항상 null. */
  const activeRun = ref<RunLog | null>(null)

  const isOpen = computed(() => scope.value !== null)

  /** 특정 런의 세션 코칭을 연다. */
  function open(run: RunLog) {
    scope.value = 'session'
    activeRun.value = run
  }

  /** 런에 매이지 않는 전역 대화를 연다(#616). */
  function openGlobal() {
    scope.value = 'global'
    activeRun.value = null
  }

  function close() {
    scope.value = null
    activeRun.value = null
  }

  return { scope, activeRun, isOpen, open, openGlobal, close }
})

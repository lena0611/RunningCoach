import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RunLog } from '@/entities/run/model'

/**
 * 세션 상세(런 상세)를 App 레벨 독립 오버레이로 띄우기 위한 스토어(코치 오버레이 coachStore 패턴과 동일).
 *
 * 어느 탭(대시보드·기록·추세)·알림에서 열든 그 탭 위에 떠 있고, 닫으면 라우팅 없이 원래 탭(스크롤 보존)으로 복귀한다.
 * 상세 마크업/편집/삭제 로직을 페이지마다 중복하던 것을 단일 SessionDetailOverlay 로 모은다.
 * activeRun 이 null 이면 오버레이는 닫힌 상태.
 */
export const useSessionDetailStore = defineStore('sessionDetail', () => {
  const activeRun = ref<RunLog | null>(null)
  /** 다른 스택(주간거리 상세·추세 렌즈 등) 위에서 열렸는가 — StackPage back(push) 형식 결정(2026-07-04). */
  const nested = ref(false)

  function open(run: RunLog, options: { nested?: boolean } = {}) {
    activeRun.value = run
    nested.value = Boolean(options.nested)
  }

  function close() {
    activeRun.value = null
    nested.value = false
  }

  return { activeRun, nested, open, close }
})

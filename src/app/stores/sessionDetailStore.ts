import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
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
    /**
     * 무거운 데이터(경로 좌표·구간 샘플·랩) 지연 로드(#661). 목록은 이 배열들을 받아오지 않으므로
     * 지도·랩 차트가 필요한 이 화면에서 채운다. **먼저 열고 나중에 채운다** — 조회를 기다리면
     * 상세 진입이 눈에 보이게 느려진다. 도착하면 activeRun 을 교체해 차트가 다시 그려진다.
     */
    if (run.heavyDataLoaded) return
    void useRunStore()
      .ensureHeavyData(run.id)
      .then((loaded) => {
        // 그 사이 사용자가 닫거나 다른 런을 열었으면 덮어쓰지 않는다.
        if (loaded && activeRun.value?.id === loaded.id) activeRun.value = loaded
      })
  }

  function close() {
    activeRun.value = null
    nested.value = false
  }

  return { activeRun, nested, open, close }
})

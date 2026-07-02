import { defineStore } from 'pinia'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { useRunStore } from '@/app/stores/runStore'
import {
  ackWatchResult,
  hasWatchRaceBridge,
  pushWatchCatalog,
  registerWatchRaceBridge,
  requestQueuedWatchResults,
  unregisterWatchRaceBridge,
  type WatchRaceResultPayload
} from '@/features/watch-race/watchRaceBridge'
import { buildWatchRaceCatalog } from '@/features/watch-race/watchRaceCatalog'

/**
 * 워치 레이싱 동기화 store (#552 Phase 3).
 * - init: 브리지 등록 + 네이티브 큐에 쌓인 워치 결과 pull(웹뷰 준비 시점 문제 해소).
 * - 결과 수신: competitionStore.recordFinish(보류 기록, watchResultId 멱등) → ACK → 즉시 매칭 시도.
 *   실제 태깅·승패 생성은 기존 linkPendingResults 파이프라인 재사용 — 워치 워크아웃은 HK 메타로
 *   생성 시점부터 태깅되므로(#9 유입경로) 처방 세션 오소비 경합이 새로 생기지 않는다.
 * - 카탈로그 push: runs 가 바뀔 때 App.vue 가 pushCatalog() 를 부른다(디바운스는 호출부).
 */
export const useWatchRaceStore = defineStore('watchRaceStore', {
  state: () => ({
    initialized: false,
    lastPushedAt: 0,
    lastResultAt: 0
  }),
  actions: {
    init() {
      if (this.initialized) return
      registerWatchRaceBridge({
        onResult: (payload) => void this.handleResult(payload)
      })
      this.initialized = true
      // 네이티브 큐 pull — 앱이 꺼져 있는 동안 워치가 보낸 결과를 즉시 수거.
      if (hasWatchRaceBridge()) requestQueuedWatchResults()
    },

    dispose() {
      unregisterWatchRaceBridge()
      this.initialized = false
    },

    async handleResult(payload: WatchRaceResultPayload) {
      const competitionStore = useCompetitionStore()
      competitionStore.recordFinish({
        racedAt: payload.racedAt,
        racedDistanceM: payload.racedDistanceM,
        racedDurationSec: payload.racedDurationSec,
        targetPb: payload.targetPb,
        finalGap: payload.finalGap,
        watchResultId: payload.id
      })
      // 보류가 localStorage 에 영속된 뒤 ACK — 유실돼도 재전송+멱등 가드로 안전.
      ackWatchResult(payload.id)
      this.lastResultAt = Date.now()
      // 워크아웃(HealthKit)이 결과보다 먼저 도착해 있을 수 있으므로 즉시 1회 매칭 시도.
      // 실패/미매칭은 정상 — 다음 HealthKit 동기화의 linkSelfRaceResults 가 재시도한다.
      try {
        await competitionStore.linkPendingResults()
      } catch {
        /* best-effort */
      }
    },

    /** 현재 runs 로 카탈로그를 조립해 네이티브(→워치)로 민다. 브리지 없으면 no-op. */
    pushCatalog() {
      if (!hasWatchRaceBridge()) return
      const runStore = useRunStore()
      pushWatchCatalog(buildWatchRaceCatalog(runStore.runs, new Date().toISOString()))
      this.lastPushedAt = Date.now()
    }
  }
})

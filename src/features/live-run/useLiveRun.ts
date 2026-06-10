import { onUnmounted, ref, shallowRef } from 'vue'
import {
  beginLiveRun,
  isLiveRunBridgeAvailable,
  pauseLiveRun,
  registerLiveRunBridge,
  requestRecoverableLiveRun,
  resumeLiveRun,
  startLiveRun,
  stopLiveRun,
  unregisterLiveRunBridge,
  type LiveErrorPayload,
  type LiveGapPayload,
  type LivePermissionStatus,
  type LiveRecoverablePayload,
  type LiveRunState,
  type LiveTickPayload,
  type StartLiveRunParams
} from './liveRunBridge'

/**
 * 가상레이싱 라이브 트래킹(#229 `runContextLiveRun`)을 Vue에서 쓰기 위한 컴포저블.
 * 네이티브가 백그라운드 권위(틱/gap/발화)이고, 여기서는 포그라운드 표시용 상태만 보관한다.
 * 마운트 시 수신 핸들러를 등록하고 언마운트 시 해제한다.
 */
export function useLiveRun() {
  const available = isLiveRunBridgeAvailable()
  const state = ref<LiveRunState>('idle')
  const permission = ref<LivePermissionStatus | null>(null)
  const tick = shallowRef<LiveTickPayload | null>(null)
  const gap = shallowRef<LiveGapPayload | null>(null)
  const error = ref<LiveErrorPayload | null>(null)
  const recoverable = shallowRef<LiveRecoverablePayload | null>(null)
  const diagnostic = ref<string | null>(null)

  registerLiveRunBridge({
    onTick(payload) {
      tick.value = payload
      error.value = null // 틱이 들어오면(파이프라인 동작) 직전 일시 오류 해제
    },
    onGap(payload) {
      gap.value = payload
    },
    onStateChange(next) {
      state.value = next
    },
    onPermission(status) {
      permission.value = status
    },
    onRecoverable(snapshot) {
      recoverable.value = snapshot
    },
    onError(payload) {
      error.value = payload
    },
    onDiagnostic(text) {
      diagnostic.value = text
    }
  })

  onUnmounted(() => {
    unregisterLiveRunBridge()
  })

  function start(params: StartLiveRunParams) {
    error.value = null
    tick.value = null
    gap.value = null
    startLiveRun(params)
  }

  return {
    available,
    state,
    permission,
    tick,
    gap,
    error,
    recoverable,
    diagnostic,
    start,
    begin: beginLiveRun,
    pause: pauseLiveRun,
    resume: resumeLiveRun,
    stop: stopLiveRun,
    requestRecoverable: requestRecoverableLiveRun
  }
}

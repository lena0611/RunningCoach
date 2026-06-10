import type { GhostCurvePoint, LeadState } from '@/shared/lib/selfRace/ghost'

/**
 * 가상레이싱 `나와의 대결` 라이브 트래킹 브리지 — `runContextLiveRun` (#229, competition-domain §9.3).
 *
 * 경계(§9.1): 시간 임계 루프(틱→gap/역전 비교→음성 발화)는 **네이티브**가 백그라운드에서 돈다.
 *   - web→native: startLiveRun / pauseLiveRun / resumeLiveRun / stopLiveRun / requestRecoverableLiveRun
 *   - native→web(`window.RunContextLiveRun.*`): receiveTick / receiveGap / receiveStateChange /
 *     receivePermission / receiveRecoverable / receiveError (포그라운드 표시·요약용)
 *
 * 고스트 곡선은 정적이라 시작 시 1회 주입한다(타겟 '없음'이면 생략). 좌표(위경도)는 틱에 없다.
 * 비교 알고리즘 단일 기준은 `src/shared/lib/selfRace/ghost.ts`(#230); 네이티브가 이를 포팅한다.
 */

export type LiveRunMode = 'solo'

export type PeriodicAnnounceKind = 'distance' | 'time' | 'silent'

export type AnnounceConfig = {
  periodic: {
    kind: PeriodicAnnounceKind
    /** kind==='distance' 일 때 발화 간격(m). */
    stepM?: 100 | 500 | 1000
    /** kind==='time' 일 때 발화 간격(초). */
    stepSec?: number
  }
  reversalAlert: boolean
}

export type StartLiveRunParams = {
  sessionId: string
  mode: LiveRunMode
  /** 정적 고스트 곡선(출발선부터 누적거리↔경과시간). 타겟 '없음'이면 생략. */
  ghostCurve?: GhostCurvePoint[]
  announceConfig: AnnounceConfig
  /** 목표 거리(m). 누적거리가 이를 넘으면 네이티브가 백그라운드에서 자동 완주. 미지정/0이면 수동 종료. */
  targetDistanceM?: number | null
  /** 틱 전송 간격(ms). 미지정 시 네이티브 기본(~1Hz). */
  tickIntervalMs?: number
}

export type LiveSignalState = 'ok' | 'weak' | 'lost'
export type LiveDistanceSource = 'gps' | 'pedometer'
export type LiveRunState = 'idle' | 'ready' | 'running' | 'paused' | 'stopped'
export type LivePermissionStatus = 'notDetermined' | 'whenInUse' | 'always' | 'denied' | 'restricted'

/** 좌표 없는 ~1Hz 틱(포그라운드 표시용). 2차 실시간 레이스 broadcast 페이로드와 형태 일치. */
export type LiveTickPayload = {
  seq: number
  elapsedSec: number
  cumulativeDistanceM: number
  instantPaceSec: number | null
  signalState: LiveSignalState
  source: LiveDistanceSource
}

export type LiveGapPayload = {
  timeGapSec: number
  leadState: LeadState
}

export type LiveRecoverablePayload = {
  sessionId: string
  elapsedSec: number
  cumulativeDistanceM: number
  seq: number
  state: LiveRunState
}

export type LiveErrorPayload = {
  code: string
  message: string
}

type LiveRunBridgeHandlers = {
  onTick: (tick: LiveTickPayload) => void
  onGap: (gap: LiveGapPayload) => void
  onStateChange: (state: LiveRunState) => void
  onPermission: (status: LivePermissionStatus) => void
  onRecoverable: (snapshot: LiveRecoverablePayload | null) => void
  onError: (error: LiveErrorPayload) => void
  onDiagnostic?: (text: string) => void
}

declare global {
  interface Window {
    RunContextLiveRun?: {
      receiveTick: (tick: LiveTickPayload) => void
      receiveGap: (gap: LiveGapPayload) => void
      receiveStateChange: (state: LiveRunState) => void
      receivePermission: (status: LivePermissionStatus) => void
      receiveRecoverable: (snapshot: LiveRecoverablePayload | null) => void
      receiveError: (error: LiveErrorPayload) => void
      receiveDiagnostic: (text: string) => void
    }
  }
}

const bridgeUnavailable = 'iOS 라이브 트래킹 브리지가 연결되어 있지 않습니다. 가상레이싱은 iOS 앱에서만 가능합니다.'

export function registerLiveRunBridge(handlers: LiveRunBridgeHandlers) {
  window.RunContextLiveRun = {
    receiveTick(tick) {
      handlers.onTick(normalizeTick(tick))
    },
    receiveGap(gap) {
      handlers.onGap(normalizeGap(gap))
    },
    receiveStateChange(state) {
      handlers.onStateChange(state)
    },
    receivePermission(status) {
      handlers.onPermission(status)
    },
    receiveRecoverable(snapshot) {
      handlers.onRecoverable(snapshot ?? null)
    },
    receiveError(error) {
      handlers.onError({
        code: error?.code ?? 'unknown',
        message: error?.message || '라이브 트래킹 오류'
      })
    },
    receiveDiagnostic(text) {
      handlers.onDiagnostic?.(text)
    }
  }
}

export function unregisterLiveRunBridge() {
  delete window.RunContextLiveRun
}

export function isLiveRunBridgeAvailable(): boolean {
  return Boolean(window.webkit?.messageHandlers?.runContextLiveRun)
}

export function startLiveRun(params: StartLiveRunParams) {
  const handler = window.webkit?.messageHandlers?.runContextLiveRun
  if (!handler) throw new Error(bridgeUnavailable)
  handler.postMessage({
    type: 'startLiveRun',
    sessionId: params.sessionId,
    mode: params.mode,
    ghostCurve: params.ghostCurve ?? null,
    announceConfig: params.announceConfig,
    targetDistanceM: params.targetDistanceM ?? null,
    tickIntervalMs: params.tickIntervalMs ?? null
  })
}

/** GPS 확보 후 명시적 시작(카운트다운 종료 시). startLiveRun(준비)으로 ready된 뒤 호출. */
export function beginLiveRun() {
  window.webkit?.messageHandlers?.runContextLiveRun?.postMessage({ type: 'beginLiveRun' })
}

export function pauseLiveRun() {
  window.webkit?.messageHandlers?.runContextLiveRun?.postMessage({ type: 'pauseLiveRun' })
}

export function resumeLiveRun() {
  window.webkit?.messageHandlers?.runContextLiveRun?.postMessage({ type: 'resumeLiveRun' })
}

export function stopLiveRun() {
  window.webkit?.messageHandlers?.runContextLiveRun?.postMessage({ type: 'stopLiveRun' })
}

export function requestRecoverableLiveRun() {
  window.webkit?.messageHandlers?.runContextLiveRun?.postMessage({ type: 'requestRecoverableLiveRun' })
}

function normalizeTick(tick: LiveTickPayload): LiveTickPayload {
  return {
    seq: numberOr(tick?.seq, 0),
    elapsedSec: numberOr(tick?.elapsedSec, 0),
    cumulativeDistanceM: numberOr(tick?.cumulativeDistanceM, 0),
    instantPaceSec: Number.isFinite(tick?.instantPaceSec as number) ? (tick.instantPaceSec as number) : null,
    signalState: tick?.signalState ?? 'ok',
    source: tick?.source ?? 'gps'
  }
}

function normalizeGap(gap: LiveGapPayload): LiveGapPayload {
  return {
    timeGapSec: numberOr(gap?.timeGapSec, 0),
    leadState: gap?.leadState ?? 'even'
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

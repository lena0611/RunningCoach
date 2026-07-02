import type { CompetitionTargetPb } from '@/entities/competition/model'
import type { GhostCurvePoint } from '@/shared/lib/selfRace/ghost'

/**
 * 워치 레이싱 앱 브리지 (#552 Phase 3).
 *
 * 웹 ↔ 폰 네이티브(PhoneWatchRelay) ↔ 워치(WCSession) 3홉의 웹 쪽 끝단.
 * - 하강(설정): 고스트 카탈로그(거리별 내 베스트 + 곡선)와 안내 설정을 네이티브로 밀면,
 *   네이티브가 WCSession applicationContext 로 워치에 동기화한다(폰을 집에 둬도 워치가 최신 카탈로그 보유).
 * - 상승(결과): 워치 완주 결과를 네이티브가 큐잉해 웹으로 올린다. 웹은 receiveResult 마다
 *   ACK(ackResult)를 보내 네이티브 큐에서 제거한다 — ACK 유실 시 재전송되므로
 *   competitionStore.recordFinish 의 watchResultId 멱등 가드가 이중 보류를 막는다.
 *
 * 페이로드 모양은 네이티브 PhoneWatchRelay.swift / 워치 WatchSyncManager.swift 와 미러 계약이다.
 */

/** 워치로 내리는 고스트 카탈로그 항목. best=null 이면 그 거리는 자유 TT만 가능. */
export type WatchCatalogEntry = {
  distanceM: number
  label: string
  best: {
    elapsedSec: number
    avgPaceSec: number
    date: string
    sourceRunId: string
    /** 다운샘플된 고스트 곡선(단조증가, {0,0} 시작 — ghost.ts 좌표계). */
    curvePoints: GhostCurvePoint[]
  } | null
}

export type WatchRaceCatalogPayload = {
  generatedAt: string
  /** RaceCore AnnounceConfig.parse 가 그대로 읽는 모양(폰 레이스 음성 설정 미러 → 워치 햅틱 주기). */
  announceConfig: {
    periodic: { kind: 'distance' | 'time' | 'silent'; stepM?: number; stepSec?: number }
    reversalAlert: boolean
    gapMode: 'distance' | 'time'
  }
  /** 폰에서 마지막으로 고른 거리·상대 — 워치 기본 선택값(워치에서 오프라인 변경 가능). */
  lastSelection: { distanceM: number | null; opponentKind: 'none' | 'best' }
  entries: WatchCatalogEntry[]
}

/** 워치 완주 결과(상승). RaceFinishInput 과 1:1 — id 는 재전송 멱등 키. */
export type WatchRaceResultPayload = {
  id: string
  racedAt: string
  racedDistanceM: number
  racedDurationSec: number | null
  targetPb: CompetitionTargetPb | null
  finalGap: { timeGapSec: number; leadState: 'ahead' | 'behind' | 'even' } | null
}

type WatchRaceBridgeHandlers = {
  /** 워치 결과 수신. 처리(보류 기록) 후 반드시 ackResult(payload.id) 로 큐 제거를 알린다. */
  onResult: (payload: WatchRaceResultPayload) => void
}

declare global {
  interface Window {
    RunContextWatchRace?: {
      receiveResult: (payload: WatchRaceResultPayload) => void
    }
  }
}

export function registerWatchRaceBridge(handlers: WatchRaceBridgeHandlers) {
  window.RunContextWatchRace = {
    receiveResult(payload) {
      const normalized = normalizeResultPayload(payload)
      if (!normalized) return // 손상 페이로드는 무시(ACK 없이 큐에 남겨 진단 가능하게)
      handlers.onResult(normalized)
    }
  }
}

export function unregisterWatchRaceBridge() {
  delete window.RunContextWatchRace
}

export function hasWatchRaceBridge(): boolean {
  return Boolean(window.webkit?.messageHandlers?.runContextWatchRace)
}

/** 카탈로그를 네이티브로 민다(네이티브가 WCSession 으로 워치에 하강). 브리지 없으면 no-op. */
export function pushWatchCatalog(catalog: WatchRaceCatalogPayload) {
  window.webkit?.messageHandlers?.runContextWatchRace?.postMessage({ type: 'pushCatalog', catalog })
}

/** 네이티브 큐에 쌓인 워치 결과 전송을 요청한다(브리지 등록 직후 pull — 웹뷰 준비 시점 문제 해소). */
export function requestQueuedWatchResults() {
  window.webkit?.messageHandlers?.runContextWatchRace?.postMessage({ type: 'requestResults' })
}

/** 결과 처리 완료 ACK — 네이티브 큐에서 해당 결과를 제거한다. */
export function ackWatchResult(id: string) {
  window.webkit?.messageHandlers?.runContextWatchRace?.postMessage({ type: 'ackResult', id })
}

/** 네이티브에서 온 결과 페이로드 방어 정규화. 필수 필드가 깨졌으면 null. */
function normalizeResultPayload(payload: WatchRaceResultPayload): WatchRaceResultPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const { id, racedAt } = payload
  if (typeof id !== 'string' || !id) return null
  if (typeof racedAt !== 'string' || Number.isNaN(Date.parse(racedAt))) return null
  const racedDistanceM = typeof payload.racedDistanceM === 'number' && Number.isFinite(payload.racedDistanceM)
    ? payload.racedDistanceM
    : 0
  const racedDurationSec = typeof payload.racedDurationSec === 'number' && Number.isFinite(payload.racedDurationSec)
    ? payload.racedDurationSec
    : null
  const targetPb = normalizeTargetPb(payload.targetPb)
  const finalGap = normalizeFinalGap(payload.finalGap)
  return { id, racedAt, racedDistanceM, racedDurationSec, targetPb, finalGap }
}

function normalizeTargetPb(value: WatchRaceResultPayload['targetPb']): CompetitionTargetPb | null {
  if (!value || typeof value !== 'object') return null
  if (
    typeof value.distanceM !== 'number' || !Number.isFinite(value.distanceM) ||
    typeof value.elapsedSec !== 'number' || !Number.isFinite(value.elapsedSec) ||
    typeof value.sourceRunId !== 'string' || !value.sourceRunId
  ) {
    return null
  }
  return { distanceM: value.distanceM, elapsedSec: value.elapsedSec, sourceRunId: value.sourceRunId }
}

function normalizeFinalGap(value: WatchRaceResultPayload['finalGap']): WatchRaceResultPayload['finalGap'] {
  if (!value || typeof value !== 'object') return null
  if (typeof value.timeGapSec !== 'number' || !Number.isFinite(value.timeGapSec)) return null
  if (value.leadState !== 'ahead' && value.leadState !== 'behind' && value.leadState !== 'even') return null
  return { timeGapSec: value.timeGapSec, leadState: value.leadState }
}

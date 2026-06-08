/**
 * 경쟁 음성 안내 스케줄링 — 순수 로직 (#231, competition-domain §9.1·§9.3).
 *
 * ⚠️ 이 모듈은 음성 안내 **우선순위·dedupe 스케줄링의 canonical spec**이다.
 *   - 백그라운드 핵심 루프는 네이티브 `SpeechManager`(#231) / `GhostRaceEngine`(#229)이
 *     이 결정 규칙을 포팅해 `AVSpeechSynthesizer`를 직접 호출한다.
 *   - 포그라운드 웹(`runContextSpeech`)도 같은 규칙으로 트리거한다.
 *   - 안내 '문구' 자체는 #230 `formatAnnouncement`가 canonical(여기선 text를 그대로 받음).
 *   - Vitest 가 회귀 기준. TTS 음질/지연/ducking 은 실기기 PoC③·SpeechManager 영역.
 *
 * 규칙 요약:
 *   - high = 진행 중 발화를 interrupt 하고 즉시 발화.
 *   - normal = 발화 중이면 큐잉(FIFO), 비어 있으면 즉시 발화.
 *   - dedupeKey = 현재 발화 중이거나 큐에 이미 있는 같은 키면 드롭(같은 지점 재진입 중복 억제).
 */

export type SpeechPriority = 'normal' | 'high'

export type SpeechRequest = {
  text: string
  priority: SpeechPriority
  dedupeKey?: string
}

export type SpeechQueueState = {
  speaking: SpeechRequest | null
  queue: SpeechRequest[]
}

export type SpeechDecision =
  | { action: 'speak'; interrupt: boolean; request: SpeechRequest; state: SpeechQueueState }
  | { action: 'enqueue'; request: SpeechRequest; state: SpeechQueueState }
  | { action: 'drop'; reason: 'duplicate'; request: SpeechRequest; state: SpeechQueueState }

export function emptySpeechQueue(): SpeechQueueState {
  return { speaking: null, queue: [] }
}

/** dedupeKey 가 현재 발화 중이거나 큐에 이미 대기 중인지. */
function isKeyActive(state: SpeechQueueState, key: string): boolean {
  if (state.speaking?.dedupeKey === key) return true
  return state.queue.some((item) => item.dedupeKey === key)
}

/**
 * 새 발화 요청을 받아 결정(speak/enqueue/drop)과 다음 상태를 낸다. 순수 함수.
 * 부작용(실제 TTS 호출·interrupt)은 호출부(SpeechManager/웹 브리지)가 action 을 보고 수행한다.
 */
export function requestSpeech(state: SpeechQueueState, request: SpeechRequest): SpeechDecision {
  if (request.dedupeKey && isKeyActive(state, request.dedupeKey)) {
    return { action: 'drop', reason: 'duplicate', request, state }
  }

  // 비어 있으면 즉시 발화.
  if (!state.speaking) {
    return { action: 'speak', interrupt: false, request, state: { speaking: request, queue: state.queue } }
  }

  // high 는 진행 발화를 interrupt 하고 즉시 발화(중단된 발화는 stale 로 버린다). 큐는 유지.
  if (request.priority === 'high') {
    return { action: 'speak', interrupt: true, request, state: { speaking: request, queue: state.queue } }
  }

  // normal 은 큐잉(FIFO).
  return { action: 'enqueue', request, state: { speaking: state.speaking, queue: [...state.queue, request] } }
}

/**
 * 현재 발화가 끝났을 때 호출. 큐 앞에서 다음 발화를 꺼내 speaking 으로 올리고 반환한다.
 * 다음 발화가 없으면 next=null.
 */
export function finishSpeaking(state: SpeechQueueState): { next: SpeechRequest | null; state: SpeechQueueState } {
  const [next = null, ...rest] = state.queue
  return { next, state: { speaking: next, queue: rest } }
}

/** 전체 취소(cancelSpeech): 발화·큐를 비운다. */
export function cancelSpeech(): SpeechQueueState {
  return emptySpeechQueue()
}

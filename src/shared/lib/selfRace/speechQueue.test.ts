import { describe, expect, it } from 'vitest'
import {
  cancelSpeech,
  emptySpeechQueue,
  finishSpeaking,
  requestSpeech,
  type SpeechQueueState,
  type SpeechRequest
} from './speechQueue'

function req(text: string, priority: SpeechRequest['priority'] = 'normal', dedupeKey?: string): SpeechRequest {
  return { text, priority, dedupeKey }
}

describe('requestSpeech', () => {
  it('speaks immediately (no interrupt) when nothing is playing', () => {
    const d = requestSpeech(emptySpeechQueue(), req('5km 통과'))
    expect(d.action).toBe('speak')
    expect(d).toMatchObject({ action: 'speak', interrupt: false })
    expect(d.state.speaking?.text).toBe('5km 통과')
  })

  it('queues a normal request while something is speaking (FIFO)', () => {
    const speaking: SpeechQueueState = { speaking: req('진행 중'), queue: [] }
    const d = requestSpeech(speaking, req('다음 안내'))
    expect(d.action).toBe('enqueue')
    expect(d.state.speaking?.text).toBe('진행 중')
    expect(d.state.queue.map((q) => q.text)).toEqual(['다음 안내'])
  })

  it('interrupts the current utterance for a high-priority request', () => {
    const speaking: SpeechQueueState = { speaking: req('주기 안내', 'normal'), queue: [req('대기', 'normal')] }
    const d = requestSpeech(speaking, req('고스트를 제쳤어요!', 'high'))
    expect(d).toMatchObject({ action: 'speak', interrupt: true })
    expect(d.state.speaking?.text).toBe('고스트를 제쳤어요!')
    expect(d.state.queue.map((q) => q.text)).toEqual(['대기']) // 큐는 유지
  })

  it('drops a duplicate dedupeKey already speaking or queued', () => {
    const state: SpeechQueueState = { speaking: req('5km', 'normal', 'lap:5'), queue: [] }
    const dup = requestSpeech(state, req('5km 재진입', 'normal', 'lap:5'))
    expect(dup).toMatchObject({ action: 'drop', reason: 'duplicate' })

    const queuedState: SpeechQueueState = { speaking: req('현재'), queue: [req('6km', 'normal', 'lap:6')] }
    expect(requestSpeech(queuedState, req('6km again', 'normal', 'lap:6')).action).toBe('drop')
  })

  it('does not drop different dedupeKeys', () => {
    const state: SpeechQueueState = { speaking: req('5km', 'normal', 'lap:5'), queue: [] }
    expect(requestSpeech(state, req('6km', 'normal', 'lap:6')).action).toBe('enqueue')
  })

  it('high priority still respects dedupe (no double-fire on same key)', () => {
    const state: SpeechQueueState = { speaking: req('추월', 'high', 'reversal:overtake:5'), queue: [] }
    expect(requestSpeech(state, req('추월 again', 'high', 'reversal:overtake:5')).action).toBe('drop')
  })
})

describe('finishSpeaking', () => {
  it('promotes the next queued request in FIFO order', () => {
    const state: SpeechQueueState = { speaking: req('현재'), queue: [req('A'), req('B')] }
    const first = finishSpeaking(state)
    expect(first.next?.text).toBe('A')
    expect(first.state.speaking?.text).toBe('A')
    expect(first.state.queue.map((q) => q.text)).toEqual(['B'])

    const second = finishSpeaking(first.state)
    expect(second.next?.text).toBe('B')
    const third = finishSpeaking(second.state)
    expect(third.next).toBeNull()
    expect(third.state.speaking).toBeNull()
  })
})

describe('cancelSpeech', () => {
  it('clears speaking and queue', () => {
    expect(cancelSpeech()).toEqual({ speaking: null, queue: [] })
  })
})

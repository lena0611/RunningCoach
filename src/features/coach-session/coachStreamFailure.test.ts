import { describe, expect, it } from 'vitest'
import { buildCoachStreamFailurePresentation } from './coachStreamFailure'

describe('buildCoachStreamFailurePresentation', () => {
  it('keeps streamed text visible when completion or persistence fails after deltas', () => {
    const state = buildCoachStreamFailurePresentation({
      note: 'Nsm훈련법이 뭐야',
      currentInput: '',
      displayedText: 'NSM은 짧은 자극을 ',
      pendingText: '가볍게 넣는 흐름이야.',
      error: new Error('AI 코칭 저장 응답이 비어 있습니다.'),
      aborted: false
    })

    expect(state.pendingUserNote).toBe('Nsm훈련법이 뭐야')
    expect(state.coachNote).toBe('Nsm훈련법이 뭐야')
    expect(state.streamingCoachText).toBe('NSM은 짧은 자극을 가볍게 넣는 흐름이야.')
    expect(state.streamingCoachMeta).toBe('저장되지 않음 · 다시 시도 가능')
    expect(state.coachError).toContain('임시 답변은 보존')
  })

  it('falls back to the ordinary error state when no text was streamed', () => {
    const state = buildCoachStreamFailurePresentation({
      note: 'Nsm훈련법이 뭐야',
      currentInput: '',
      displayedText: '',
      pendingText: '',
      error: new Error('AI 코칭 요청 실패'),
      aborted: false
    })

    expect(state.pendingUserNote).toBe('')
    expect(state.coachNote).toBe('Nsm훈련법이 뭐야')
    expect(state.streamingCoachText).toBe('')
    expect(state.streamingCoachMeta).toBe('')
    expect(state.coachError).toBe('AI 코칭 요청 실패')
  })

  it('keeps the partial text with an aborted meta when the user stops generation', () => {
    const state = buildCoachStreamFailurePresentation({
      note: 'Nsm훈련법이 뭐야',
      currentInput: '',
      displayedText: '중간 답변',
      pendingText: '',
      error: new DOMException('Aborted', 'AbortError'),
      aborted: true
    })

    expect(state.pendingUserNote).toBe('')
    expect(state.coachNote).toBe('Nsm훈련법이 뭐야')
    expect(state.streamingCoachText).toBe('중간 답변')
    expect(state.streamingCoachMeta).toBe('생성 중단됨 · 저장되지 않음')
    expect(state.coachError).toBe('')
  })
})

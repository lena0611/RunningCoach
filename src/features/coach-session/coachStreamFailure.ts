export type CoachStreamFailurePresentation = {
  pendingUserNote: string
  coachNote: string
  streamingCoachText: string
  streamingCoachMeta: string
  coachError: string
}

type CoachStreamFailureInput = {
  note: string
  currentInput: string
  displayedText: string
  pendingText: string
  error: unknown
  aborted: boolean
}

export function buildCoachStreamFailurePresentation(input: CoachStreamFailureInput): CoachStreamFailurePresentation {
  const visibleText = `${input.displayedText}${input.pendingText}`
  const restoredInput = input.currentInput || input.note

  if (input.aborted) {
    return {
      pendingUserNote: '',
      coachNote: restoredInput,
      streamingCoachText: visibleText,
      streamingCoachMeta: visibleText ? '생성 중단됨 · 저장되지 않음' : '',
      coachError: ''
    }
  }

  const message = input.error instanceof Error ? input.error.message : 'AI 코칭 요청 실패'
  if (visibleText.trim()) {
    return {
      pendingUserNote: input.note,
      coachNote: restoredInput,
      streamingCoachText: visibleText,
      streamingCoachMeta: '저장되지 않음 · 다시 시도 가능',
      coachError: `응답 저장/완료 중 문제가 생겼습니다. 화면의 임시 답변은 보존했어요. (${message})`
    }
  }

  return {
    pendingUserNote: '',
    coachNote: restoredInput,
    streamingCoachText: '',
    streamingCoachMeta: '',
    coachError: message
  }
}

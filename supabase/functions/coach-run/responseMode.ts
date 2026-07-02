export type CoachResponseMode = 'report' | 'conversational' | 'explain' | 'evidence'
export type CoachAnswerIntent = 'chat' | 'explain' | 'evidence'
export type UserNoteRunRelevance = 'general' | 'personal_training' | 'selected_run'

// userNote 문구로 사용자 의도를 분류한다(서버 권위 분류).
// 프론트가 보조 힌트를 보내더라도 서버는 항상 여기서 다시 분류한다.
export function detectCoachAnswerIntent(note: string): CoachAnswerIntent {
  const text = note.trim().toLowerCase()
  if (!text) return 'chat'
  // 근거/출처를 먼저 본다("왜 그렇게 판단했어?"도 근거 요청으로 본다).
  if (/근거|출처|왜|논문|자료|reference|source|evidence|실제로 있|진짜 있|검증|입증/.test(text)) {
    return 'evidence'
  }
  if (/자세히|자세하게|상세|분석|평가|설명|비교|정리|풀어서|구체적/.test(text)) {
    return 'explain'
  }
  return 'chat'
}

// 빈 입력이면 report, 그 외에는 의도에 따라 evidence/explain/conversational.
export function resolveCoachResponseMode(userNote: string, answerIntent: CoachAnswerIntent): CoachResponseMode {
  if (userNote.trim().length === 0) return 'report'
  if (answerIntent === 'evidence') return 'evidence'
  if (answerIntent === 'explain') return 'explain'
  return 'conversational'
}

export function detectUserNoteRunRelevance(note: string): UserNoteRunRelevance {
  const text = note.trim().toLowerCase()
  if (!text) return 'selected_run'

  if (
    /이\s*세션|이번\s*세션|이\s*기록|이\s*런|방금|아까|오늘\s*(러닝|뛴|달린|세션)|그\s*(답|판단|분석|코칭)|페이스|심박|케이던스|구간|랩|스플릿|의도\s*(달성|평가)?|회복런|템포|롱런|lsd|strides?|스트라이드|rpe/.test(text)
  ) {
    return 'selected_run'
  }

  if (
    /나|내|나한테|내가|오늘\s*어떻게|다음\s*(훈련|러닝)|뛰어|달려|목표|루틴|스케줄|통증|아파|발바닥|부상|회복|컨디션|피곤|피로/.test(text)
  ) {
    return 'personal_training'
  }

  return 'general'
}

export function buildUserNoteRelevancePolicy(note: string, mode: CoachResponseMode): string {
  if (mode === 'report') {
    return 'userNote가 없거나 프리셋 리포트 요청이다. 선택 세션 리뷰 형식으로 답한다.'
  }

  const relevance = detectUserNoteRunRelevance(note)
  if (relevance === 'selected_run') {
    return '사용자 질문이 선택 세션/직전 답변/세션 지표를 직접 가리킨다. 선택 세션 데이터와 coachingDecisionBoard를 답변 근거로 사용해도 된다. 그래도 질문에 먼저 답하고, 세션 전체 리포트를 다시 쓰지는 않는다.'
  }
  if (relevance === 'personal_training') {
    return '사용자 질문은 개인 훈련/목표/컨디션에 관한 것이지만 선택 세션 자체를 묻는 것은 아니다. activeGoal, upcomingSchedule, activeInjuryItem, 장기 기억은 필요할 때 사용해도 되지만, 현재 화면에 열려 있다는 이유만으로 selectedRun 지표·의도 달성률·랩 흐름을 근거로 끌어오지 않는다.'
  }
  return '사용자 질문은 일반 개념 설명/잡담이다. 선택 세션은 화면에 열려 있을 뿐 질문 대상이 아니다. selectedRun 지표, session type, coachingDecisionBoard, 목표 예상, 부상 노트를 억지로 연결하지 말고 질문 자체에 답한다. 안전상 꼭 필요한 경우를 제외하면 "너의 이번 세션에 적용하면" 같은 개인화 단락도 생략한다.'
}

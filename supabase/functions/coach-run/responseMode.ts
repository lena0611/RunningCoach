export type CoachResponseMode = 'report' | 'conversational' | 'explain' | 'evidence'
export type CoachAnswerIntent = 'chat' | 'explain' | 'evidence'
export type UserNoteRunRelevance = 'general' | 'personal_training' | 'selected_run'

function asksTrainingConcept(text: string): boolean {
  const hasTrainingTerm = /nsm|노르웨이|노르웨이식|easy|이지|이지스트라이드|스트라이드|strides?|템포|tempo|인터벌|interval|회복런|롱런|lsd|훈련법|훈련/.test(text)
  const asksConcept = /뭐야|무엇|뭔데|뭐임|약자|뜻|의미|개념|원리|흐름|구조|구성|짜여|같아|비슷|차이|다르|아니야|맞아|비교/.test(text)
  return hasTrainingTerm && asksConcept
}

function directlyMentionsSelectedRun(text: string): boolean {
  return /이\s*세션|이번\s*세션|선택\s*세션|이\s*기록|이번\s*기록|이\s*런|이번\s*런|이\s*훈련|이번\s*훈련|방금|아까|오늘\s*(러닝|뛴|달린|세션|기록|훈련|템포|인터벌|스트라이드|이지|easy|회복런|롱런|lsd)|방금\s*(뛴|달린)|아까\s*(뛴|달린)/.test(text)
}

/**
 * 스케줄 변경 의도(#639) — "쉬고 싶다 · 버겁다 · 건너뛰겠다 · 다른 날로 · 더 세게".
 *
 * 이런 발화는 잡담(general)이 아니라 개인 훈련 대화다. general 로 떨어지면 컨텍스트가 축약되어
 * upcomingSchedule 이 빠지고, 코치가 실제 예정 세션을 모른 채 답하게 된다(제안의 targetDate 도 못 만든다).
 * 2026-08-03 라이브 QA: "화요일 이지런이 부담스러워서 더 쉽게 하고 싶어요" 가 general 로 분류돼
 * 세션 액션 제안이 매번 폐기됐다. 반대로 "두 문장 **이내**로" 처럼 우연히 '내' 가 섞이면 통과했다.
 */
function mentionsScheduleChange(text: string): boolean {
  return /쉬고\s*싶|쉴게|쉬어야|쉬어갈|휴식|건너뛰|스킵|미루|옮기|다른\s*날|버겁|부담|힘들|무리|쉽게|줄이|낮추|가볍게|더\s*세게|더\s*강하게/.test(text)
}

/**
 * 승낙-후속 판정(#656). "응 해줘"·"해봐"·"계속" 같은 입력은 **그 자체에 분류 정보가 없다** —
 * 직전 답변이 제안한 후속에 대한 승낙이다. 이걸 문구로 분류하면 general 로 떨어져 컨텍스트가
 * 축약되고, 코치가 맥락을 잃은 원론 답변을 시작한다(2026-08-05 00:30 실사고: "올해 추세" →
 * "3개월 이동 흐름도 읽어드릴까요?" → "응 해줘" → "지금은 일반 개념 질문처럼 들어와서…").
 * 판정되면 호출부가 **직전 사용자 질문의 분류를 물려받는다**.
 */
export function isBareContinuation(note: string): boolean {
  // 웃음(ㅋㅋ/ㅎㅎ)은 2연속 이상만 지운다 — "ㅇㅋ"의 ㅋ 은 승낙의 일부다.
  const compact = note.trim().toLowerCase().replace(/[ㅋㅎ]{2,}/g, '').replace(/[\s.,!?~…]+/g, '')
  if (!compact || compact.length > 12) return false
  if (/^(응|어|그래|좋아|네|예|웅|ㅇㅋ|ㅇㅇ|ㄱㄱ|고고|오케이|오키|ok|okay|yes)$/.test(compact)) return true
  return /^(응|어|그래|좋아|좋지|네|예|웅|오케이|ok)?(그렇게)?(해줘|해줘요|해주세요|해봐|해봐요|해라|부탁해|부탁|계속|계속해줘|이어서|이어서해줘|이어가|보여줘|알려줘|읽어줘|정리해줘|가자|고)$/.test(
    compact
  )
}

// userNote 문구로 사용자 의도를 분류한다(서버 권위 분류).
// 프론트가 보조 힌트를 보내더라도 서버는 항상 여기서 다시 분류한다.
export function detectCoachAnswerIntent(note: string): CoachAnswerIntent {
  const text = note.trim().toLowerCase()
  if (!text) return 'chat'
  // 근거/출처를 먼저 본다("왜 그렇게 판단했어?"도 근거 요청으로 본다).
  if (/근거|출처|왜|논문|자료|reference|source|evidence|실제로 있|진짜 있|검증|입증/.test(text)) {
    return 'evidence'
  }
  if (
    asksTrainingConcept(text) ||
    /자세히|자세하게|상세|분석|평가|설명|비교|정리|풀어서|구체적/.test(text) ||
    /뭐야|무엇|뭔데|뭐임|어떤\s*(흐름|구조|방식|원리)|흐름.*짜여|짜여\s*있|구성|구조|원리/.test(text)
  ) {
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

/**
 * 1인칭 신호(#643). 예전엔 `나|내` 한 글자 패턴이라 한국어 어절 경계가 없어 아무 문장에나 걸렸다 —
 * "두 문장 **이내**로", "하나", "안내" 전부 통과. 이 우연 통과가 #642 원인 규명을 크게 지연시켰다
 * ("짧게 답하면 카드가 뜬다"는 가짜 패턴의 정체가 '이내'의 '내'였다).
 *
 * 구체형으로 좁히되 두 갈래로 받는다:
 * - 조사 결합형(나는/내가/나한테…)은 **앞 글자가 한글이 아닐 때만** — "지나는 길"의 '나는' 오탐 방지.
 * - `내 X`는 개인 훈련 명사가 뒤따를 때만.
 * 실코퍼스 114건(실계정 user_note 전수) 전후비교로 검증했다(2026-08-04).
 */
function mentionsFirstPerson(text: string): boolean {
  if (/(^|[^가-힣])(나는|나도|나를|나만|나랑|나한테|나에게|내가|내게|저는|제가|저도|저한테)/.test(text)) return true
  if (/나의|제\s*(기록|훈련|몸)/.test(text)) return true
  return /내\s*(훈련|목표|루틴|몸|상태|기록|페이스|심박|부상|통증|발|무릎|컨디션|데이터|히스토리|장기\s*기억|스케줄|레벨|최장|주간|경우|생각)/.test(
    text
  )
}

/**
 * 기간 집계 질문인가 — "지난달 총 몇 km", "6월이랑 7월 비교", "올해 추세" 류.
 *
 * 세션 대화에서 이런 질문을 하면 `selected_run` 으로 분류돼 "선택 세션 데이터를 근거로 답하라"는
 * 정책이 붙고, 모델이 **도구를 부르지 않고 프롬프트에 실린 일부 런으로 추정해 틀린 숫자를 말한다**
 * (2026-08-07 실측: "6월이랑 7월 비교" → 6월 0회·0km 라고 답했다. 실제 14회·90.75km).
 *
 * 그래서 **기간 스코프 + 집계 의도가 함께** 있으면 선택 세션 판정보다 우선한다. 둘을 함께 요구하는
 * 이유: "이 세션 평균 페이스"처럼 세션 자체의 지표를 묻는 질문을 기간 질문으로 오인하면
 * 반대 방향 회귀가 난다(세션 지표를 못 쓰게 됨).
 */
function asksPeriodAggregate(text: string): boolean {
  const hasPeriodScope =
    /지난\s*달|저번\s*달|이번\s*달|\d+\s*(달|개월)\s*전|\d{1,2}\s*월|작년|올해|최근\s*\d+\s*(일|주|달|개월)|전체\s*기록|누적|올타임/.test(
      text
    )
  if (!hasPeriodScope) return false
  return /몇\s*(km|킬로|번|회|키로)|총\s|합계|평균|비교|추세|얼마나|얼마|며칠|최장|최고|몇\s*일/.test(text)
}

export function detectUserNoteRunRelevance(note: string): UserNoteRunRelevance {
  const text = note.trim().toLowerCase()
  if (!text) return 'selected_run'

  if (asksTrainingConcept(text) && !directlyMentionsSelectedRun(text)) return 'general'

  // 기간 집계 질문은 세션 지시어보다 우선한다(위 asksPeriodAggregate 주석 — 틀린 숫자 사고).
  if (asksPeriodAggregate(text)) return 'personal_training'

  if (directlyMentionsSelectedRun(text)) return 'selected_run'

  if (/페이스|심박|케이던스|구간|랩|스플릿|의도\s*(달성|평가)?|rpe/.test(text)) {
    return 'selected_run'
  }

  if (
    mentionsScheduleChange(text) ||
    mentionsFirstPerson(text) ||
    // 러닝 행위 어형을 넓게 받는다(뛰었/달렸/뜀…) — 1인칭 대명사를 좁힌 대신, 주어 생략 개인 발화
    // ("오랜만에 5키로 도전한거야", "가볍게 뜀")가 general 로 새는 회귀를 막는 안전망.
    // 처방·판정은 "코치가 나에게 내린 것"을 가리키므로 개인 신호다 — 우연 통과가 가리던 케이스
    // ("처방받은 거리를 채우는 게 나을까", "이번세샨을 lsd로 판정내리지 않은 근거는?")의 명시적 대체.
    /오늘\s*어떻게|다음\s*(훈련|러닝)|뛰어|뛰었|뛰고|뛰니|뛸|뜀|달려|달렸|달리|도전|목표|루틴|스케줄|통증|아파|아픈|발바닥|부상|회복|컨디션|피곤|피로|처방|판정/.test(text)
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

export function shouldApplyTrustLayer(note: string, mode: CoachResponseMode): boolean {
  if (mode === 'report') return true
  return detectUserNoteRunRelevance(note) === 'selected_run'
}

export function shouldAttachInjurySnapshot(note: string, mode: CoachResponseMode): boolean {
  if (mode === 'report') return true
  return detectUserNoteRunRelevance(note) !== 'general'
}

export function shouldUseStructuredCoachContext(note: string, mode: CoachResponseMode): boolean {
  if (mode === 'report') return true
  return detectUserNoteRunRelevance(note) !== 'general'
}

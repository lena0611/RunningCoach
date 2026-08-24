import { describe, expect, it } from 'vitest'
import {
  buildUserNoteRelevancePolicy,
  detectCoachAnswerIntent,
  detectUserNoteRunRelevance,
  isBareContinuation,
  mentionsInjuryStateChange,
  resolveCoachResponseMode,
  shouldAttachInjurySnapshot,
  shouldApplyTrustLayer,
  shouldUseStructuredCoachContext
} from '../supabase/functions/coach-run/responseMode'

describe('coach response mode and user note relevance', () => {
  it('keeps general training-method questions away from selected-run analysis', () => {
    expect(detectCoachAnswerIntent('Nsm훈련법이 뭐야')).toBe('explain')
    expect(resolveCoachResponseMode('Nsm훈련법이 뭐야', 'explain')).toBe('explain')
    expect(detectUserNoteRunRelevance('Nsm훈련법이 뭐야')).toBe('general')

    const policy = buildUserNoteRelevancePolicy('Nsm훈련법이 뭐야', 'explain')
    expect(policy).toContain('일반 개념 설명/잡담')
    expect(policy).toContain('selectedRun 지표')
    expect(policy).toContain('억지로 연결하지 말고')
  })

  it('treats structure and flow questions as explanation requests', () => {
    expect(detectCoachAnswerIntent('어떤 흐름으로 짜여져 있는데')).toBe('explain')
    expect(resolveCoachResponseMode('어떤 흐름으로 짜여져 있는데', 'explain')).toBe('explain')
    expect(detectUserNoteRunRelevance('어떤 흐름으로 짜여져 있는데')).toBe('general')
  })

  it('keeps method comparison and naming follow-ups as general concept questions', () => {
    expect(detectCoachAnswerIntent('이지스트라이드랑 같아 보이네?')).toBe('explain')
    expect(detectUserNoteRunRelevance('이지스트라이드랑 같아 보이네?')).toBe('general')
    expect(shouldApplyTrustLayer('이지스트라이드랑 같아 보이네?', 'explain')).toBe(false)
    expect(shouldAttachInjurySnapshot('이지스트라이드랑 같아 보이네?', 'explain')).toBe(false)
    expect(shouldUseStructuredCoachContext('이지스트라이드랑 같아 보이네?', 'explain')).toBe(false)

    expect(detectCoachAnswerIntent('Nsm은 뭐의 약자야?')).toBe('explain')
    expect(detectUserNoteRunRelevance('Nsm은 뭐의 약자야?')).toBe('general')
    expect(shouldAttachInjurySnapshot('Nsm은 뭐의 약자야?', 'explain')).toBe(false)
    expect(shouldUseStructuredCoachContext('Nsm은 뭐의 약자야?', 'explain')).toBe(false)

    expect(detectCoachAnswerIntent('노르웨이식 훈련법 아니야?')).toBe('explain')
    expect(detectUserNoteRunRelevance('노르웨이식 훈련법 아니야?')).toBe('general')
    expect(shouldUseStructuredCoachContext('노르웨이식 훈련법 아니야?', 'explain')).toBe(false)
  })

  it('allows selected run context when the user asks about the session', () => {
    expect(detectUserNoteRunRelevance('이 세션은 왜 심박이 높게 나온 거야?')).toBe('selected_run')
    expect(detectUserNoteRunRelevance('오늘 템포 어땠어?')).toBe('selected_run')

    const policy = buildUserNoteRelevancePolicy('이 세션은 왜 심박이 높게 나온 거야?', 'evidence')
    expect(policy).toContain('선택 세션')
    expect(policy).toContain('근거로 사용해도 된다')
  })

  it('uses broad personal context, not selected-run metrics, for personal training questions', () => {
    expect(detectUserNoteRunRelevance('나한테 다음 훈련은 어떻게 가져가면 돼?')).toBe('personal_training')

    const policy = buildUserNoteRelevancePolicy('나한테 다음 훈련은 어떻게 가져가면 돼?', 'explain')
    expect(policy).toContain('개인 훈련/목표/컨디션')
    expect(policy).toContain('현재 화면에 열려 있다는 이유만으로 selectedRun')
  })

  it('only applies deterministic trust layer to report or selected-run questions', () => {
    expect(shouldApplyTrustLayer('', 'report')).toBe(true)
    expect(shouldApplyTrustLayer('Nsm훈련법이 뭐야', 'explain')).toBe(false)
    expect(shouldApplyTrustLayer('어떤 흐름으로 짜여져 있는데', 'explain')).toBe(false)
    expect(shouldApplyTrustLayer('이 세션은 왜 심박이 높게 나온 거야?', 'evidence')).toBe(true)
  })

  it('attaches injury snapshots only when the question can use personal or selected-run context', () => {
    expect(shouldAttachInjurySnapshot('', 'report')).toBe(true)
    expect(shouldAttachInjurySnapshot('Nsm훈련법이 뭐야', 'explain')).toBe(false)
    expect(shouldAttachInjurySnapshot('이지스트라이드랑 같아 보이네?', 'explain')).toBe(false)
    expect(shouldAttachInjurySnapshot('나한테 다음 훈련은 어떻게 가져가면 돼?', 'explain')).toBe(true)
    expect(shouldAttachInjurySnapshot('이 세션은 왜 심박이 높게 나온 거야?', 'evidence')).toBe(true)
  })

  it('uses structured coach context only for report, selected-run, or personal coaching questions', () => {
    expect(shouldUseStructuredCoachContext('', 'report')).toBe(true)
    expect(shouldUseStructuredCoachContext('Nsm훈련법이 뭐야', 'explain')).toBe(false)
    expect(shouldUseStructuredCoachContext('그냥 잡담인데 오늘 날씨 좋네', 'conversational')).toBe(false)
    expect(shouldUseStructuredCoachContext('나한테 다음 훈련은 어떻게 가져가면 돼?', 'explain')).toBe(true)
    expect(shouldUseStructuredCoachContext('오늘 템포 어땠어?', 'explain')).toBe(true)
  })

  // #639 라이브 QA 회귀: 스케줄 변경 발화가 general 로 분류되면 컨텍스트가 축약돼
  // upcomingSchedule 이 빠지고 세션 액션 제안이 매번 폐기된다.
  it('treats schedule-change talk as personal training, not small talk (#639)', () => {
    const notes = [
      '이번 주 훈련이 너무 힘들어요. 화요일 이지런도 부담스러워서 좀 더 쉽게 하고 싶어요.',
      '화요일 이지런이 부담스러워서 더 쉽게 하고 싶어요.',
      '토요일 LSD는 이번엔 건너뛰겠어요.',
      '토요일은 어려워서 다른 날로 옮기고 싶어요.',
      '당분간 쉬고 싶어요.',
      '요즘 잘 되는 것 같아서 더 세게 해보고 싶어요.'
    ]
    for (const note of notes) {
      expect(detectUserNoteRunRelevance(note)).toBe('personal_training')
      expect(shouldUseStructuredCoachContext(note, 'conversational')).toBe(true)
    }
  })

  it('does not turn concept questions or small talk into personal training (#639 과발동 가드)', () => {
    expect(detectUserNoteRunRelevance('Nsm훈련법이 뭐야')).toBe('general')
    expect(detectUserNoteRunRelevance('그냥 잡담인데 오늘 날씨 좋네')).toBe('general')
  })

  // #643: `나|내` 한 글자 패턴의 우연 통과 제거. "두 문장 **이내**로"의 '내'가 분류를 바꿔
  // #642 원인 규명을 지연시킨 그 케이스들이다.
  it('one-syllable 나/내 no longer matches inside unrelated words (#643)', () => {
    expect(detectUserNoteRunRelevance('고마워, 두 문장 이내로 답해줘')).toBe('general')
    expect(detectUserNoteRunRelevance('안내 좀 해줘')).toBe('general')
    expect(detectUserNoteRunRelevance('하나만 골라줘')).toBe('general')
    expect(detectUserNoteRunRelevance('지나는 길에 생각났어')).toBe('general')
  })

  it('explicit first-person forms still count as personal training (#643 좁힘 후 보존)', () => {
    expect(detectUserNoteRunRelevance('나는 어때?')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('내가 뭘 잘못했지')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('그럼 나한테는 어느 쪽이 나아?')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('내 장기기억에는 뭐가 저장되어 있어?')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('나의 누적 데이터로 판단해줘')).toBe('personal_training')
  })

  // 실코퍼스 114건 전후비교(2026-08-04)에서 나온 회귀 후보들 — 좁힌 뒤에도 새면 안 되는 개인 발화.
  it('subject-dropped personal running talk stays personal after narrowing (#643 회귀 가드)', () => {
    expect(detectUserNoteRunRelevance('2달 전에 총 몇 키로 뛰었어?')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('요즘 꾸준히 잘 뛰고 있어? 주간 거리 어때?')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('오랜만에 5키로 30분이내에 도전한거야')).toBe('personal_training')
    // 코퍼스 원문(오타 포함) 그대로 — '심박' 정타면 selected_run 선행 규칙에 걸린다(기존 동작, 범위 밖)
    expect(detectUserNoteRunRelevance('심뱍우선으로 하면 처방받은 거리를 채우는 게 나을까')).toBe('personal_training')
    expect(detectUserNoteRunRelevance('발이 아프지만 너무 쉬면 안될 것 같아서 가볍게 뜀')).toBe('personal_training')
  })

  it('third-party or generic running mentions stay general (#643 과발동 가드)', () => {
    expect(detectUserNoteRunRelevance('참고로 케냐 선수들은 그렇게 뛴대')).toBe('general')
  })

  // #656: "응 해줘"는 새 질문이 아니라 직전 제안에 대한 승낙이다.
  // 2026-08-05 실사고: 승낙이 general 로 분류돼 코치가 맥락 잃은 원론 설명을 시작했다.
  describe('isBareContinuation — 승낙-후속 판정', () => {
    it('짧은 승낙/계속 표현을 잡는다', () => {
      for (const note of ['응 해줘', '응', '해봐', '그래 해줘', '계속', '이어서 해줘', '응 부탁해', 'ㅇㅋ', '좋아, 보여줘', '네 해주세요', '응해봐~']) {
        expect(isBareContinuation(note), note).toBe(true)
      }
    })

    it('내용이 있는 질문·긴 문장은 잡지 않는다', () => {
      for (const note of [
        '',
        '응 근데 심박은 왜 그래?',
        '6월이랑 7월 비교해줘',
        '노르웨이식 훈련법 알려줘',
        '아니 그거 말고 다른 걸 해줘'
      ]) {
        expect(isBareContinuation(note), note || '(빈 문자열)').toBe(false)
      }
    })
  })

  /**
   * 2026-08-07 실사고: **세션 대화**에서 "6월이랑 7월 비교"를 물었더니 도구를 부르지 않고
   * 컨텍스트의 일부 런으로 답해 **6월을 0회·0km 라고 지어냈다**(실제 14회·90.75km).
   * 원인은 "이 세션"이라는 지시어 때문에 selected_run 으로 분류돼 "선택 세션 데이터를 근거로
   * 답하라"는 정책이 붙은 것. 기간 집계 질문은 세션 지시어를 이겨야 한다.
   */
  describe('기간 집계 질문은 세션 지시어보다 우선한다 (2026-08-07 사고)', () => {
    it('세션 지시어가 섞여도 기간 집계면 personal_training 으로 간다', () => {
      expect(detectUserNoteRunRelevance('이 세션 얘기는 잠깐 접고, 6월이랑 7월에 각각 몇 번 몇 km 뛰었는지 비교해줘')).toBe('personal_training')
      expect(detectUserNoteRunRelevance('이번 세션 말고 지난달 총 몇 km야?')).toBe('personal_training')
    })

    it('기간 스코프 + 집계 의도 조합을 잡는다', () => {
      for (const note of [
        '지난달에 총 몇 번 몇 km 뛰었어?',
        '올해 월별 거리 추세가 어때?',
        '이번 달 누적 얼마나 됐어?',
        '최근 3개월 평균 페이스 알려줘',
        '전체 기록에서 최장 거리 얼마야?'
      ]) {
        expect(detectUserNoteRunRelevance(note), note).toBe('personal_training')
      }
    })

    it('세션 자체의 지표 질문은 selected_run 을 유지한다 (반대 방향 회귀 가드)', () => {
      for (const note of [
        '이 세션 평균 페이스 어때?',
        '이번 세션 심박이 왜 높았어?',
        '오늘 뛴 거 랩 흐름 봐줘',
        '이 세션 의도 달성했어?'
      ]) {
        expect(detectUserNoteRunRelevance(note), note).toBe('selected_run')
      }
    })

    it('기간만 있고 집계 의도가 없으면 기존 판정을 바꾸지 않는다', () => {
      // "지난달에 아팠어" 는 집계 질문이 아니다 — 부상 맥락(personal_training)으로 기존 규칙이 받는다.
      expect(detectUserNoteRunRelevance('노르웨이식 훈련법이 뭐야')).toBe('general')
    })
  })

  describe('부상 상태 변경 발화는 개인 맥락으로 받는다 (#697, 2026-08-22 실사용)', () => {
    it('회복·해제·수치 갱신 발화가 general 로 새지 않는다', () => {
      for (const note of [
        '발바닷 상태 0이닠가 업데이트해줘',
        '부상상태 업데이트해줘 이제 발바닥 해제',
        '이제 다 나았어',
        '발 괜찮아졌어',
        '족저근막염 다 나았어 해제해줘',
        '무릎 이제 0이야',
        '상태 업데이트 해줘'
      ]) {
        expect(detectUserNoteRunRelevance(note), note).toBe('personal_training')
        // general 이면 structuredCoachContext=false 가 되어 코치가 "부상 없음"으로 답한다.
        expect(shouldUseStructuredCoachContext(note, 'conversational'), note).toBe(true)
      }
    })

    it('부위명만으로는 개인 발화로 보지 않는다 (개념 질문 회귀 가드)', () => {
      // 상태 신호(수치·이제·해제/업데이트) 없이 부위명만 있으면 개념 질문일 수 있다.
      expect(mentionsInjuryStateChange('무릎 스트레칭 방법')).toBe(false)
      expect(mentionsInjuryStateChange('족저근막염이 뭐야')).toBe(false)
      expect(mentionsInjuryStateChange('아킬레스건 강화 운동')).toBe(false)
    })

    it('부상과 무관한 해제·나아감 표현을 끌어오지 않는다', () => {
      for (const note of ['알림 해제해줘', '더 나아가려면 뭐가 필요해?', '고마워 도움이 됐어']) {
        expect(detectUserNoteRunRelevance(note), note).toBe('general')
      }
    })
  })

  describe('내 플랜의 예정 세션 얘기는 개인 맥락으로 받는다 (#701, 2026-08-24 실사용)', () => {
    it('요일·세션 구성·플랜 지시어가 general 로 새지 않는다', () => {
      for (const note of [
        '지금 화요일에 배정된 이지 스트라이드를 보면 본런 5km이후에 스트라이드를 6회 넣으라고 하는데, 본런안에 섞어하면 안되나? 이지 스트라이드의 정석이 원래 그러한가?',
        '화요일이 초반 웜업10분에 본런 약 40분에 스트라이드까지하면 한시간이 넘는데 괜찮나',
        '내말은 화요일 본런이 너무 길지 않냐 이말인데..',
        '토요일 LSD 8km는 지금 무리인데',
        '목요일에 잡혀 있는 거 뭐였지'
      ]) {
        expect(detectUserNoteRunRelevance(note), note).toBe('personal_training')
        // general 이면 index.ts:1501 에서 upcomingSchedule 이 null 로 잘려
        // 모델이 날짜를 못 짚고 ease_session 제안이 불가능해진다.
        expect(shouldUseStructuredCoachContext(note, 'conversational'), note).toBe(true)
      }
    })

    it('내 플랜을 안 가리키는 개념 질문은 general 을 유지한다 (회귀 가드)', () => {
      for (const note of [
        '이지 스트라이드가 뭐야',
        '템포런이랑 인터벌 차이가 뭐야?',
        'LSD가 무슨 약자야',
        '노르웨이식 훈련법이 뭔지 짧게 설명해줘',
        '롱런은 원래 길게 가는게 맞아?'
      ]) {
        expect(detectUserNoteRunRelevance(note), note).toBe('general')
      }
    })

    it('분량 부담 어휘를 스케줄 변경 의도로 받는다', () => {
      // 기존 목록은 버겁·부담·힘들·무리 뿐이라 "너무 길지 않냐" 를 놓쳤고,
      // 그래서 ease_session 이 한 번도 안 나갔다.
      expect(detectUserNoteRunRelevance('이번 주 훈련이 너무 길어')).toBe('personal_training')
      expect(detectUserNoteRunRelevance('훈련량이 너무 많지 않아?')).toBe('personal_training')
    })
  })
})

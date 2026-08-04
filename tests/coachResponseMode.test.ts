import { describe, expect, it } from 'vitest'
import {
  buildUserNoteRelevancePolicy,
  detectCoachAnswerIntent,
  detectUserNoteRunRelevance,
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
})

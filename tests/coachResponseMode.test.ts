import { describe, expect, it } from 'vitest'
import {
  buildUserNoteRelevancePolicy,
  detectCoachAnswerIntent,
  detectUserNoteRunRelevance,
  resolveCoachResponseMode,
  shouldAttachInjurySnapshot,
  shouldApplyTrustLayer
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

    expect(detectCoachAnswerIntent('Nsm은 뭐의 약자야?')).toBe('explain')
    expect(detectUserNoteRunRelevance('Nsm은 뭐의 약자야?')).toBe('general')
    expect(shouldAttachInjurySnapshot('Nsm은 뭐의 약자야?', 'explain')).toBe(false)

    expect(detectCoachAnswerIntent('노르웨이식 훈련법 아니야?')).toBe('explain')
    expect(detectUserNoteRunRelevance('노르웨이식 훈련법 아니야?')).toBe('general')
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
})

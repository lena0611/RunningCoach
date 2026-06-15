import { describe, expect, it } from 'vitest'
import type { NextSessionRecommendation } from '@/shared/lib/runStats'
import {
  buildSessionIntentDraft,
  easierAlternative,
  parseRunTypeFromTitle
} from '@/features/build-session-intent/buildSessionIntentDraft'

const HR = { easyCeilingBpm: 150, tempoCeilingBpm: 168, recoveryCeilingBpm: 132 }

function rec(overrides: Partial<NextSessionRecommendation> = {}): NextSessionRecommendation {
  return {
    title: 'Tempo 6km',
    reason: '목표 페이스 유지력을 키웁니다. 둘째 문장.',
    intensity: '',
    plannedDate: '2026-06-15',
    dayName: '월요일',
    injuryAdjusted: false,
    injuryNote: '',
    loadCaution: false,
    loadNote: '',
    ...overrides
  }
}

describe('parseRunTypeFromTitle', () => {
  it('키워드로 RunType 추론', () => {
    expect(parseRunTypeFromTitle('토요일 LSD')).toBe('LSD')
    expect(parseRunTypeFromTitle('Tempo 6km')).toBe('Tempo')
    expect(parseRunTypeFromTitle('Easy + Strides')).toBe('Easy + Strides')
    expect(parseRunTypeFromTitle('Recovery 4km')).toBe('Recovery')
    expect(parseRunTypeFromTitle('알 수 없음')).toBe('Easy')
  })
})

describe('easierAlternative', () => {
  it('한 단계 가벼운 세션', () => {
    expect(easierAlternative('Tempo')).toBe('Easy + Strides')
    expect(easierAlternative('LSD')).toBe('Easy')
    expect(easierAlternative('Easy')).toBe('Recovery')
  })
})

describe('buildSessionIntentDraft', () => {
  it('Tempo: tempoCeiling 기반 심박/RPE/성공기준', () => {
    const draft = buildSessionIntentDraft({
      recommendation: rec(),
      heartRateModel: HR,
      weakestFactorLabel: '역치 능력',
      activeGoalId: 'g1'
    })
    expect(draft.sessionType).toBe('Tempo')
    expect(draft.targets.hrCeilingBpm).toBe(168)
    expect(draft.targets.hrRange).toEqual([156, 168])
    expect(draft.targets.rpeRange).toEqual([6, 7])
    expect(draft.goalId).toBe('g1')
    expect(draft.why).toContain('역치 능력')
    expect(draft.successCriteria).toContain('평균심박 156~168')
    expect(draft.plannedDate).toBe('2026-06-15')
  })

  it('부상 조정이면 why 는 injuryNote', () => {
    const draft = buildSessionIntentDraft({
      recommendation: rec({ injuryAdjusted: true, injuryNote: '족저근막 통증으로 강도 하향' }),
      heartRateModel: HR,
      weakestFactorLabel: '역치 능력',
      activeGoalId: null
    })
    expect(draft.why).toBe('족저근막 통증으로 강도 하향')
    expect(draft.goalId).toBeNull()
  })

  it('overrideType 으로 더 가벼운 세션을 강제(다른 훈련 제안)', () => {
    const draft = buildSessionIntentDraft({
      recommendation: rec(),
      heartRateModel: HR,
      weakestFactorLabel: null,
      activeGoalId: 'g1',
      overrideType: 'Recovery'
    })
    expect(draft.sessionType).toBe('Recovery')
    expect(draft.targets.hrCeilingBpm).toBe(132)
    expect(draft.targets.rpeRange).toEqual([1, 2])
    expect(draft.why).toContain('피로')
  })

  it('심박모델이 비어도 안전(hrRange null, RPE/성공기준 유지)', () => {
    const draft = buildSessionIntentDraft({
      recommendation: rec({ title: 'Easy 5km' }),
      heartRateModel: { easyCeilingBpm: null, tempoCeilingBpm: null, recoveryCeilingBpm: null },
      weakestFactorLabel: null,
      activeGoalId: null
    })
    expect(draft.targets.hrRange).toBeNull()
    expect(draft.successCriteria.some((s) => s.startsWith('RPE'))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { adjustSessionType, proposeAlternativeSession } from '@/shared/lib/coaching/alternativeSession'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: 's1',
    userId: 'u1',
    goalId: 'g1',
    date: '2026-02-10',
    phase: overrides.phase ?? 'Build',
    sessionType: overrides.sessionType ?? 'Tempo',
    slot: overrides.slot ?? null,
    keySession: overrides.keySession ?? true,
    prescription: { ...defaultScheduledSessionPrescription(), distanceKm: overrides.prescription?.distanceKm ?? 8 },
    status: 'planned',
    source: 'generator',
    runId: null,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z'
  }
}

function profile(): AthleteProfile {
  return {
    birthYear: 1990, sex: 'male', runningExperienceMonths: 24, weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일', weightKg: null, personalBests: [], runnerLevel: 'auto',
    maxHeartRate: null, restingHeartRate: null, lactateThresholdHr: null, heartRateMode: 'auto',
    vo2Max: null, vo2MaxSampleDate: null, vo2MaxSource: null
  }
}

const goal: TrainingGoal = {
  id: 'g1', title: '10K 서브50', category: 'race', startDate: null, targetDate: '2026-04-10',
  distanceKm: 10, targetDurationSec: 3000, priority: 1, status: 'active',
  successCriteria: '', strategyNotes: '', notes: '', createdAt: '', updatedAt: ''
}

describe('adjustSessionType', () => {
  it('양방향 사다리(Recovery↔Easy↔Easy+Strides↔Tempo)', () => {
    expect(adjustSessionType('Tempo', 'easier')).toBe('Easy + Strides')
    expect(adjustSessionType('Easy + Strides', 'easier')).toBe('Easy')
    expect(adjustSessionType('Easy', 'easier')).toBe('Recovery')
    expect(adjustSessionType('Recovery', 'easier')).toBe('Recovery') // 바닥
    expect(adjustSessionType('Easy', 'harder')).toBe('Easy + Strides')
    expect(adjustSessionType('Easy + Strides', 'harder')).toBe('Tempo')
    expect(adjustSessionType('Tempo', 'harder')).toBe('Tempo') // 안전 상한
  })

  it('롱런은 볼륨 축으로 별도 처리', () => {
    expect(adjustSessionType('LSD', 'easier')).toBe('Easy')
    expect(adjustSessionType('LSD', 'harder')).toBe('Steady Long')
    expect(adjustSessionType('Steady Long', 'easier')).toBe('Easy')
  })
})

describe('proposeAlternativeSession', () => {
  it('쉽게: 강도 한 단계 낮추고 볼륨 약간 축소, source=manual', () => {
    const { draft } = proposeAlternativeSession(session({ sessionType: 'Tempo', prescription: { distanceKm: 8 } as never }), goal, profile(), 'easier')
    expect(draft.sessionType).toBe('Easy + Strides')
    expect(draft.source).toBe('manual')
    expect(draft.prescription.distanceKm).toBeLessThan(8)
    expect(draft.date).toBe('2026-02-10')
  })

  it('키세션을 쉽게 바꾸면 목표 영향 경고', () => {
    const { warning } = proposeAlternativeSession(session({ sessionType: 'Tempo', keySession: true }), goal, profile(), 'easier')
    expect(warning).toContain('핵심 세션')
    expect(warning).toContain('10K 서브50')
  })

  it('비키세션이거나 어렵게면 경고 없음', () => {
    expect(proposeAlternativeSession(session({ sessionType: 'Easy', keySession: false }), goal, profile(), 'easier').warning).toBe('')
    expect(proposeAlternativeSession(session({ sessionType: 'Tempo', keySession: true }), goal, profile(), 'harder').warning).toBe('')
  })

  it('사다리 끝이면 atBoundary', () => {
    expect(proposeAlternativeSession(session({ sessionType: 'Tempo' }), goal, profile(), 'harder').atBoundary).toBe(true)
    expect(proposeAlternativeSession(session({ sessionType: 'Recovery', keySession: false }), goal, profile(), 'easier').atBoundary).toBe(true)
  })
})

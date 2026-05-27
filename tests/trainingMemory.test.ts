import { describe, expect, it } from 'vitest'
import { normalizeTrainingMemory } from '@/entities/training-memory/model'

describe('normalizeTrainingMemory', () => {
  it('fills adaptive training phase, progression criteria, and prescription templates', () => {
    const memory = normalizeTrainingMemory({
      goal: '10km 60분 달성',
      adaptiveTrainingProfile: {
        methodologyVersion: 'legacy',
        updatedAt: null,
        compliancePatterns: [],
        sessionGuides: []
      }
    } as any)

    expect(memory.adaptiveTrainingProfile.trainingPhase.currentPhase).toBe('Base')
    expect(memory.adaptiveTrainingProfile.progressionCriteria.length).toBeGreaterThan(0)
    expect(memory.adaptiveTrainingProfile.prescriptionTemplates.length).toBeGreaterThan(0)
    expect(memory.adaptiveTrainingProfile.prescriptionTemplates.some((template) => template.sessionType === 'Easy + Strides')).toBe(true)
  })

  it('keeps valid personalized adaptive training fields', () => {
    const memory = normalizeTrainingMemory({
      goal: '10km 60분 달성',
      adaptiveTrainingProfile: {
        methodologyVersion: 'custom',
        updatedAt: '2026-05-27T00:00:00.000Z',
        trainingPhase: {
          currentPhase: 'Threshold',
          startedAt: '2026-05-01',
          goal: 'Tempo 품질 상향',
          focus: ['Tempo 165 상한', '5km TT 준비'],
          nextPhase: 'Race Specific',
          reviewAfter: '2주 후'
        },
        progressionCriteria: [
          {
            id: 'tempo-ready',
            label: 'Tempo 안정',
            status: 'ready',
            evidence: '2회 연속 상한 준수',
            action: '지속 시간 소폭 증가'
          }
        ],
        prescriptionTemplates: [
          {
            id: 'custom-tempo',
            name: '구간형 템포',
            phase: 'Threshold',
            sessionType: 'Tempo',
            purpose: '역치 지속력',
            workout: ['10분 워밍업', '8분 x 3'],
            useWhen: ['회복 안정'],
            avoidWhen: ['통증 active'],
            progressionTrigger: '2회 안정'
          }
        ],
        compliancePatterns: [],
        sessionGuides: []
      }
    } as any)

    expect(memory.adaptiveTrainingProfile.trainingPhase.currentPhase).toBe('Threshold')
    expect(memory.adaptiveTrainingProfile.progressionCriteria[0].status).toBe('ready')
    expect(memory.adaptiveTrainingProfile.prescriptionTemplates[0].name).toBe('구간형 템포')
  })
})

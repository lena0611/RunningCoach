import { describe, expect, it } from 'vitest'
import { normalizeTrainingMemory } from '@/entities/training-memory/model'

describe('normalizeTrainingMemory', () => {
  it('fills adaptive training phase and progression criteria', () => {
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
        compliancePatterns: [],
        sessionGuides: []
      }
    } as any)

    expect(memory.adaptiveTrainingProfile.trainingPhase.currentPhase).toBe('Threshold')
    expect(memory.adaptiveTrainingProfile.progressionCriteria[0].status).toBe('ready')
  })
})

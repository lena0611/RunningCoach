import { describe, expect, it } from 'vitest'
import type { TrainingGoal, TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { buildSessionBriefing } from '@/shared/lib/coaching/sessionBriefing'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: 's1', userId: 'u1', goalId: 'g1', date: '2026-02-10',
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy + Strides',
    keySession: overrides.keySession ?? false,
    prescription: { ...defaultScheduledSessionPrescription(), distanceKm: 6, durationMin: 35, paceRange: '6:10~6:40/km', ...(overrides.prescription ?? {}) },
    status: 'planned', source: 'generator', runId: null,
    createdAt: '', updatedAt: ''
  }
}

const goal: TrainingGoal = {
  id: 'g1', title: '10K 서브50', category: 'race', startDate: null, targetDate: '2026-04-10',
  distanceKm: 10, targetDurationSec: 3000, priority: 1, status: 'active',
  successCriteria: '', strategyNotes: '', notes: '', createdAt: '', updatedAt: ''
}

function injury(overrides: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return {
    id: 'i1', title: '무릎', area: '무릎', normalizedAreas: [], status: 'active', severity: 2,
    onsetDate: null, lastFlareDate: null, lastCheckedAt: null, resolvedAt: null, checkInHistory: [],
    notes: '', managementPlan: '', triggers: [], restrictions: [], returnToRunCriteria: '',
    strengthPlan: [], strengthPlanDetails: [], createdAt: '', updatedAt: '', ...overrides
  }
}

const noChronic: ChronicLoadTrend = { status: 'stable', increasePct: 5, last30Km: 100, prev30Km: 95, spikeThreshold: 50, risingThreshold: 30 }

describe('buildSessionBriefing', () => {
  it('Easy + Strides: 4요소(목표·효과·이행지침·근거) 채워짐', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: null, chronic: noChronic })
    expect(b.goalLine).toContain('10K 서브50')
    expect(b.goalLine).toContain('기초기')
    expect(b.effect).toBeTruthy()
    expect(b.execution.length).toBeGreaterThanOrEqual(2)
    expect(b.execution.some((l) => l.includes('스트라이드'))).toBe(true)
    expect(b.execution.some((l) => l.includes('6:10~6:40/km'))).toBe(true)
    expect(b.evidence.length).toBeGreaterThan(0)
    expect(b.cautions).toEqual([])
  })

  it('세션 타입마다 효과·지침이 다르다(고정 문장 아님)', () => {
    const easy = buildSessionBriefing(session({ sessionType: 'Easy + Strides' }), { goal, injury: null, chronic: noChronic })
    const tempo = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(easy.effect).not.toBe(tempo.effect)
    expect(easy.execution).not.toEqual(tempo.execution)
  })

  it('부상 severity 가 스트라이드 반복수를 산출 단계에서 감축(무릎 등 비전족)', () => {
    const reps = (inj: ReturnType<typeof injury> | null) =>
      Number(
        buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: inj, chronic: noChronic })
          .execution.find((l) => l.includes('스트라이드'))?.match(/× (\d+)회/)?.[1] ?? 0
      )
    const healthy = reps(null)
    const hurt = reps(injury({ severity: 3, area: '무릎' }))
    expect(hurt).toBeGreaterThan(0)
    expect(hurt).toBeLessThan(healthy) // 부상으로 반복수 감축
  })

  it('전족 부상(족저)이면 스트라이드를 보류로 산출', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: injury({ severity: 2, area: '족저근막' }), chronic: noChronic })
    expect(b.execution.some((l) => l.includes('보류'))).toBe(true)
    expect(b.execution.some((l) => /× \d+회/.test(l))).toBe(false) // 반복수 처방 없음(보류)
  })

  it('적응 프로필 수행 게이트(ready)면 스트라이드 반복수 상향(blocked면 보수)', () => {
    const reps = (status: 'ready' | 'watch' | 'blocked') => {
      const profile = {
        progressionCriteria: [{ id: 'easy-hr-stability', label: '', status, evidence: '', action: '' }],
        tempoCeiling: { adoptedBpm: null, baseBpm: null, adoptedAt: null }
      } as unknown as import('@/entities/training-memory/model').AdaptiveTrainingProfile
      return Number(
        buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase: 'Base' }), { goal, injury: null, chronic: noChronic, adaptiveProfile: profile })
          .execution.find((l) => l.includes('스트라이드'))?.match(/× (\d+)회/)?.[1] ?? 0
      )
    }
    expect(reps('ready')).toBeGreaterThan(reps('watch'))
    expect(reps('blocked')).toBeLessThan(reps('watch'))
  })

  it('단계가 레이스에 가까울수록 스트라이드 반복수가 많다(산출)', () => {
    const reps = (phase: 'Base' | 'Race Specific') =>
      Number(
        buildSessionBriefing(session({ sessionType: 'Easy + Strides', phase }), { goal, injury: null, chronic: noChronic })
          .execution.find((l) => l.includes('스트라이드'))?.match(/× (\d+)회/)?.[1] ?? 0
      )
    expect(reps('Race Specific')).toBeGreaterThan(reps('Base'))
  })

  it('부하 급증이 조심할 점에 반영', () => {
    const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }
    const b = buildSessionBriefing(session({ sessionType: 'Easy' }), { goal, injury: null, chronic: spike })
    expect(b.cautions.some((c) => c.includes('55%'))).toBe(true)
  })

  it('Tempo 는 Daniels 근거가 붙는다', () => {
    const b = buildSessionBriefing(session({ sessionType: 'Tempo', keySession: true }), { goal, injury: null, chronic: noChronic })
    expect(b.evidence.some((e) => e.method.includes('Daniels'))).toBe(true)
  })
})

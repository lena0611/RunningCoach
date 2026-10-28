import { describe, expect, it } from 'vitest'
import { normalizeTrainingMemory, type TrainingPhaseName } from '@/entities/training-memory/model'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { buildPlanPhaseJourney, currentPlanPhase } from '@/shared/lib/coaching/planPhases'

function session(overrides: Partial<ScheduledSession> & { date: string }): ScheduledSession {
  return {
    id: overrides.id ?? overrides.date,
    userId: 'u1',
    goalId: 'g1',
    date: overrides.date,
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy',
    slot: null,
    keySession: false,
    prescription: defaultScheduledSessionPrescription(),
    status: overrides.status ?? 'planned',
    source: 'generator',
    runId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 10K 10주 플랜: 기초 4 · 발전 2 · 역치 1 · 레이스 준비 2 · 테이퍼 1. 주마다 화·목·일 3회. 첫 주 월요일 = 2026-10-12. */
const TEN_WEEKS: TrainingPhaseName[] = ['Base', 'Base', 'Base', 'Base', 'Build', 'Build', 'Threshold', 'Race Specific', 'Race Specific', 'Taper']
function tenWeekPlan(): ScheduledSession[] {
  return TEN_WEEKS.flatMap((phase, week) =>
    [1, 3, 6].map((offset) => session({ date: addDays('2026-10-12', week * 7 + offset), phase }))
  )
}

describe('buildPlanPhaseJourney (#887 — 단계의 정본은 플랜)', () => {
  it('주를 단계 블록으로 묶고 오늘 위치를 낸다', () => {
    const journey = buildPlanPhaseJourney(tenWeekPlan(), new Date('2026-11-25T09:00:00')) // 7주차 수요일
    expect(journey).not.toBeNull()
    expect(journey!.blocks.map((b) => [b.phase, b.weeks])).toEqual([
      ['Base', 4],
      ['Build', 2],
      ['Threshold', 1],
      ['Race Specific', 2],
      ['Taper', 1]
    ])
    expect(journey!.blocks[0]).toMatchObject({ start: '2026-10-12', end: '2026-11-08' })
    expect(journey!.blocks[3]).toMatchObject({ start: '2026-11-30', end: '2026-12-13' })
    expect(journey!.currentIndex).toBe(2)
    expect(journey!.weekInBlock).toBe(1)
    expect(journey!.weekInPlan).toBe(7)
    expect(journey!.totalWeeks).toBe(10)
  })

  it('블록 안 몇째 주인지 센다', () => {
    const journey = buildPlanPhaseJourney(tenWeekPlan(), new Date('2026-10-28T09:00:00')) // 3주차
    expect(journey!.currentIndex).toBe(0)
    expect(journey!.weekInBlock).toBe(3)
  })

  it('세션이 없는 주는 앞 주 단계를 잇는다 — 막대가 끊기지 않는다', () => {
    const plan = tenWeekPlan().filter((s) => !(s.date >= '2026-10-26' && s.date <= '2026-11-01')) // 3주차 비움
    const journey = buildPlanPhaseJourney(plan, new Date('2026-11-25T09:00:00'))
    expect(journey!.totalWeeks).toBe(10)
    expect(journey!.blocks[0].weeks).toBe(4)
  })

  it('대체(superseded)된 세션은 단계를 정하지 않는다', () => {
    const plan = [
      ...tenWeekPlan(),
      session({ id: 'old', date: '2026-11-24', phase: 'Base', status: 'superseded' }),
      session({ id: 'old2', date: '2026-11-26', phase: 'Base', status: 'superseded' })
    ]
    expect(currentPlanPhase(plan, new Date('2026-11-25T09:00:00'))).toBe('Threshold')
  })

  it('오늘이 플랜 기간 밖이면 null — 카드를 띄우지 않는다', () => {
    expect(buildPlanPhaseJourney(tenWeekPlan(), new Date('2026-12-30T09:00:00'))).toBeNull()
    expect(buildPlanPhaseJourney([], new Date('2026-11-25T09:00:00'))).toBeNull()
  })
})

describe('buildCoachAdaptiveProgress — 플랜 단계를 쓴다(#887)', () => {
  it('기억에 옛 단계(Base)가 남아 있어도 플랜 단계로 평가한다 — 역치기엔 템포 기준이 켜진다', () => {
    const memory = normalizeTrainingMemory({ adaptiveTrainingProfile: { trainingPhase: { currentPhase: 'Base' } } } as never)
    const summary = buildCoachAdaptiveProgress([], memory, 'Threshold')
    expect(summary.currentPhase).toBe('Threshold')
    expect(summary.criteria.find((c) => c.id === 'tempo-ceiling-quality')?.status).not.toBe('n/a')
    expect('phaseProposal' in summary).toBe(false)
  })
})

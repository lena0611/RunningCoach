import { describe, expect, it } from 'vitest'
import { normalizeTrainingMemory, type TrainingPhaseName } from '@/entities/training-memory/model'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { buildPlanPhaseJourney, currentPlanPhase, phaseCalendarStart } from '@/shared/lib/coaching/planPhases'

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

  it('이번 주가 핵심 세션 없이 9km 미만이면 주행량 먼저 쌓는 주(#893) — 단계 카드 설명을 바꾼다', () => {
    const rx = (distanceKm: number) => ({ ...defaultScheduledSessionPrescription(), distanceKm })
    const withKm = (km: number, key: boolean) =>
      tenWeekPlan().map((s) => ({ ...s, prescription: rx(km), keySession: key && s.date === '2026-11-26' }))
    const today = new Date('2026-11-25T09:00:00') // 7주차(역치)
    expect(buildPlanPhaseJourney(withKm(2, false), today)!.volumeFirstWeek).toBe(true)
    expect(buildPlanPhaseJourney(withKm(2, true), today)!.volumeFirstWeek).toBe(false)
    expect(buildPlanPhaseJourney(withKm(4, false), today)!.volumeFirstWeek).toBe(false)
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

// #893: 단계 달력 시작일 — 첫 세션 날짜, 단 28일 넘는 런 공백 뒤면 공백 뒤 첫 런(지금 공백 중이면 오늘).
describe('phaseCalendarStart (#893)', () => {
  const sessions = (...dates: string[]) => dates.map((date) => ({ date }))

  it('플랜이 없거나 오늘 시작이면 null — 오늘부터 나눈다', () => {
    expect(phaseCalendarStart([], ['2026-10-01'], '2026-10-28')).toBeNull()
    expect(phaseCalendarStart(sessions('2026-10-28', '2026-10-30'), [], '2026-10-28')).toBeNull()
  })

  it('꾸준히 뛰었으면 그 목표의 가장 이른 세션 날짜', () => {
    const runs = ['2026-09-28', '2026-10-03', '2026-10-10', '2026-10-17', '2026-10-25']
    expect(phaseCalendarStart(sessions('2026-10-12', '2026-10-01', '2026-11-20'), runs, '2026-10-28')).toBe('2026-10-01')
  })

  it('플랜 중 28일 넘게 안 뛰었으면 공백 뒤 첫 런부터 — 쌓은 체력이 사실상 사라졌다', () => {
    const runs = ['2026-08-03', '2026-08-10', '2026-09-20', '2026-09-25', '2026-10-20']
    expect(phaseCalendarStart(sessions('2026-08-01'), runs, '2026-10-28')).toBe('2026-09-20')
  })

  it('공백이 4주 이하면 달력을 잇는다', () => {
    // 08-03 → 08-31 사이 안 뛴 날 27일
    expect(phaseCalendarStart(sessions('2026-08-01'), ['2026-08-03', '2026-08-31', '2026-09-25'], '2026-10-01')).toBe('2026-08-01')
  })

  it('공백은 플랜 시작 전 마지막 런부터 잰다', () => {
    // 플랜 시작 20일 전에 마지막으로 뛰고 시작 12일 뒤에 돌아왔다 — 31일 쉬었다
    expect(phaseCalendarStart(sessions('2026-09-01'), ['2026-08-12', '2026-09-13', '2026-09-20'], '2026-10-01')).toBe('2026-09-13')
  })

  it('지금 28일 넘게 쉬는 중이면 오늘부터', () => {
    expect(phaseCalendarStart(sessions('2026-08-01'), ['2026-08-05', '2026-09-01'], '2026-10-28')).toBe('2026-10-28')
  })

  it('목표 시작일이 첫 세션보다 늦으면 그날부터 — 쉬던 목표를 다시 시작하면 새 달력(#893 후속)', () => {
    const steady = ['2026-06-20', '2026-07-01', '2026-07-20', '2026-08-10', '2026-09-01', '2026-09-20', '2026-10-10', '2026-11-01', '2026-11-20']
    // 6/18 플랜, 11/30 에 다시 시작(회복 리듬으로 계속 뛰어 28일 공백 없음) → 다시 시작한 날부터
    expect(phaseCalendarStart(sessions('2026-06-18'), steady, '2026-12-10', '2026-11-30')).toBe('2026-11-30')
    // 다시 시작한 날이 오늘이면 오늘부터 나눈다
    expect(phaseCalendarStart(sessions('2026-06-18'), steady, '2026-11-30', '2026-11-30')).toBeNull()
    // 시작일이 첫 세션보다 이르거나 없으면 예전처럼 첫 세션
    expect(phaseCalendarStart(sessions('2026-06-18'), steady, '2026-10-28', '2026-06-01')).toBe('2026-06-18')
    expect(phaseCalendarStart(sessions('2026-06-18'), steady, '2026-10-28', null)).toBe('2026-06-18')
  })

  it('플랜을 짓고 한 번도 안 뛰었으면 플랜 시작일부터 잰다', () => {
    expect(phaseCalendarStart(sessions('2026-10-15'), [], '2026-10-28')).toBe('2026-10-15')
    expect(phaseCalendarStart(sessions('2026-09-01'), [], '2026-10-28')).toBe('2026-10-28')
  })
})

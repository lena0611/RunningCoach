import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import {
  defaultScheduledSessionPrescription,
  type ScheduledSession
} from '@/entities/training-schedule/model'
import { buildRealignedSchedule, detectScheduleDeviation } from '@/shared/lib/coaching/scheduleRealign'

function session(overrides: Partial<ScheduledSession>): ScheduledSession {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    userId: 'u1',
    goalId: 'g1',
    date: overrides.date ?? '2026-01-01',
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy',
    keySession: overrides.keySession ?? false,
    prescription: overrides.prescription ?? defaultScheduledSessionPrescription(),
    status: overrides.status ?? 'planned',
    source: 'generator',
    runId: overrides.runId ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

const today = new Date('2026-01-15T00:00:00')

function goal(overrides: Partial<TrainingGoal> = {}): TrainingGoal {
  return {
    id: 'g1',
    title: '10K',
    category: 'race',
    startDate: null,
    targetDate: overrides.targetDate ?? '2026-04-15',
    distanceKm: overrides.distanceKm ?? 10,
    targetDurationSec: null,
    priority: 1,
    status: 'active',
    successCriteria: '',
    strategyNotes: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

function profile(): AthleteProfile {
  return {
    birthYear: 1990,
    sex: 'male',
    runningExperienceMonths: 24,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: [],
    runnerLevel: 'auto',
    maxHeartRate: null,
    restingHeartRate: null,
    lactateThresholdHr: null,
    heartRateMode: 'auto',
    vo2Max: null,
    vo2MaxSampleDate: null,
    vo2MaxSource: null
  }
}

describe('detectScheduleDeviation', () => {
  it('미수행 누락이 없으면 재정렬 불요', () => {
    const sessions = [
      session({ date: '2026-01-10', status: 'done', runId: 'r1' }),
      session({ date: '2026-01-20', status: 'planned' })
    ]
    expect(detectScheduleDeviation(sessions, today).shouldRealign).toBe(false)
  })

  it('지난 미수행 3개면 재정렬 트리거', () => {
    const sessions = [
      session({ date: '2026-01-08' }),
      session({ date: '2026-01-10' }),
      session({ date: '2026-01-12' })
    ]
    const dev = detectScheduleDeviation(sessions, today)
    expect(dev.missedCount).toBe(3)
    expect(dev.shouldRealign).toBe(true)
    expect(dev.reason).toBeTruthy()
  })

  it('키세션 2개 누락이면 임계 미만 총량이어도 트리거', () => {
    const sessions = [
      session({ date: '2026-01-08', keySession: true, sessionType: 'Tempo' }),
      session({ date: '2026-01-11', keySession: true, sessionType: 'LSD' })
    ]
    const dev = detectScheduleDeviation(sessions, today)
    expect(dev.missedKeyCount).toBe(2)
    expect(dev.shouldRealign).toBe(true)
  })

  it('완료(runId)·미래 세션은 누락으로 안 친다', () => {
    const sessions = [
      session({ date: '2026-01-08', status: 'done', runId: 'r1', keySession: true }),
      session({ date: '2026-01-09', status: 'superseded' }),
      session({ date: '2026-01-25', keySession: true })
    ]
    // superseded(폐기)는 미수행 누락 후보지만 done/미래는 제외 → superseded 1개뿐이라 임계 미만
    const dev = detectScheduleDeviation(sessions, today)
    expect(dev.shouldRealign).toBe(false)
  })

  it('앵커 드리프트(up): 누락 없어도 실제 체력이 처방 볼륨보다 25%+ 크면 재앵커', () => {
    // 잘 소화 중(미래 세션만)인데 실제 주행량이 플랜보다 훨씬 큼 → 체력 성장 반영
    const sessions = [session({ date: '2026-01-20', status: 'planned' })]
    const dev = detectScheduleDeviation(sessions, today, {
      currentWeeklyKm: 32.5,
      plannedWeeklyKm: 18,
      upcomingPhase: 'Base'
    })
    expect(dev.missedCount).toBe(0)
    expect(dev.anchorDrift).toBe(true)
    expect(dev.anchorDriftDir).toBe('up')
    expect(dev.shouldRealign).toBe(true)
    expect(dev.reason).toContain('늘어')
  })

  it('앵커 드리프트(up)는 Taper/Recovery 의 의도된 저볼륨에선 무시', () => {
    const dev = detectScheduleDeviation([], today, {
      currentWeeklyKm: 32.5,
      plannedWeeklyKm: 18,
      upcomingPhase: 'Taper'
    })
    expect(dev.anchorDrift).toBe(false)
    expect(dev.shouldRealign).toBe(false)
  })

  it('앵커 드리프트(down): 실제 체력이 처방보다 25%+ 작으면 하향 재앵커', () => {
    const dev = detectScheduleDeviation([], today, {
      currentWeeklyKm: 12,
      plannedWeeklyKm: 18,
      upcomingPhase: 'Base'
    })
    expect(dev.anchorDriftDir).toBe('down')
    expect(dev.shouldRealign).toBe(true)
    expect(dev.reason).toContain('줄어')
  })

  it('밴드(±25%) 안이면 앵커 드리프트 비발동', () => {
    const dev = detectScheduleDeviation([], today, {
      currentWeeklyKm: 20,
      plannedWeeklyKm: 18,
      upcomingPhase: 'Base'
    })
    expect(dev.anchorDrift).toBe(false)
    expect(dev.shouldRealign).toBe(false)
  })
})

describe('buildRealignedSchedule', () => {
  it('재정렬 불요면 drafts 비어있음(no-op)', () => {
    const sessions = [session({ date: '2026-01-20', status: 'planned' })]
    const plan = buildRealignedSchedule(sessions, goal(), profile(), today)
    expect(plan.drafts).toEqual([])
    expect(plan.fromDate).toBe('2026-01-15')
  })

  it('재정렬 시 오늘부터 목표일 고정 골격 재생성(source=realign)', () => {
    const sessions = [
      session({ date: '2026-01-08', keySession: true, sessionType: 'Tempo' }),
      session({ date: '2026-01-11', keySession: true, sessionType: 'LSD' })
    ]
    const plan = buildRealignedSchedule(sessions, goal({ targetDate: '2026-04-15' }), profile(), today)
    expect(plan.drafts.length).toBeGreaterThan(5)
    expect(plan.drafts.every((d) => d.source === 'realign')).toBe(true)
    expect(plan.drafts.every((d) => d.date >= '2026-01-15')).toBe(true)
    expect(plan.drafts.every((d) => d.date <= '2026-04-15')).toBe(true)
  })

  it('누락 없이도 체력이 플랜보다 크게 성장하면 현재 체력으로 재앵커(자가치유)', () => {
    // 향후 7일 저볼륨 플랜(주 ~10.5km)인데 실제는 주 32km → 상향 재앵커되어야.
    const lowRx = { distanceKm: 3.5, durationMin: 24, paceRange: '', note: '' }
    const sessions = [
      session({ date: '2026-01-16', status: 'planned', prescription: lowRx }),
      session({ date: '2026-01-18', status: 'planned', prescription: lowRx }),
      session({ date: '2026-01-20', status: 'planned', prescription: lowRx })
    ]
    const plan = buildRealignedSchedule(
      sessions,
      goal({ targetDate: '2026-04-15' }),
      profile(),
      today,
      32 // currentWeeklyKm: 실제 최근 주행량
    )
    expect(plan.deviation.anchorDriftDir).toBe('up')
    expect(plan.drafts.length).toBeGreaterThan(5)
    // 재앵커된 롱런(LSD)이 기존 저볼륨 처방(3.5km)보다 커야 한다(현재 체력 반영).
    const lsd = plan.drafts.find((d) => d.sessionType === 'LSD' || d.sessionType === 'Steady Long')
    expect(lsd?.prescription.distanceKm ?? 0).toBeGreaterThan(8)
  })
})

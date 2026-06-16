import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { allocatePhases, buildPeriodizedSchedule } from '@/shared/lib/coaching/periodizedSchedule'

function goal(overrides: Partial<TrainingGoal>): TrainingGoal {
  return {
    id: overrides.id ?? 'g1',
    title: overrides.title ?? '10K 서브50',
    category: 'race',
    startDate: overrides.startDate ?? null,
    targetDate: overrides.targetDate ?? null,
    distanceKm: overrides.distanceKm ?? null,
    targetDurationSec: overrides.targetDurationSec ?? null,
    priority: 1,
    status: 'active',
    successCriteria: '',
    strategyNotes: '',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

function profile(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    birthYear: 1990,
    sex: 'male',
    runningExperienceMonths: 24,
    weeklyRunDaysTarget: overrides.weeklyRunDaysTarget ?? 4,
    preferredLongRunDay: overrides.preferredLongRunDay ?? '토요일',
    personalBests: overrides.personalBests ?? [],
    runnerLevel: 'auto',
    maxHeartRate: null,
    restingHeartRate: null,
    lactateThresholdHr: null,
    heartRateMode: 'auto',
    vo2Max: overrides.vo2Max ?? null,
    vo2MaxSampleDate: null,
    vo2MaxSource: null
  }
}

const HARD_TYPES = ['Tempo', 'Race']

describe('allocatePhases', () => {
  it('충분한 창이면 Base 로 시작해 Taper 로 끝난다', () => {
    const phases = allocatePhases(16, 10)
    expect(phases.length).toBe(16)
    expect(phases[0]).toBe('Base')
    expect(phases[phases.length - 1]).toBe('Taper')
    expect(phases).toContain('Build')
    expect(phases).toContain('Race Specific')
  })

  it('목표 거리가 길수록 테이퍼가 길다(10K=1주, 풀=3주)', () => {
    const tenK = allocatePhases(16, 10).filter((p) => p === 'Taper').length
    const full = allocatePhases(16, 42).filter((p) => p === 'Taper').length
    expect(tenK).toBe(1)
    expect(full).toBe(3)
  })

  it('아주 짧은 창은 Taper 로 압축', () => {
    expect(allocatePhases(2, 10)).toEqual(['Taper', 'Taper'])
  })

  it('충분히 길면 Threshold 블록을 생성한다(B2: dead branch 아님)', () => {
    expect(allocatePhases(16, 10)).toContain('Threshold')
  })
})

describe('buildPeriodizedSchedule', () => {
  const today = new Date('2026-01-05T00:00:00') // 월요일

  it('목표가 없으면 빈 스케줄', () => {
    expect(buildPeriodizedSchedule({ goal: goal({}), profile: profile({}), today })).toEqual([])
    expect(
      buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-04-05', distanceKm: null }), profile: profile({}), today })
    ).toEqual([])
  })

  it('입문(10K, PB 없음): 날짜별 골격 생성, 날짜 유일·범위 내, Base→Taper', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-04', distanceKm: 10 }),
      profile: profile({ weeklyRunDaysTarget: 3 }),
      today
    })
    expect(sched.length).toBeGreaterThan(10)
    // 날짜 오름차순 + 유일
    const dates = sched.map((s) => s.date)
    expect([...dates]).toEqual([...dates].sort())
    expect(new Set(dates).size).toBe(dates.length)
    // 범위 내
    for (const d of dates) {
      expect(d >= '2026-01-05').toBe(true)
      expect(d <= '2026-04-04').toBe(true)
    }
    // Phase 진행
    expect(sched[0].phase).toBe('Base')
    expect(sched[sched.length - 1].phase).toBe('Taper')
  })

  it('첫 주가 비지 않는다(B1: 금요일 시작도 7일 내 세션 존재)', () => {
    const friday = new Date('2026-01-09T00:00:00') // 금요일
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-04', distanceKm: 10 }),
      profile: profile({ weeklyRunDaysTarget: 4 }),
      today: friday
    })
    expect(sched.length).toBeGreaterThan(0)
    // 첫 세션이 시작일 이후 7일 이내
    expect(sched[0].date >= '2026-01-09').toBe(true)
    expect(sched[0].date <= '2026-01-15').toBe(true)
  })

  it('중급(10K, PB 있음): 페이스대가 채워진다(measured)', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-04', distanceKm: 10 }),
      profile: profile({ personalBests: [{ distanceKm: 5, durationSec: 1350, achievedAt: '2025-12-01' } as never] }),
      today
    })
    const tempo = sched.find((s) => s.sessionType === 'Tempo')
    expect(tempo?.prescription.paceRange).toBeTruthy()
    const easy = sched.find((s) => s.sessionType === 'Easy + Strides')
    expect(easy?.prescription.paceRange).toBeTruthy()
  })

  it('80/20 가드레일: 고강도(Tempo/Race) 볼륨 비중이 30% 이하', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-04', distanceKm: 10 }),
      profile: profile({ weeklyRunDaysTarget: 5 }),
      today
    })
    const totalKm = sched.reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0)
    const hardKm = sched
      .filter((s) => HARD_TYPES.includes(s.sessionType))
      .reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0)
    expect(totalKm).toBeGreaterThan(0)
    expect(hardKm / totalKm).toBeLessThanOrEqual(0.3)
  })

  it('하프 준비(21.1km, 16주): 테이퍼 2주 + 키세션 존재', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-25', distanceKm: 21.1 }),
      profile: profile({ weeklyRunDaysTarget: 5 }),
      today
    })
    expect(sched.some((s) => s.keySession)).toBe(true)
    expect(sched.some((s) => s.phase === 'Taper')).toBe(true)
    // 롱런이 키세션으로 표시됨
    expect(sched.some((s) => (s.sessionType === 'LSD' || s.sessionType === 'Steady Long') && s.keySession)).toBe(true)
  })
})

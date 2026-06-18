import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { allocatePhases, assessGoalFeasibility, buildPeriodizedSchedule, buildSteadyWeeklyRhythm, goalArchetype } from '@/shared/lib/coaching/periodizedSchedule'

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

  it('회복 기준: 키/하드 세션이 인접일에 연속되지 않는다(하드 사이 회복 보장)', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-04-25', distanceKm: 21.1 }),
      profile: profile({ weeklyRunDaysTarget: 5 }),
      today
    })
    const keyDates = sched.filter((s) => s.keySession).map((s) => s.date).sort()
    for (let i = 1; i < keyDates.length; i++) {
      const gap = Math.round(
        (new Date(`${keyDates[i]}T00:00:00`).getTime() - new Date(`${keyDates[i - 1]}T00:00:00`).getTime()) / 86400000
      )
      expect(gap).toBeGreaterThanOrEqual(2) // 하드 사이 최소 1일 회복
    }
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

  // #395 시작 볼륨 앵커링: 시작일(월 1/5) 기준 첫 7일 세션 거리 합 ≈ 시작 주간 볼륨.
  const firstWeekKm = (sched: ReturnType<typeof buildPeriodizedSchedule>) =>
    sched.filter((s) => s.date <= '2026-01-11').reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0)

  it('#411 단계 블록 끝에 한계 시험(Race/TT)이 키세션으로 삽입된다', () => {
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-07-05', distanceKm: 10 }),
      profile: profile({ weeklyRunDaysTarget: 4 }),
      today
    })
    const races = sched.filter((s) => s.sessionType === 'Race')
    expect(races.length).toBeGreaterThan(0)
    expect(races.every((s) => s.keySession)).toBe(true)
    // Base 블록 끝에도 재측정 TT가 있어야(추정→실측 전환 지점)
    expect(sched.some((s) => s.sessionType === 'Race' && s.phase === 'Base')).toBe(true)
    // TT는 짧은 단거리(≤5km)
    expect(races.every((s) => (s.prescription.distanceKm ?? 0) <= 5)).toBe(true)
  })

  it('#395 시작 볼륨이 현재 주행량에 앵커링된다(고볼륨 러너 > 입문자)', () => {
    const g = goal({ targetDate: '2026-07-05', distanceKm: 10 })
    const beginner = buildPeriodizedSchedule({ goal: g, profile: profile({}), today, currentWeeklyKm: 15 })
    const fit = buildPeriodizedSchedule({ goal: g, profile: profile({}), today, currentWeeklyKm: 60 })
    expect(firstWeekKm(fit)).toBeGreaterThan(firstWeekKm(beginner))
  })

  it('#395 현재 주행량 데이터 없으면 보수적 기본값(목표거리 역산 폭증 아님)', () => {
    const cold = buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-07-05', distanceKm: 10 }), profile: profile({}), today })
    // 콜드스타트 base = min(10×2.5, 20)=20 → 첫주 ~20km(옛 역산 25 아님)
    expect(firstWeekKm(cold)).toBeGreaterThan(8)
    expect(firstWeekKm(cold)).toBeLessThan(24)
  })

  it('#395 이미 목표 피크 이상으로 뛰면 무리한 증량 없이 현재에 앵커(base ≤ peak)', () => {
    // 10K 목표 피크는 40km/주인데 현재 80km/주 → 40 역산이 아니라 80에 앵커
    const sched = buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-07-05', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 80 })
    expect(firstWeekKm(sched)).toBeGreaterThan(50)
  })
})

describe('목표 타입별 코칭 (#398)', () => {
  const today = new Date('2026-06-18T00:00:00')

  it('goalArchetype: category → 아키타입 매핑', () => {
    expect(goalArchetype('race')).toBe('performance')
    expect(goalArchetype('fitness')).toBe('fat-loss')
    expect(goalArchetype('health')).toBe('wellbeing')
    expect(goalArchetype('habit')).toBe('wellbeing')
    expect(goalArchetype('maintenance')).toBe('wellbeing')
  })

  it('상시 주간 리듬: 주기화 단계/키세션/TT 없음, Easy 중심 롤링', () => {
    const sched = buildSteadyWeeklyRhythm({ archetype: 'fat-loss', profile: profile({ weeklyRunDaysTarget: 4 }), today, weeks: 4 })
    expect(sched.length).toBeGreaterThan(8)
    expect(sched.every((s) => s.phase === 'Base')).toBe(true) // 비주기화
    expect(sched.some((s) => s.keySession)).toBe(false) // 키세션 없음
    expect(sched.some((s) => s.sessionType === 'Race')).toBe(false) // TT 없음
    expect(sched.some((s) => s.sessionType === 'Tempo')).toBe(false) // 강자극 없음
    // Easy 계열만(Easy/Recovery/LSD)
    expect(sched.every((s) => ['Easy', 'Recovery', 'LSD'].includes(s.sessionType))).toBe(true)
  })

  it('건강·습관은 지방연소보다 저부담(주당 세션 수 ≤)', () => {
    const fat = buildSteadyWeeklyRhythm({ archetype: 'fat-loss', profile: profile({}), today, weeks: 1 })
    const well = buildSteadyWeeklyRhythm({ archetype: 'wellbeing', profile: profile({}), today, weeks: 1 })
    expect(well.length).toBeLessThanOrEqual(fat.length)
  })

  it('관측 Easy 페이스가 있으면 리듬 처방에 반영', () => {
    const sched = buildSteadyWeeklyRhythm({
      archetype: 'wellbeing',
      profile: profile({}),
      today,
      weeks: 1,
      observedEasyPace: { easyPaceSec: 450, easyPaceRangeSec: [473, 428] }
    })
    const easy = sched.find((s) => s.sessionType === 'Easy')
    expect(easy?.prescription.paceRange).toBeTruthy()
  })
})

describe('assessGoalFeasibility (#395)', () => {
  const today = new Date('2026-01-05T00:00:00')

  it('시간 충분 + 현재 주행량 적당 → feasible(경고 없음)', () => {
    const f = assessGoalFeasibility({ goal: goal({ targetDate: '2026-07-05', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 25 })
    expect(f.feasible).toBe(true)
    expect(f.message).toBeNull()
  })

  it('거의 안 뛰는데 목표가 임박 → 솔직한 경고 + 대안', () => {
    const f = assessGoalFeasibility({ goal: goal({ targetDate: '2026-03-01', distanceKm: 42 }), profile: profile({}), today, currentWeeklyKm: 8 })
    expect(f.feasible).toBe(false)
    expect(f.message).toContain('목표')
  })

  it('이미 목표 피크 이상이면 feasible', () => {
    const f = assessGoalFeasibility({ goal: goal({ targetDate: '2026-03-01', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 60 })
    expect(f.feasible).toBe(true)
  })
})

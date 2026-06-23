import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { allocatePhases, assessGoalFeasibility, buildPeriodizedSchedule, buildSteadyWeeklyRhythm, buildWeekSummary, goalArchetype, trainingWeekRange } from '@/shared/lib/coaching/periodizedSchedule'

function session(overrides: Partial<ScheduledSession> & { date: string }): ScheduledSession {
  return {
    id: overrides.id ?? overrides.date,
    userId: 'u1',
    goalId: overrides.goalId ?? 'g1',
    date: overrides.date,
    phase: overrides.phase ?? 'Base',
    sessionType: overrides.sessionType ?? 'Easy',
    slot: overrides.slot ?? null,
    keySession: overrides.keySession ?? false,
    prescription: overrides.prescription ?? defaultScheduledSessionPrescription(),
    status: overrides.status ?? 'planned',
    source: overrides.source ?? 'generator',
    runId: overrides.runId ?? null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  }
}

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

describe('trainingWeekRange (이번 주 SSOT, 월~일)', () => {
  it('주중(목요일) 기준 그 주 월요일~일요일을 돌려준다', () => {
    // 2026-06-18 = 목요일 → 월 2026-06-15, 일 2026-06-21
    const r = trainingWeekRange(new Date('2026-06-18T09:00:00'))
    expect(r.start).toBe('2026-06-15')
    expect(r.end).toBe('2026-06-21')
  })

  it('일요일은 그 주의 마지막 날(이전 월요일 시작)로 본다', () => {
    // 2026-06-21 = 일요일 → 월 2026-06-15
    const r = trainingWeekRange(new Date('2026-06-21T23:00:00'))
    expect(r.start).toBe('2026-06-15')
    expect(r.end).toBe('2026-06-21')
  })

  it('월요일은 그 주의 첫 날이다', () => {
    const r = trainingWeekRange(new Date('2026-06-15T00:30:00'))
    expect(r.start).toBe('2026-06-15')
    expect(r.end).toBe('2026-06-21')
  })
})

describe('buildPeriodizedSchedule 복귀 램프(#473 Phase 2)', () => {
  const rampGoal = goal({ targetDate: '2026-12-31', distanceKm: 10 })
  const rampProfile = profile({})
  const rampToday = new Date('2026-06-01T00:00:00')

  it('returnRamp 면 초반 windowSessions 개 세션을 Easy 계열 + 거리 ≤ capKm 로 캡', () => {
    const drafts = buildPeriodizedSchedule({ goal: rampGoal, profile: rampProfile, today: rampToday, currentWeeklyKm: 30, returnRamp: { capKm: 3, windowSessions: 3 } })
    expect(drafts.length).toBeGreaterThan(3)
    // 초반 3개 모두 캡(첫 1개만이 아니라 — RR-1 회귀 방지: 둘째·셋째가 키세션/롱런이어도 Easy·캡)
    for (const d of drafts.slice(0, 3)) {
      expect(['Easy', 'Recovery']).toContain(d.sessionType)
      expect(d.keySession).toBe(false)
      expect(d.prescription.distanceKm ?? 0).toBeLessThanOrEqual(3)
      expect(d.prescription.distanceKm ?? 0).toBeGreaterThan(0)
    }
  })

  it('windowSessions 밖 세션은 캡 안 함(점진 복원은 재앵커가 담당)', () => {
    const capped = buildPeriodizedSchedule({ goal: rampGoal, profile: rampProfile, today: rampToday, currentWeeklyKm: 30, returnRamp: { capKm: 3, windowSessions: 2 } })
    // 처음 2개는 ≤3km, 그 뒤 어딘가엔 3km 초과 세션이 존재(전체를 평탄화하지 않음)
    expect(capped[0].prescription.distanceKm ?? 0).toBeLessThanOrEqual(3)
    expect(capped[1].prescription.distanceKm ?? 0).toBeLessThanOrEqual(3)
    expect(capped.slice(2).some((d) => (d.prescription.distanceKm ?? 0) > 3)).toBe(true)
  })

  it('windowSessions=0 이면 캡 미적용(회귀) — 첫 세션이 capKm 초과 가능', () => {
    const plain = buildPeriodizedSchedule({ goal: rampGoal, profile: rampProfile, today: rampToday, currentWeeklyKm: 30 })
    const noRamp = buildPeriodizedSchedule({ goal: rampGoal, profile: rampProfile, today: rampToday, currentWeeklyKm: 30, returnRamp: { capKm: 3, windowSessions: 0 } })
    expect(noRamp[0].prescription.distanceKm).toBe(plain[0].prescription.distanceKm)
    expect(noRamp[0].sessionType).toBe(plain[0].sessionType)
  })
})

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

  it('롱런 직후 슬롯은 Recovery(또는 휴식) — Easy+Strides 금지', () => {
    // 6일/주로 조밀하게 → 롱런 다음날에 세션이 놓일 가능성을 높여 규칙을 검증.
    const sched = buildPeriodizedSchedule({
      goal: goal({ targetDate: '2026-05-30', distanceKm: 10 }),
      profile: profile({ weeklyRunDaysTarget: 6 }),
      today,
      currentWeeklyKm: 45
    })
    const byDate = new Map(sched.map((s) => [s.date, s]))
    const longs = sched.filter((s) => s.sessionType === 'LSD' || s.sessionType === 'Steady Long')
    expect(longs.length).toBeGreaterThan(3)
    let checkedAdjacent = 0
    for (const lr of longs) {
      const next = new Date(`${lr.date}T00:00:00`)
      next.setDate(next.getDate() + 1)
      const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      const nextSession = byDate.get(nextStr)
      if (!nextSession) continue // 휴식이면 OK
      checkedAdjacent++
      expect(nextSession.sessionType).not.toBe('Easy + Strides')
      expect(nextSession.sessionType).toBe('Recovery')
    }
    expect(checkedAdjacent).toBeGreaterThan(0) // 최소 한 번은 인접 슬롯을 실제로 검증
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

describe('buildWeekSummary — rested 제외 (#473)', () => {
  const today = new Date('2026-01-15T00:00:00') // 목요일, 주=월 01-12~일 01-18
  const rx = (km: number) => ({ distanceKm: km, durationMin: null, paceRange: '', note: '' })

  it('rested(선언한 휴식) 세션은 주간 요약 km·핵심 카운트에서 빠진다 — 쉬는 주를 "약 N km" 로 닦달 안 함', () => {
    const sessions = [
      session({ date: '2026-01-13', sessionType: 'Easy', prescription: rx(6) }), // planned 6km
      session({ date: '2026-01-15', sessionType: 'Tempo', keySession: true, prescription: rx(10), status: 'rested' }),
      session({ date: '2026-01-17', sessionType: 'LSD', keySession: true, prescription: rx(15), status: 'rested' })
    ]
    const summary = buildWeekSummary(sessions, today, null, 'performance')
    expect(summary).not.toBeNull()
    expect(summary!.weekKm).toBe(6) // rested 10+15 제외, planned 6만
    expect(summary!.keyCount).toBe(0) // rested 핵심 2개 제외
  })
})

import { describe, expect, it } from 'vitest'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import { defaultScheduledSessionPrescription, type ScheduledSession } from '@/entities/training-schedule/model'
import { allocatePhases, assessGoalFeasibility, coldStartWeeklyKm, minimumGoalWeeklyKm, planMatchesEntryLevel, planPeakWeeklyKm, planStartWeeklyKm, planWeeklyVolumes, buildPeriodizedSchedule, buildSteadyWeeklyRhythm, buildWeekSummary, goalArchetype, trainingWeekRange } from '@/shared/lib/coaching/periodizedSchedule'

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
    weightKg: overrides.weightKg ?? null,
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

  it('10K·8주·주 12km 는 초보 플랜 기준으로 닿을 수 있다 — 경고 없음(거리×4 피크 과대 판정 회귀)', () => {
    const f = assessGoalFeasibility({ goal: goal({ targetDate: '2026-03-01', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 12 })
    expect(f.feasible).toBe(true)
    expect(f.message).toBeNull()
  })

  it('경고 문구는 근거 약한 10% 룰을 안전 기준으로 내세우지 않는다', () => {
    const f = assessGoalFeasibility({ goal: goal({ targetDate: '2026-03-01', distanceKm: 42 }), profile: profile({}), today, currentWeeklyKm: 8 })
    expect(f.message).not.toContain('10%')
    expect(f.message).toContain('주 약 64km')
  })
})

describe('minimumGoalWeeklyKm — 초보 플랜 피크 바닥값', () => {
  it('Higdon Novice 기준점과 보간', () => {
    expect(minimumGoalWeeklyKm(10)).toBe(20)
    expect(minimumGoalWeeklyKm(21.1)).toBe(38)
    expect(minimumGoalWeeklyKm(42.195)).toBe(64)
    expect(minimumGoalWeeklyKm(3)).toBe(15)
    expect(minimumGoalWeeklyKm(15)).toBeGreaterThan(20)
    expect(minimumGoalWeeklyKm(15)).toBeLessThan(38)
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

/**
 * 위크 요약이 **보고 있는 주**를 따라간다(2026-09-07). 바가 주 넘기기 화살표 바로 위라
 * 다음주를 보는데 이번 주 볼륨이 떠 있으면 그대로 오독한다(실측으로 확인된 사고).
 */
describe('buildWeekSummary — 보는 주(weekAnchor)', () => {
  const today = new Date('2026-01-15T00:00:00') // 목, 이번 주 = 01-12~01-18
  const nextWeek = new Date('2026-01-22T00:00:00') // 다음 주 = 01-19~01-25
  const rx = (km: number) => ({ distanceKm: km, durationMin: null, paceRange: '', note: '' })
  const sessions = [
    session({ date: '2026-01-13', sessionType: 'Easy', prescription: rx(6) }),
    session({ date: '2026-01-21', sessionType: 'Easy', prescription: rx(4), phase: 'Build' }),
    session({ date: '2026-01-24', sessionType: 'Tempo', keySession: true, prescription: rx(9), phase: 'Build' })
  ]

  it('앵커를 주면 그 주의 볼륨·핵심·단계를 낸다', () => {
    const summary = buildWeekSummary(sessions, today, '2026-03-01', 'performance', nextWeek)
    expect(summary!.weekKm).toBe(13) // 4 + 9 (이번 주 6km 아님)
    expect(summary!.keyCount).toBe(1)
    expect(summary!.phaseLabel).toBe('발전기')
  })

  it('D-day 는 어느 주를 보든 **오늘** 기준이다 — 대회까지 남은 날은 변하지 않는다', () => {
    const thisWeek = buildWeekSummary(sessions, today, '2026-03-01', 'performance')
    const viewed = buildWeekSummary(sessions, today, '2026-03-01', 'performance', nextWeek)
    expect(viewed!.dDayText).toBe(thisWeek!.dDayText)
  })

  it('앵커를 안 주면 예전처럼 오늘 주를 요약한다', () => {
    expect(buildWeekSummary(sessions, today, null, 'performance')!.weekKm).toBe(6)
  })
})

describe('buildWeekSummary — 입문(걷기·뛰기) 라벨 (#887)', () => {
  const today = new Date('2026-10-28T09:00:00')
  const sessions = ['2026-10-28', '2026-10-30', '2026-11-01'].map((date) => session({ date }))

  it('입문 레이스 플랜은 기초기가 아니라 걷기·뛰기, 세션 수를 함께 낸다', () => {
    const summary = buildWeekSummary(sessions, today, '2027-01-03', 'performance', today, true)
    expect(summary!.phaseLabel).toBe('걷기·뛰기')
    expect(summary!.focusLine).toBe('30분 연속 달리기 만들기')
    expect(summary!.sessionCount).toBe(3)
  })

  it('회복 우선 목표(#889)는 회복 우선 라벨', () => {
    const summary = buildWeekSummary(sessions, today, null, 'wellbeing', today, false, true)
    expect(summary!.phaseLabel).toBe('회복 우선')
    expect(summary!.focusLine).toBe('통증 없이 가볍게')
  })

  it('입문이 아니면 그대로 기초기', () => {
    expect(buildWeekSummary(sessions, today, '2027-01-03', 'performance')!.phaseLabel).toBe('기초기')
  })
})

/** 생성 플랜을 오늘 기준 7일 롤링 주로 묶어 주간 합(km)과 단계를 낸다(생성기의 주 정의와 같음). */
function weeklyTotals(drafts: ReturnType<typeof buildPeriodizedSchedule>, today: Date): Array<{ km: number; phase: string }> {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const weeks: Array<{ km: number; phase: string }> = []
  for (const d of drafts) {
    const w = Math.floor((new Date(`${d.date}T00:00:00`).getTime() - start.getTime()) / 86400000 / 7)
    weeks[w] ??= { km: 0, phase: d.phase }
    weeks[w].km += d.prescription.distanceKm ?? 0
  }
  return weeks
}

describe('planPeakWeeklyKm — 현재 주행량이 등급을 고른다 (#848)', () => {
  it('초보 피크 미만이면 초보 피크(Higdon Novice)', () => {
    expect(planPeakWeeklyKm(10, 12)).toBe(20)
    expect(planPeakWeeklyKm(21.1, 20)).toBe(38)
    expect(planPeakWeeklyKm(42.195, 30)).toBe(64)
  })

  it('초보 피크를 이미 뛰면 중급 피크 — 중급 러너 플랜이 평평해지지 않는다', () => {
    expect(planPeakWeeklyKm(10, 30)).toBe(40)
    expect(planPeakWeeklyKm(21.1, 40)).toBe(55)
    expect(planPeakWeeklyKm(42.195, 64)).toBe(71)
  })

  it('중급 피크도 넘으면 지금 주행량 유지(더 올리지 않는다)', () => {
    expect(planPeakWeeklyKm(10, 60)).toBe(60)
  })

  it('옛 거리×4 피크(하프 84·풀 169km)로 가지 않는다', () => {
    expect(planPeakWeeklyKm(21.1, 20)).toBeLessThan(84)
    expect(planPeakWeeklyKm(42.195, 30)).toBeLessThan(169)
  })
})

describe('planWeeklyVolumes — 늘리는 주는 같은 비율, 상한 25% (#848)', () => {
  it('늘리는 주끼리 증가율이 25% 를 넘지 않는다(짧은 창이라 피크에 못 닿아도)', () => {
    const phases = allocatePhases(5, 10)
    const vols = planWeeklyVolumes(phases, 8, 40)
    const build = vols.filter((_, i) => phases[i] !== 'Taper' && (i + 1) % 4 !== 0)
    for (let i = 1; i < build.length; i++) expect(build[i] / build[i - 1]).toBeLessThanOrEqual(1.251)
    expect(Math.max(...build)).toBeLessThan(40) // 상한 때문에 못 닿음 — 무리 여부는 판정이 말한다
  })

  it('회복주는 직전 늘린 주의 80%(바닥 base), 테이퍼는 실제 닿은 최고치 기준으로 감량', () => {
    const phases = allocatePhases(8, 10)
    const vols = planWeeklyVolumes(phases, 12, 20)
    expect(vols[3]).toBeCloseTo(Math.max(12, vols[2] * 0.8), 0)
    const reached = Math.max(...vols.filter((_, i) => phases[i] !== 'Taper'))
    for (const [i, v] of vols.entries()) if (phases[i] === 'Taper') expect(v).toBeLessThan(reached)
  })
})

describe('buildPeriodizedSchedule — 초보 플랜 현실화 (#848)', () => {
  const today = new Date('2026-10-08T09:00:00')

  it('실계정 모양(10K·11/30·주 12km): 피크 ≈ 20km, 회복주 직후 말고는 주 25% 넘게 안 뛴다', () => {
    const weeks = weeklyTotals(buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-11-30', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 12 }), today)
    expect(Math.max(...weeks.map((w) => w.km))).toBeLessThanOrEqual(20.5)
    for (let i = 1; i < weeks.length; i++) {
      if ((i - 1 + 1) % 4 === 0) continue // 회복주 다음 주는 회복주 대비 증가로 보지 않는다
      expect(weeks[i].km / weeks[i - 1].km).toBeLessThanOrEqual(1.26)
    }
  })

  it('주간 합이 목표 곡선을 따른다 — 세션 가중치(Tempo ×1.1·Recovery ×0.7)로 튀지 않는다', () => {
    const phases = allocatePhases(8, 10)
    const target = planWeeklyVolumes(phases, 12, 20)
    const weeks = weeklyTotals(buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-12-03', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 12 }), today)
    // 마지막 주는 대회일 이후 세션이 잘려 비교에서 뺀다
    for (let i = 0; i < weeks.length - 1; i++) expect(Math.abs(weeks[i].km - target[i])).toBeLessThanOrEqual(0.3)
  })

  it('주 30km 러너의 풀코스 플랜은 초보 피크(64km) 안에서 끝난다 — 예전 140km', () => {
    const weeks = weeklyTotals(buildPeriodizedSchedule({ goal: goal({ targetDate: '2027-02-11', distanceKm: 42.195 }), profile: profile({}), today, currentWeeklyKm: 30 }), today)
    expect(Math.max(...weeks.map((w) => w.km))).toBeLessThanOrEqual(64.5)
  })

  it('중급 10K 러너(주 30km, 16주)는 여전히 40km 까지 올라간다', () => {
    const weeks = weeklyTotals(buildPeriodizedSchedule({ goal: goal({ targetDate: '2027-01-28', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 30 }), today)
    expect(Math.max(...weeks.map((w) => w.km))).toBeGreaterThan(38)
  })
})

describe('assessGoalFeasibility — 목표 거리를 이미 뛰어봤으면 페이스로 (#847)', () => {
  const today = new Date('2026-10-16T09:00:00')
  const tenK = (targetDurationSec: number | null) => goal({ targetDate: '2026-11-30', distanceKm: 10, targetDurationSec })

  it('실사례 모양: 10K 59:59 목표·예상 1:16:50·6주 → 솔직한 페이스 경고 + 현실적 목표 기록', () => {
    const f = assessGoalFeasibility({ goal: tenK(3599), profile: profile({}), today, currentWeeklyKm: 4, recentLongestKm: 10.5, projectedSec: 4610 })
    expect(f.basis).toBe('pace')
    expect(f.feasible).toBe(false)
    expect(f.message).toContain('완주는 걱정 없어요')
    expect(f.message).toContain('1:16:50')
    expect(f.message).toContain('59:59')
    // 7주 × 0.5% = 3.5% → 4610×0.965 = 4449 → 분 올림 1:15:00
    expect(f.message).toContain('1:15:00')
    expect(f.message).not.toContain('주행량')
  })

  it('격차가 현실적 범위 안이면 경고 없음', () => {
    const f = assessGoalFeasibility({ goal: tenK(3540), profile: profile({}), today, currentWeeklyKm: 4, recentLongestKm: 12, projectedSec: 3600 })
    expect(f).toMatchObject({ feasible: true, basis: 'pace', message: null })
  })

  it('목표 기록이 없거나(완주 목표) 예상 기록이 없으면 경고하지 않는다 — 거리는 이미 뛰어봤다', () => {
    expect(assessGoalFeasibility({ goal: tenK(null), profile: profile({}), today, currentWeeklyKm: 4, recentLongestKm: 12, projectedSec: 4610 }).feasible).toBe(true)
    expect(assessGoalFeasibility({ goal: tenK(3599), profile: profile({}), today, currentWeeklyKm: 4, recentLongestKm: 12, projectedSec: null }).feasible).toBe(true)
  })

  it('최근 4주 안 최장이 목표 거리 미만이면 예전처럼 주행량으로 본다', () => {
    const f = assessGoalFeasibility({ goal: tenK(3599), profile: profile({}), today, currentWeeklyKm: 12, recentLongestKm: 8, projectedSec: 4610 })
    expect(f.basis).toBe('volume')
  })
})

describe('콜드스타트(주행량 데이터 없음)는 초보 등급 (#848 핫픽스)', () => {
  const today = new Date('2026-10-16T09:00:00')

  it('10K 데이터 없음 → 초보 피크(20km) 안에서 — 콜드스타트 20km 가 중급(40km)으로 올라가지 않는다', () => {
    const drafts = buildPeriodizedSchedule({ goal: goal({ targetDate: '2026-11-30', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: null })
    expect(Math.max(...weeklyTotals(drafts, today).map((w) => w.km))).toBeLessThanOrEqual(20.5)
  })

  it('같은 20km 라도 실제로 뛴 주행량이면 중급으로 간다(등급은 데이터가 고른다)', () => {
    const drafts = buildPeriodizedSchedule({ goal: goal({ targetDate: '2027-01-28', distanceKm: 10 }), profile: profile({}), today, currentWeeklyKm: 20 })
    expect(Math.max(...weeklyTotals(drafts, today).map((w) => w.km))).toBeGreaterThan(30)
  })
})

describe('저볼륨 세션 길이 + 한계 시험 간격 (#861)', () => {
  const today = new Date('2026-10-16T09:00:00')
  const tenK = goal({ targetDate: '2026-11-30', distanceKm: 10 })
  const weekOf = (date: string) => Math.floor((new Date(`${date}T00:00:00`).getTime() - new Date('2026-10-16T00:00:00').getTime()) / 86400000 / 7)

  it('실계정 모양(주 5.5km): 세션이 3km 밑으로 쪼개지지 않는다 — 한계 시험(고정 단거리)만 예외', () => {
    const drafts = buildPeriodizedSchedule({ goal: tenK, profile: profile({ weeklyRunDaysTarget: 4 }), today, currentWeeklyKm: 5.5 })
    const short = drafts.filter((d) => d.sessionType !== 'Race' && (d.prescription.distanceKm ?? 0) < 1.8)
    expect(short).toEqual([])
    // 볼륨이 낮은 주는 주 3회로 줄인다
    const perWeek = new Map<number, number>()
    for (const d of drafts) perWeek.set(weekOf(d.date), (perWeek.get(weekOf(d.date)) ?? 0) + 1)
    expect(perWeek.get(0)).toBe(3)
  })

  it('볼륨이 충분하면 프로필 목표 횟수(4회)를 그대로 쓴다', () => {
    const drafts = buildPeriodizedSchedule({ goal: tenK, profile: profile({ weeklyRunDaysTarget: 4 }), today, currentWeeklyKm: 20 })
    const week1 = drafts.filter((d) => weekOf(d.date) === 1)
    expect(week1).toHaveLength(4)
  })

  it('짧은 플랜(7주)에서 한계 시험은 4주 이상 간격 — 예전엔 3주 연속', () => {
    const drafts = buildPeriodizedSchedule({ goal: tenK, profile: profile({}), today, currentWeeklyKm: 15 })
    const ttWeeks = drafts.filter((d) => d.sessionType === 'Race').map((d) => weekOf(d.date))
    expect(ttWeeks.length).toBeGreaterThanOrEqual(1)
    expect(ttWeeks[0]).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < ttWeeks.length; i++) expect(ttWeeks[i] - ttWeeks[i - 1]).toBeGreaterThanOrEqual(4)
  })
})

describe('신규 사용자 시작점 — 온보딩 완주 경험으로 고른다 (#865)', () => {
  // 2026-10-26 신규 계정 실측: 경력 0개월·레이스 전·주 3회 → 기본값(주 18km)으로 이지 5.9km×2 + 4.1km 가 나왔다.
  const today = new Date('2026-10-26T09:00:00')
  // weeks: 1 이라 전체 합 = 그 주 합
  const totalKm = (drafts: Array<{ prescription: { distanceKm: number | null } }>) => drafts.reduce((sum, d) => sum + (d.prescription.distanceKm ?? 0), 0)

  it('완주한 거리의 다음 거리 초보 플랜 1주차 주행량 — 답이 없으면 레이스 전과 같다', () => {
    expect(coldStartWeeklyKm(null)).toBe(7.2)
    expect(coldStartWeeklyKm(0)).toBe(7.2)
    expect(coldStartWeeklyKm(5000)).toBe(12)
    expect(coldStartWeeklyKm(10000)).toBe(16)
  })

  it('하프·풀 완주자도 Half Novice 1주차(16km)에서 멈춘다 — 언제 완주했는지 모른다', () => {
    expect(coldStartWeeklyKm(21097.5)).toBe(16)
    expect(coldStartWeeklyKm(42195)).toBe(16)
  })

  it('planStartWeeklyKm: 기록이 없으면 온보딩 답, 있으면 기록이 시작점(대시보드·온보딩 미리보기 공용)', () => {
    expect(planStartWeeklyKm([], null, today)).toBe(7.2)
    expect(planStartWeeklyKm([], 5000, today)).toBe(12)
    const recent = [
      { date: '2026-10-20', distanceKm: 6 },
      { date: '2026-10-22', distanceKm: 6 },
      { date: '2026-10-25', distanceKm: 8 }
    ]
    // 기록이 있으면 완주 경험 답은 보지 않는다
    expect(planStartWeeklyKm(recent, null, today)).toBe(planStartWeeklyKm(recent, 42195, today))
    expect(planStartWeeklyKm(recent, null, today)).toBeGreaterThan(7.2)
  })

  it('완전 초보(레이스 전)의 건강·습관 리듬은 기본값보다 확실히 가볍다', () => {
    const beginner = buildSteadyWeeklyRhythm({ archetype: 'wellbeing', profile: profile({ weeklyRunDaysTarget: 3 }), today, weeks: 1, currentWeeklyKm: coldStartWeeklyKm(null) })
    const fallback = buildSteadyWeeklyRhythm({ archetype: 'wellbeing', profile: profile({ weeklyRunDaysTarget: 3 }), today, weeks: 1 })
    // Higdon 5K Novice 1주차(2.4km × 3) 수준 — 리듬은 시작점의 70~88% 를 처방한다(안전 여유)
    expect(totalKm(beginner)).toBeLessThanOrEqual(7.2)
    expect(totalKm(beginner)).toBeLessThan(totalKm(fallback) / 2)
    expect(Math.max(...beginner.map((d) => d.prescription.distanceKm ?? 0))).toBeLessThanOrEqual(2.5)
  })

  it('저볼륨 리듬은 목표 횟수(4회)로 쪼개지 않고 주 3회로 줄인다 — #861 규칙을 리듬에도', () => {
    const drafts = buildSteadyWeeklyRhythm({ archetype: 'wellbeing', profile: profile({ weeklyRunDaysTarget: 4 }), today, weeks: 1, currentWeeklyKm: 7.2 })
    expect(drafts).toHaveLength(3)
    const enough = buildSteadyWeeklyRhythm({ archetype: 'wellbeing', profile: profile({ weeklyRunDaysTarget: 4 }), today, weeks: 1, currentWeeklyKm: 18 })
    expect(enough).toHaveLength(4)
  })
})

// #876: 입문(5K 미완주)은 레이스 목표여도 걷기·뛰기만 — SSOT §숙련도별 처방 입문 행.
describe('입문자 레이스 플랜 (#876)', () => {
  const today = new Date('2026-10-26T09:00:00')
  const beginner = profile({ weeklyRunDaysTarget: 4 })

  it.each([
    ['5K 10주', 5, '2027-01-04'],
    ['하프 12주', 21.1, '2027-01-18']
  ])('%s — 주 3회, 전부 Easy, 키세션·한계 시험·스트라이드·템포 없음', (_label, distanceKm, targetDate) => {
    const drafts = buildPeriodizedSchedule({
      goal: goal({ distanceKm, targetDate }),
      profile: beginner,
      today,
      currentWeeklyKm: 7.2,
      entryLevel: true
    })
    expect(drafts.length).toBeGreaterThan(0)
    expect(new Set(drafts.map((d) => d.sessionType))).toEqual(new Set(['Easy']))
    expect(drafts.some((d) => d.keySession)).toBe(false)
    expect(new Set(drafts.map((d) => d.phase))).toEqual(new Set(['Base']))
    const perWeek = new Map<string, number>()
    for (const d of drafts) {
      const monday = trainingWeekRange(new Date(`${d.date}T00:00:00`)).start
      perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1)
    }
    expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(3)
  })

  it('입문이 아니면 그대로 — 롱런·스트라이드가 있다(회귀 방지)', () => {
    const drafts = buildPeriodizedSchedule({
      goal: goal({ distanceKm: 5, targetDate: '2027-01-04' }),
      profile: beginner,
      today,
      currentWeeklyKm: 12
    })
    const types = new Set(drafts.map((d) => d.sessionType))
    expect(types.has('LSD') || types.has('Steady Long')).toBe(true)
    expect(types.has('Easy + Strides')).toBe(true)
  })
})

describe('planMatchesEntryLevel — 입문 여부와 플랜이 어긋나면 다시 짓는다 (#876)', () => {
  const t = (...types: Array<'Easy' | 'Recovery' | 'Tempo' | 'Easy + Strides' | 'LSD'>) => types.map((sessionType) => ({ sessionType }))

  it('입문인데 템포·스트라이드가 있으면 어긋남', () => {
    expect(planMatchesEntryLevel(t('Easy', 'Tempo', 'Easy'), true)).toBe(false)
    expect(planMatchesEntryLevel(t('Easy + Strides', 'Easy'), true)).toBe(false)
    expect(planMatchesEntryLevel(t('Easy', 'Easy', 'Recovery'), true)).toBe(true)
  })

  it('졸업했는데 앞으로 일정이 전부 걷기·뛰기면 어긋남 — 끝물(3개 미만)은 놔둔다', () => {
    expect(planMatchesEntryLevel(t('Easy', 'Easy', 'Easy'), false)).toBe(false)
    expect(planMatchesEntryLevel(t('Easy', 'Easy'), false)).toBe(true)
    expect(planMatchesEntryLevel(t('Easy', 'LSD', 'Easy + Strides'), false)).toBe(true)
  })
})

// #893: 단계는 대회일에서 거꾸로 짠 달력이다 — 다시 지어도 오늘이 기초기 1주차로 돌아가지 않는다.
describe('단계 달력 고정 — 다시 지어도 지금 단계가 이어진다 (#893)', () => {
  const tenK = goal({ distanceKm: 10, targetDate: '2026-12-27' })
  const base = { goal: tenK, profile: profile({ weeklyRunDaysTarget: 4 }), currentWeeklyKm: 20 }
  const phaseByDate = (drafts: ReturnType<typeof buildPeriodizedSchedule>) => new Map(drafts.map((d) => [d.date, d.phase]))

  it('같은 목표를 4주 뒤 다시 지어도 같은 날짜는 같은 단계다', () => {
    const first = phaseByDate(buildPeriodizedSchedule({ ...base, today: new Date('2026-10-05T09:00:00') }))
    const rebuilt = buildPeriodizedSchedule({ ...base, today: new Date('2026-11-02T09:00:00'), phaseStartDate: '2026-10-05' })
    expect(rebuilt.length).toBeGreaterThan(0)
    for (const d of rebuilt) if (first.has(d.date)) expect(d.phase).toBe(first.get(d.date))
  })

  it('달력 없이 다시 지으면 기초기부터 — 실계정 증상(남은 8주 → 기초 3주)', () => {
    const today = new Date('2026-11-02T09:00:00')
    expect(buildPeriodizedSchedule({ ...base, today })[0].phase).toBe('Base')
    expect(buildPeriodizedSchedule({ ...base, today, phaseStartDate: '2026-10-05' })[0].phase).toBe('Build')
  })

  it('주 중간에 다시 지어도 단계가 뒤로 가지 않고, 대회 주는 테이퍼다', () => {
    const order = ['Base', 'Build', 'Threshold', 'Race Specific', 'Taper']
    const first = buildPeriodizedSchedule({ ...base, today: new Date('2026-10-05T09:00:00') })
    const rebuilt = buildPeriodizedSchedule({ ...base, today: new Date('2026-11-04T09:00:00'), phaseStartDate: '2026-10-05' })
    const firstPhaseOn = (date: string) => first.filter((d) => d.date <= date).at(-1)?.phase ?? 'Base'
    // 다시 지은 첫 세션 단계는 원래 플랜의 그날 단계보다 앞이 아니다
    expect(order.indexOf(rebuilt[0].phase)).toBeGreaterThanOrEqual(order.indexOf(firstPhaseOn(rebuilt[0].date)))
    expect(rebuilt.at(-1)?.phase).toBe('Taper')
    expect(first.at(-1)?.phase).toBe('Taper')
  })

  it('달력 시작일이 오늘이거나 그 뒤면 오늘부터(첫 플랜과 같다)', () => {
    const today = new Date('2026-11-02T09:00:00')
    const plain = buildPeriodizedSchedule({ ...base, today })
    expect(buildPeriodizedSchedule({ ...base, today, phaseStartDate: '2026-11-02' })).toEqual(plain)
    expect(buildPeriodizedSchedule({ ...base, today, phaseStartDate: '2026-11-20' })).toEqual(plain)
  })
})

// #893: 주 3회 × 3km 에 못 미치는 주는 롱런·템포·한계 시험 없이 이지 — 주 5km 에 "LSD 1.8km"·초소형 템포가 나왔다.
describe('저볼륨 주 구성 — 품질·롱런 없이 이지 (#893)', () => {
  const today = new Date('2026-10-16T09:00:00')
  const tenK = goal({ targetDate: '2026-11-30', distanceKm: 10 })
  const weekOf = (date: string) => Math.floor((new Date(`${date}T00:00:00`).getTime() - new Date('2026-10-16T00:00:00').getTime()) / 86400000 / 7)
  const NOT_IN_LOW_WEEK = new Set(['LSD', 'Steady Long', 'Tempo', 'Race'])

  it('주 9km 미만인 주엔 LSD·Steady Long·Tempo·Race 가 없고 스트라이드 1회가 있다 — 단계 이름은 그대로', () => {
    const drafts = buildPeriodizedSchedule({ goal: tenK, profile: profile({ weeklyRunDaysTarget: 4 }), today, currentWeeklyKm: 5 })
    const weeks = new Map<number, typeof drafts>()
    for (const d of drafts) weeks.set(weekOf(d.date), [...(weeks.get(weekOf(d.date)) ?? []), d])
    let lowWeeks = 0
    for (const week of weeks.values()) {
      const km = week.reduce((sum, d) => sum + (d.prescription.distanceKm ?? 0), 0)
      if (km >= 8.9 || week.length < 3) continue
      lowWeeks++
      expect(week.filter((d) => NOT_IN_LOW_WEEK.has(d.sessionType))).toEqual([])
      expect(week.filter((d) => d.sessionType === 'Easy + Strides')).toHaveLength(1)
      expect(week.some((d) => d.keySession)).toBe(false)
    }
    expect(lowWeeks).toBeGreaterThan(0)
    // 볼륨이 9km 를 넘는 주부턴 원래 구성(롱런)이 돌아온다
    expect(drafts.some((d) => d.sessionType === 'LSD' || d.sessionType === 'Steady Long')).toBe(true)
  })

  it('저볼륨 플랜은 입문 플랜으로 읽히지 않는다 — 부팅마다 다시 짓지 않게', () => {
    const shortGoal = goal({ targetDate: '2026-11-08', distanceKm: 5 })
    const drafts = buildPeriodizedSchedule({ goal: shortGoal, profile: profile({ weeklyRunDaysTarget: 3 }), today, currentWeeklyKm: 4 })
    expect(drafts.length).toBeGreaterThanOrEqual(3)
    expect(drafts.some((d) => NOT_IN_LOW_WEEK.has(d.sessionType))).toBe(false)
    expect(planMatchesEntryLevel(drafts, false)).toBe(true)
  })
})

// #893: 주행량을 먼저 쌓는 주는 단계 이름은 두되, 포커스는 그 주 세션대로 — "역치 자극 집중"인데 템포가 없지 않게.
describe('buildWeekSummary — 주행량 먼저 쌓는 주 (#893)', () => {
  const today = new Date('2026-10-28T09:00:00')
  const rx = (distanceKm: number) => ({ ...defaultScheduledSessionPrescription(), distanceKm })
  const easyWeek = (phase: 'Threshold' | 'Taper') =>
    ['2026-10-28', '2026-10-30', '2026-11-01'].map((date, i) =>
      session({ date, phase, sessionType: i === 0 ? 'Easy + Strides' : 'Easy', prescription: rx(2) })
    )

  it('핵심 세션 없이 9km 미만이면 단계 이름은 그대로, 포커스는 주행량 쌓기', () => {
    const summary = buildWeekSummary(easyWeek('Threshold'), today, '2026-12-01', 'performance')
    expect(summary!.phaseLabel).toBe(buildWeekSummary([session({ date: '2026-10-28', phase: 'Threshold', keySession: true, sessionType: 'Tempo' })], today, '2026-12-01', 'performance')!.phaseLabel)
    expect(summary!.focusLine).toBe('이지런으로 주행량 쌓기')
  })

  it('핵심 세션이 있거나 테이퍼면 원래 단계 포커스', () => {
    const withTempo = [...easyWeek('Threshold'), session({ date: '2026-10-29', phase: 'Threshold', sessionType: 'Tempo', keySession: true, prescription: rx(2) })]
    expect(buildWeekSummary(withTempo, today, '2026-12-01', 'performance')!.focusLine).not.toBe('이지런으로 주행량 쌓기')
    expect(buildWeekSummary(easyWeek('Taper'), today, '2026-12-01', 'performance')!.focusLine).not.toBe('이지런으로 주행량 쌓기')
  })
})

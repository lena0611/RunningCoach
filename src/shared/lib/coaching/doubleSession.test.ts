import { describe, expect, it } from 'vitest'
import type { RunLog, RunType } from '@/entities/run/model'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import {
  createBlankTrainingMemory,
  type TrainingInjuryItem,
  type TrainingMemory
} from '@/entities/training-memory/model'
import {
  buildDoubleSuggestion,
  buildPmEasyDraft,
  classifyDoubleGap,
  evaluateDoubleEligibility,
  forcePmEasyType,
  type BuildDoubleSuggestionInput
} from '@/shared/lib/coaching/doubleSession'

// ── fixtures ──────────────────────────────────────────────────────────────────
function isoDay(today: Date, agoDays: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() - agoDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 최근 4주에 걸쳐 주 weeklyKm 가 되도록 런을 만든다(gate1 28일 롤링 평균). */
function runsForWeeklyKm(weeklyKm: number, today: Date): RunLog[] {
  const per = weeklyKm // 4개 런 × 4주 합 / 4 = weeklyKm
  return [0, 7, 14, 21].map((ago, i) => ({ id: `r${i}`, date: isoDay(today, ago), distanceKm: per }) as unknown as RunLog)
}

function buildMemory(opts: { expMonths?: number | null; injuries?: TrainingInjuryItem[] } = {}): TrainingMemory {
  const m = createBlankTrainingMemory()
  m.athleteProfile.runningExperienceMonths = opts.expMonths === undefined ? 36 : opts.expMonths
  if (opts.injuries) {
    m.injuryItems = opts.injuries
    m.activeInjuryItemId = null
  }
  return m
}

const activeInjury = { id: 'inj1', area: '무릎', status: 'active', severity: 3 } as unknown as TrainingInjuryItem

function session(o: Partial<ScheduledSession> & { date: string }): ScheduledSession {
  const type: RunType = o.sessionType ?? 'Easy'
  return {
    id: o.id ?? Math.random().toString(36).slice(2),
    userId: 'u1',
    goalId: 'g1',
    date: o.date,
    phase: 'Base',
    sessionType: type,
    slot: o.slot ?? null,
    keySession: o.keySession ?? false,
    prescription: { distanceKm: null, durationMin: 25, paceRange: '', note: '' },
    status: o.status ?? 'planned',
    source: 'generator',
    runId: o.runId ?? null,
    createdAt: '',
    updatedAt: ''
  }
}

// ── evaluateDoubleEligibility ───────────────────────────────────────────────────
describe('evaluateDoubleEligibility', () => {
  const today = new Date('2026-06-20T00:00:00')
  const eligibleRuns = runsForWeeklyKm(80, today)

  it('경력·볼륨·무부상·quality 적응 모두 충족하면 eligible', () => {
    const result = evaluateDoubleEligibility({ memory: buildMemory(), runs: eligibleRuns, qualityAdaptation: 'ready', today })
    expect(result.eligible).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it('경력 2년 미만이면 차단', () => {
    const result = evaluateDoubleEligibility({ memory: buildMemory({ expMonths: 12 }), runs: eligibleRuns, qualityAdaptation: 'ready', today })
    expect(result.eligible).toBe(false)
    expect(result.criteria.find((c) => c.key === 'experience')!.met).toBe(false)
    expect(result.blockers.length).toBeGreaterThan(0)
  })

  it('경력 24개월(2년)은 차단, 36개월(3년)부터 허용 — SSOT "수년간"(처음 2년은 단일-only)', () => {
    expect(evaluateDoubleEligibility({ memory: buildMemory({ expMonths: 24 }), runs: eligibleRuns, qualityAdaptation: 'ready', today }).eligible).toBe(false)
    expect(evaluateDoubleEligibility({ memory: buildMemory({ expMonths: 36 }), runs: eligibleRuns, qualityAdaptation: 'ready', today }).eligible).toBe(true)
  })

  it('경력 미입력이면 보수적으로 차단', () => {
    const result = evaluateDoubleEligibility({ memory: buildMemory({ expMonths: null }), runs: eligibleRuns, qualityAdaptation: 'ready', today })
    expect(result.eligible).toBe(false)
    expect(result.criteria.find((c) => c.key === 'experience')!.met).toBe(false)
  })

  it('주간 볼륨 80km 미만이면 차단', () => {
    const result = evaluateDoubleEligibility({ memory: buildMemory(), runs: runsForWeeklyKm(40, today), qualityAdaptation: 'ready', today })
    expect(result.eligible).toBe(false)
    expect(result.criteria.find((c) => c.key === 'volume')!.met).toBe(false)
  })

  it('활성 부상이 있으면 차단(회복 우선)', () => {
    const result = evaluateDoubleEligibility({ memory: buildMemory({ injuries: [activeInjury] }), runs: eligibleRuns, qualityAdaptation: 'ready', today })
    expect(result.eligible).toBe(false)
    expect(result.criteria.find((c) => c.key === 'injury')!.met).toBe(false)
  })

  it('quality 세션이 blocked면 차단, watch/n/a는 통과(강한 게이트에 위임)', () => {
    expect(evaluateDoubleEligibility({ memory: buildMemory(), runs: eligibleRuns, qualityAdaptation: 'blocked', today }).eligible).toBe(false)
    expect(evaluateDoubleEligibility({ memory: buildMemory(), runs: eligibleRuns, qualityAdaptation: 'watch', today }).eligible).toBe(true)
    expect(evaluateDoubleEligibility({ memory: buildMemory(), runs: eligibleRuns, qualityAdaptation: 'n/a', today }).eligible).toBe(true)
  })
})

// ── PM 이지 강제 ─────────────────────────────────────────────────────────────────
describe('forcePmEasyType', () => {
  it('quality(Tempo/LSD/Steady Long/Race)는 이지로 강제', () => {
    expect(forcePmEasyType('Tempo')).toBe('Easy')
    expect(forcePmEasyType('LSD')).toBe('Easy')
    expect(forcePmEasyType('Steady Long')).toBe('Easy')
    expect(forcePmEasyType('Race')).toBe('Easy')
  })
  it('이지/회복 계열은 보존', () => {
    expect(forcePmEasyType('Easy')).toBe('Easy')
    expect(forcePmEasyType('Recovery')).toBe('Recovery')
    expect(forcePmEasyType('Easy + Strides')).toBe('Easy + Strides')
  })
})

describe('buildPmEasyDraft', () => {
  it('항상 PM·비키세션·수동 소스·시간 기반(거리 없음)', () => {
    const draft = buildPmEasyDraft({ goalId: 'g1', date: '2026-06-20', phase: 'Build' })
    expect(draft.slot).toBe('PM')
    expect(draft.keySession).toBe(false)
    expect(draft.source).toBe('manual')
    expect(draft.sessionType).toBe('Easy')
    expect(draft.prescription.distanceKm).toBeNull()
    expect(draft.prescription.durationMin).toBe(25)
  })
  it('quality 요청은 이지로 강제, 시간·페이스대 오버라이드 반영', () => {
    const draft = buildPmEasyDraft({ goalId: null, date: '2026-06-20', phase: 'Build', desiredType: 'Tempo', durationMin: 30, paceRange: '6:00~6:30' })
    expect(draft.sessionType).toBe('Easy')
    expect(draft.prescription.durationMin).toBe(30)
    expect(draft.prescription.paceRange).toBe('6:00~6:30')
  })
  it('Recovery 요청은 보존', () => {
    expect(buildPmEasyDraft({ goalId: null, date: '2026-06-20', phase: 'Base', desiredType: 'Recovery' }).sessionType).toBe('Recovery')
  })
})

describe('classifyDoubleGap', () => {
  it('5h 미만은 차단, 5~7h 빠듯, 7h 이상 양호', () => {
    expect(classifyDoubleGap(4)).toBe('blocked')
    expect(classifyDoubleGap(4.9)).toBe('blocked')
    expect(classifyDoubleGap(5)).toBe('tight')
    expect(classifyDoubleGap(6.5)).toBe('tight')
    expect(classifyDoubleGap(7)).toBe('ok')
    expect(classifyDoubleGap(9)).toBe('ok')
  })
})

// ── buildDoubleSuggestion ───────────────────────────────────────────────────────
describe('buildDoubleSuggestion', () => {
  const sat = new Date('2026-06-20T00:00:00') // 토요일 — 이번 주(월6/15~일6/21) 남은 2일
  const eligibleRuns = runsForWeeklyKm(80, sat) // ACWR 1.0(주 80km 균등) — 적격 볼륨·부하 안전
  // 적격 볼륨(주 80km)인데 최근 7일에 부하가 몰려 ACWR>1.5(140/80=1.75)인 런 — 더블 보류 대상.
  const acwrSpikeRuns = [
    { id: 'a0', date: isoDay(sat, 0), distanceKm: 70 },
    { id: 'a1', date: isoDay(sat, 3), distanceKm: 70 },
    { id: 'c0', date: isoDay(sat, 9), distanceKm: 60 },
    { id: 'c1', date: isoDay(sat, 16), distanceKm: 60 },
    { id: 'c2', date: isoDay(sat, 23), distanceKm: 60 }
  ] as unknown as RunLog[]

  function input(over: Partial<BuildDoubleSuggestionInput> = {}): BuildDoubleSuggestionInput {
    return {
      sessions: [
        session({ id: 'back', date: '2026-06-15', sessionType: 'Easy', status: 'missed' }),
        session({ id: 'am', date: '2026-06-20', sessionType: 'Tempo', keySession: true, status: 'planned' })
      ],
      memory: buildMemory(),
      runs: eligibleRuns,
      qualityAdaptation: 'ready',
      chronicSpike: false,
      today: sat,
      ...over
    }
  }

  it('적격·이지 백로그·붙일 AM 세션이 있으면 제안', () => {
    const s = buildDoubleSuggestion(input())
    expect(s).not.toBeNull()
    expect(s!.amSession.id).toBe('am')
    expect(s!.backlogSession.id).toBe('back')
    expect(s!.amDayLabel).toBe('오늘 Tempo')
    expect(s!.backlogLabel).toBe('월요일 Easy')
  })

  it('적격 미달이면 제안 안 함', () => {
    expect(buildDoubleSuggestion(input({ memory: buildMemory({ expMonths: 12 }) }))).toBeNull()
  })

  it('급성 과부하(spike)면 제안 안 함', () => {
    expect(buildDoubleSuggestion(input({ chronicSpike: true }))).toBeNull()
  })

  it('급성 부하 ACWR > 1.5 면 제안 안 함(더블은 부하 압축 — SSOT §부상 연계)', () => {
    expect(buildDoubleSuggestion(input({ runs: acwrSpikeRuns }))).toBeNull()
  })

  it('백로그가 남은 날을 넘으면(트리아지 오버플로) 제안 안 함', () => {
    const overflow = [
      session({ id: 'b1', date: '2026-06-15', sessionType: 'Easy', status: 'missed' }),
      session({ id: 'b2', date: '2026-06-16', sessionType: 'Easy', status: 'missed' }),
      session({ id: 'b3', date: '2026-06-17', sessionType: 'Easy', status: 'missed' }),
      session({ id: 'am', date: '2026-06-20', sessionType: 'Tempo', keySession: true, status: 'planned' })
    ]
    expect(buildDoubleSuggestion(input({ sessions: overflow }))).toBeNull()
  })

  it('quality 백로그만 있으면 제안 안 함(같은 날 2 quality 금지 — 재배치)', () => {
    const qualityBacklog = [
      session({ id: 'back', date: '2026-06-15', sessionType: 'LSD', keySession: true, status: 'missed' }),
      session({ id: 'am', date: '2026-06-20', sessionType: 'Tempo', keySession: true, status: 'planned' })
    ]
    expect(buildDoubleSuggestion(input({ sessions: qualityBacklog }))).toBeNull()
  })

  it('붙일 AM 세션(오늘/미래 활성)이 없으면 제안 안 함', () => {
    expect(buildDoubleSuggestion(input({ sessions: [session({ id: 'back', date: '2026-06-15', sessionType: 'Easy', status: 'missed' })] }))).toBeNull()
  })

  it('주 막판이 아니면(남은 날 >2) 제안 안 함', () => {
    const wed = new Date('2026-06-17T00:00:00') // 수요일 — 남은 날 5일
    expect(buildDoubleSuggestion(input({ today: wed, runs: runsForWeeklyKm(80, wed) }))).toBeNull()
  })
})

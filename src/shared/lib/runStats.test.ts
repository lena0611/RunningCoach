import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import { getRecentInjuryHistory, isFullMarathonGoal, normalizeTrainingMemory } from '@/entities/training-memory/model'
import type { TrainingGoal } from '@/entities/training-memory/model'
import { getAgeLoadWeight, getCadenceTrend, getChronicLoadTrend, getLongestRunKmWithinDays, getNextSessionRecommendation } from './runStats'

const today = new Date('2026-06-02T00:00:00')
const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const todayDayName = dayNames[today.getDay()]
const longRunDay = todayDayName === '토요일' ? '일요일' : '토요일'

function buildMemory(injury?: Partial<TrainingInjuryItem>, birthYear: number | null = null): TrainingMemory {
  return normalizeTrainingMemory({
    weeklyPattern: [`${todayDayName}: Tempo`],
    athleteProfile: { preferredLongRunDay: longRunDay, birthYear } as TrainingMemory['athleteProfile'],
    injuryItems: injury ? [{ title: '테스트 부상', status: 'active', normalizedAreas: [], ...injury } as TrainingInjuryItem] : []
  })
}

// 부분 픽스처를 TrainingInjuryItem으로 — Partial 스프레드라야 tsc가 통과(normalizeTrainingMemory가 나머지 필드 보강).
function injuryFixture(partial: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return { title: '테스트 부상', status: 'active', normalizedAreas: [], ...partial } as TrainingInjuryItem
}

function run(date: string, distanceKm: number): RunLog {
  return {
    id: `run-${date}-${distanceKm}`, userId: 'u', externalId: null, sessionTitle: '', date,
    startAt: null, endAt: null, type: 'Easy', distanceKm, durationSec: 1800, avgPaceSec: null,
    avgHeartRate: null, maxHeartRate: null, cadence: null, activeEnergyKcal: null, temperature: null,
    humidity: null, windMps: null, elevationGainM: null, elevationLossM: null, courseType: 'Unknown',
    rpe: null, workoutFeeling: '', painNote: '', sleepQuality: null, conditionScore: null,
    stressLevel: null, companion: '', memo: '', laps: [], fastSegments: [], metricSamples: [],
    routePoints: [], tags: [], source: 'manual', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`
  }
}

// today 기준: 최근 30일(05-04~06-02), 이전 30일(04-04~05-03)
function daysAgo(n: number): string {
  const d = new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

const runs: RunLog[] = []

describe('getLongestRunKmWithinDays (#473 복귀 램프 입력)', () => {
  it('직전 N일 최장 런 거리', () => {
    expect(getLongestRunKmWithinDays([run(daysAgo(2), 8), run(daysAgo(10), 12), run(daysAgo(20), 5)], 30, today)).toBe(12)
  })
  it('윈도 밖 런은 제외', () => {
    // 45일 전 20km(밖) + 5일 전 6km(안) → 6
    expect(getLongestRunKmWithinDays([run(daysAgo(45), 20), run(daysAgo(5), 6)], 30, today)).toBe(6)
  })
  it('런 없으면 0(긴 완전 휴식)', () => {
    expect(getLongestRunKmWithinDays([], 30, today)).toBe(0)
    expect(getLongestRunKmWithinDays([run(daysAgo(45), 20)], 30, today)).toBe(0)
  })
})

describe('getNextSessionRecommendation injury gate', () => {
  it('keeps the quality session when there is no injury', () => {
    const rec = getNextSessionRecommendation(buildMemory(), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })

  it('keeps the recommendation for severity 0-1', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 1 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })

  it('adds a checkpoint note but keeps the session for severity 2', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 2 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(true)
    expect(rec.injuryNote).toContain('체크포인트')
  })

  it('downgrades a quality session to Easy/Recovery for severity 3', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 3 }), runs, today)
    expect(rec.title).toBe('Easy 또는 Recovery')
    expect(rec.injuryAdjusted).toBe(true)
  })

  it('prioritizes recovery or rest for severity 4-5', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 5 }), runs, today)
    expect(rec.title).toBe('Recovery 또는 휴식')
    expect(rec.injuryAdjusted).toBe(true)
    expect(rec.injuryNote).toContain('휴식')
  })

  it('does not gate when the injury is resolved', () => {
    const rec = getNextSessionRecommendation(buildMemory({ status: 'resolved', severity: 5 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })
})

describe('getAgeLoadWeight', () => {
  it('returns 0 for missing or under-40, scales by decade', () => {
    expect(getAgeLoadWeight(null, today)).toBe(0)
    expect(getAgeLoadWeight(1996, today)).toBe(0) // 30세
    expect(getAgeLoadWeight(1982, today)).toBe(1) // 44세
    expect(getAgeLoadWeight(1972, today)).toBe(2) // 54세
    expect(getAgeLoadWeight(1960, today)).toBe(3) // 66세
    expect(getAgeLoadWeight(1800, today)).toBe(0) // 비현실 값은 0
  })
})

describe('getChronicLoadTrend', () => {
  it('is unknown when the previous 30-day baseline is too small', () => {
    const trend = getChronicLoadTrend([run(daysAgo(5), 12)], today, 0)
    expect(trend.status).toBe('unknown')
    expect(trend.increasePct).toBeNull()
  })

  it('flags spike when recent 30d is 50%+ over previous 30d', () => {
    const recent = [run(daysAgo(3), 30), run(daysAgo(10), 30)] // 60km
    const previous = [run(daysAgo(40), 20), run(daysAgo(50), 20)] // 40km
    const trend = getChronicLoadTrend([...recent, ...previous], today, 0)
    expect(trend.increasePct).toBe(50)
    expect(trend.status).toBe('spike')
  })

  it('lowers the threshold for older runners', () => {
    const recent = [run(daysAgo(3), 28), run(daysAgo(10), 28)] // 56km
    const previous = [run(daysAgo(40), 20), run(daysAgo(50), 20)] // 40km → +40%
    const young = getChronicLoadTrend([...recent, ...previous], today, 0)
    const senior = getChronicLoadTrend([...recent, ...previous], today, 3)
    expect(young.status).toBe('rising') // +40%는 젊은층 spike(50%) 미만
    expect(senior.status).toBe('spike') // 60+ 임계 35%면 spike
  })
})

describe('getNextSessionRecommendation chronic load', () => {
  it('adds a load caution note on chronic spike without forcing downgrade', () => {
    const loaded = [run(daysAgo(3), 30), run(daysAgo(10), 30), run(daysAgo(40), 20), run(daysAgo(50), 20)]
    const rec = getNextSessionRecommendation(buildMemory(), loaded, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.loadCaution).toBe(true)
    expect(rec.loadNote).toContain('30일')
  })

  it('has no load caution when load is stable', () => {
    const stable = [run(daysAgo(3), 20), run(daysAgo(40), 20)]
    const rec = getNextSessionRecommendation(buildMemory(), stable, today)
    expect(rec.loadCaution).toBe(false)
  })
})

describe('getRecentInjuryHistory (3.1 전역 재부상 위험창)', () => {
  it('12개월 이내 resolved 부상도 hasRecentInjury로 잡는다(부위 무관)', () => {
    const memory = normalizeTrainingMemory({
      injuryItems: [
        injuryFixture({ title: 'PF', status: 'resolved', area: '오른발', onsetDate: daysAgo(120), resolvedAt: daysAgo(90) })
      ]
    })
    const history = getRecentInjuryHistory(memory, today)
    expect(history.hasRecentInjury).toBe(true)
    expect(history.mostRecentDaysAgo).toBe(90)
    expect(history.areas).toContain('오른발')
  })

  it('12개월을 넘은 resolved 부상은 제외', () => {
    const memory = normalizeTrainingMemory({
      injuryItems: [
        injuryFixture({ title: 'old', status: 'resolved', onsetDate: daysAgo(500), resolvedAt: daysAgo(450) })
      ]
    })
    expect(getRecentInjuryHistory(memory, today).hasRecentInjury).toBe(false)
  })

  it('활성 부상은 날짜와 무관하게 항상 포함(daysAgo 0)', () => {
    const memory = normalizeTrainingMemory({
      injuryItems: [injuryFixture({ title: 'x', status: 'active' })]
    })
    const history = getRecentInjuryHistory(memory, today)
    expect(history.hasRecentInjury).toBe(true)
    expect(history.mostRecentDaysAgo).toBe(0)
  })
})

describe('isFullMarathonGoal (3.2 풀마라톤만, 하프 제외)', () => {
  const goal = (category: TrainingGoal['category'], distanceKm: number | null): TrainingGoal =>
    ({ category, distanceKm } as TrainingGoal)
  it('풀마라톤 race 목표는 true', () => expect(isFullMarathonGoal(goal('race', 42.195))).toBe(true))
  it('하프마라톤은 false(근거상 비유의)', () => expect(isFullMarathonGoal(goal('race', 21.1))).toBe(false))
  it('레이스가 아닌 목표는 false', () => expect(isFullMarathonGoal(goal('fitness', 42.195))).toBe(false))
  it('거리 미입력은 false', () => expect(isFullMarathonGoal(goal('race', null))).toBe(false))
})

describe('getNextSessionRecommendation 이전부상 보수화(3.1/3.3)', () => {
  function buildResolvedInjuryMemory(): TrainingMemory {
    return normalizeTrainingMemory({
      weeklyPattern: [`${todayDayName}: Tempo`],
      athleteProfile: { preferredLongRunDay: longRunDay } as TrainingMemory['athleteProfile'],
      injuryItems: [
        injuryFixture({ title: 'PF', status: 'resolved', area: '오른발', onsetDate: daysAgo(120), resolvedAt: daysAgo(90) })
      ]
    })
  }

  it('통증 없고 부하가 안정이어도 12개월 내 부상 이력이면 보수화 카우션을 단다(저볼륨≠안전)', () => {
    const rec = getNextSessionRecommendation(buildResolvedInjuryMemory(), [run(daysAgo(3), 6)], today)
    expect(rec.loadCaution).toBe(true)
    expect(rec.loadNote).toContain('다른 부위')
    expect(rec.injuryAdjusted).toBe(false) // resolved라 통증 게이트는 작동하지 않음
    expect(rec.title).toBe('Tempo') // 세션 자체는 강등하지 않음
  })

  it('부상 이력이 없으면 안정 부하에서 보수화 카우션 없음', () => {
    const memory = normalizeTrainingMemory({
      weeklyPattern: [`${todayDayName}: Tempo`],
      athleteProfile: { preferredLongRunDay: longRunDay } as TrainingMemory['athleteProfile'],
      injuryItems: []
    })
    const rec = getNextSessionRecommendation(memory, [run(daysAgo(3), 6)], today)
    expect(rec.loadCaution).toBe(false)
  })
})

// cadence를 실은 런(run() 기본은 cadence null) — sanitizeCadence 범위(120~230) 안 값으로.
function runCad(date: string, cadence: number | null): RunLog {
  return { ...run(date, 6), id: `cad-${date}-${cadence}`, cadence }
}

describe('getCadenceTrend (§2-A 보조 신호 — 오버스트라이드)', () => {
  it('케이던스 데이터가 없으면 unknown(보수적, 없는 신호를 켜지 않음)', () => {
    const trend = getCadenceTrend([run(daysAgo(3), 6), run(daysAgo(10), 8)], today)
    expect(trend.status).toBe('unknown')
    expect(trend.recentAvgSpm).toBeNull()
  })

  it('최근 평균이 ≤170spm면 low(낮은 케이던스)', () => {
    const trend = getCadenceTrend([runCad(daysAgo(3), 166), runCad(daysAgo(10), 168)], today)
    expect(trend.status).toBe('low')
    expect(trend.recentAvgSpm).toBe(167)
  })

  it('최근 평균이 높아도 직전 30일 대비 뚜렷이 떨어지면 dropping', () => {
    const trend = getCadenceTrend([runCad(daysAgo(3), 178), runCad(daysAgo(40), 190)], today)
    expect(trend.status).toBe('dropping')
    expect(trend.changePct).toBeLessThanOrEqual(-3)
  })

  it('충분히 높고 안정적이면 stable', () => {
    const trend = getCadenceTrend([runCad(daysAgo(3), 182), runCad(daysAgo(40), 183)], today)
    expect(trend.status).toBe('stable')
  })

  it('이상치(자릿수 다른 per-lap 같은 값)는 sanitizeCadence가 제외 → 유효 케이던스 없으면 unknown', () => {
    const trend = getCadenceTrend([runCad(daysAgo(3), 1500), runCad(daysAgo(10), 12)], today)
    expect(trend.status).toBe('unknown')
  })
})

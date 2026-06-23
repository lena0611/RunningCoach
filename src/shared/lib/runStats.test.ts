import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import { normalizeTrainingMemory } from '@/entities/training-memory/model'
import { getAgeLoadWeight, getChronicLoadTrend, getLongestRunKmWithinDays, getNextSessionRecommendation } from './runStats'

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

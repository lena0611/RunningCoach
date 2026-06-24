import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem, TrainingMemory } from './model'
import { normalizeTrainingMemory } from './model'
import type { InjuryDataSignals } from './injuryKnowledge'
import { buildInjuryCoachSignals, buildInjuryDataSignals } from './injurySignals'

const today = new Date('2026-06-02T00:00:00')

function daysAgo(n: number): string {
  const d = new Date(today.getTime() - n * 24 * 60 * 60 * 1000)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
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

function buildMemory(injury?: Partial<TrainingInjuryItem>): TrainingMemory {
  return normalizeTrainingMemory({
    weeklyPattern: ['월요일: Easy'],
    athleteProfile: {} as TrainingMemory['athleteProfile'],
    injuryItems: injury ? [{ title: '테스트 부상', status: 'active', ...injury } as TrainingInjuryItem] : []
  })
}

const ALLOWED_SIGNALS = new Set<keyof InjuryDataSignals>([
  'acwrSpike', 'chronicRising', 'highWeeklyVolume', 'weeklyIncreaseHigh', 'cadenceLow', 'groundUphill', 'groundDownhill', 'paceSpike', 'recurrence'
])

describe('buildInjuryDataSignals (§2-A 결정론 신호)', () => {
  it('주간 급증(직전 7일 대비 ≥15%)이면 weeklyIncreaseHigh', () => {
    // 최근 7일 30km, 직전 7일(8~14일 전) 20km → +50%.
    const runs = [run(daysAgo(2), 15), run(daysAgo(4), 15), run(daysAgo(10), 12), run(daysAgo(12), 8)]
    const signals = buildInjuryDataSignals(buildMemory(), runs, null, today)
    expect(signals.weeklyIncreaseHigh).toBe(true)
  })

  it('절대 고볼륨(최근 7일 ≥41km)이면 highWeeklyVolume', () => {
    const runs = [run(daysAgo(1), 22), run(daysAgo(3), 20)]
    const signals = buildInjuryDataSignals(buildMemory(), runs, null, today)
    expect(signals.highWeeklyVolume).toBe(true)
  })

  it('저볼륨·안정이면 부하 신호가 켜지지 않는다', () => {
    const runs = [run(daysAgo(3), 5), run(daysAgo(20), 5)]
    const signals = buildInjuryDataSignals(buildMemory(), runs, null, today)
    expect(signals.weeklyIncreaseHigh).toBeUndefined()
    expect(signals.highWeeklyVolume).toBeUndefined()
    expect(signals.acwrSpike).toBeUndefined()
  })

  it('같은 부위 다른 에피소드가 있으면 recurrence', () => {
    const memory = normalizeTrainingMemory({
      weeklyPattern: ['월요일: Easy'],
      athleteProfile: {} as TrainingMemory['athleteProfile'],
      injuryItems: [
        { title: '현재 무릎', status: 'active', normalizedAreas: [{ areaId: 'left-knee', painLevel: 3 }] } as TrainingInjuryItem,
        { title: '과거 무릎', status: 'resolved', normalizedAreas: [{ areaId: 'left-knee', painLevel: null }] } as TrainingInjuryItem
      ]
    })
    const active = memory.injuryItems.find((i) => i.status === 'active') ?? null
    const signals = buildInjuryDataSignals(memory, [], active, today)
    expect(signals.recurrence).toBe(true)
  })

  it('do-not 가드 — 허용 신호 키만 산출(성별·BMI·strike·생체역학 없음)', () => {
    const runs = [run(daysAgo(2), 15), run(daysAgo(4), 15), run(daysAgo(10), 8)]
    const signals = buildInjuryDataSignals(buildMemory(), runs, null, today)
    for (const key of Object.keys(signals)) {
      expect(ALLOWED_SIGNALS.has(key as keyof InjuryDataSignals)).toBe(true)
    }
  })
})

describe('buildInjuryCoachSignals (§5 coach-run 주입 묶음)', () => {
  it('활성 부상이 없으면 null', () => {
    expect(buildInjuryCoachSignals(buildMemory(), [], today)).toBeNull()
  })

  it('활성 부상(IT밴드)이면 상위 가설(ITBS)과 레버를 "가능성"으로 반환', () => {
    const memory = buildMemory({ title: 'IT밴드', normalizedAreas: [{ areaId: 'left-it-band', painLevel: 3 }] })
    const result = buildInjuryCoachSignals(memory, [run(daysAgo(2), 10)], today)
    expect(result).not.toBeNull()
    expect(result!.hypotheses[0].possibility).toBe('ITBS(장경인대 증후군)')
    expect(result!.hypotheses[0].levers).toContain('볼륨 동결')
    expect(result!.hypotheses.length).toBeLessThanOrEqual(2)
  })

  function checkIn(dayAgo: number, opts: { worsened?: boolean; dailyPain?: boolean }) {
    return {
      id: `ci-${dayAgo}`, checkedAt: `${daysAgo(dayAgo)}T09:00:00.000Z`, painLevel: 4,
      areaPainLevels: [{ areaId: 'left-shin', painLevel: 4 }],
      worsenedDuringOrAfterRun: opts.worsened ?? false, dailyActivityPain: opts.dailyPain ?? false,
      readyForQualitySession: false, note: '', source: 'user_check_in' as const
    }
  }

  it('단발 체크인(지난 1회 악화) + 체중부하 통증은 피로골절 경계로 격상하지 않는다(과의뢰 방지)', () => {
    const memory = buildMemory({
      title: '정강이', normalizedAreas: [{ areaId: 'left-shin', painLevel: 4 }],
      checkInHistory: [checkIn(1, { worsened: true, dailyPain: true })]
    } as Partial<TrainingInjuryItem>)
    const result = buildInjuryCoachSignals(memory, [run(daysAgo(2), 6)], today)
    expect(result).not.toBeNull()
    // 체중부하 통증 자체는 redFlag(§4)지만, 단발 러닝 악화로 "피로골절 경계 조합"을 켜지는 않는다.
    expect(result!.redFlag.reasons.join(' ')).not.toContain('피로골절')
  })

  it('최근 2회 연속 체크인이 모두 악화 + 체중부하 통증이면 진행성으로 보고 피로골절 경계 발동', () => {
    const memory = buildMemory({
      title: '정강이', normalizedAreas: [{ areaId: 'left-shin', painLevel: 4 }],
      checkInHistory: [checkIn(1, { worsened: true, dailyPain: true }), checkIn(5, { worsened: true })]
    } as Partial<TrainingInjuryItem>)
    const result = buildInjuryCoachSignals(memory, [run(daysAgo(2), 6)], today)
    expect(result).not.toBeNull()
    expect(result!.redFlag.tripped).toBe(true)
    expect(result!.redFlag.reasons.join(' ')).toContain('피로골절')
  })

  it('스코프 밖 부위(ankle)이고 redFlag도 없으면 null(보낼 게 없음)', () => {
    const memory = buildMemory({ title: '발목', normalizedAreas: [{ areaId: 'left-ankle', painLevel: 2 }] })
    expect(buildInjuryCoachSignals(memory, [run(daysAgo(2), 6)], today)).toBeNull()
  })
})

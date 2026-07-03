import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { computeAchievements } from '@/shared/lib/achievement/achievements'
import { buildTrophyCatalog, computeLifetimeDistanceKm, type TrophyCardItem } from './trophyCatalog'
import { reconcileTrophySeen } from './trophySeen'

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-01-01', startAt: null, endAt: null,
    type: 'Easy', durationSec: 3600, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function byId(cards: TrophyCardItem[], id: string): TrophyCardItem {
  const card = cards.find((c) => c.id === id)
  if (!card) throw new Error(`card not found: ${id}`)
  return card
}

function catalogFor(runs: RunLog[], context: 'training' | 'race' = 'training') {
  return buildTrophyCatalog(computeAchievements(runs), runs, context)
}

describe('buildTrophyCatalog', () => {
  it('카탈로그는 14장 고정 — 골드 8(PB4+마일스톤4)·실버 3·브론즈 3, 결정적 순서', () => {
    const cards = catalogFor([makeRun({ id: 'a', distanceKm: 12, date: '2026-06-01' })])
    expect(cards).toHaveLength(14)
    expect(cards.map((c) => c.tier)).toEqual([
      'gold', 'gold', 'gold', 'gold', 'gold', 'gold', 'gold', 'gold',
      'silver', 'silver', 'silver', 'bronze', 'bronze', 'bronze'
    ])
  })

  it('12km 훈련 런: 5K/10K PB·마일스톤 획득, 하프/풀 미획득에 최장거리 진행', () => {
    const cards = catalogFor([makeRun({ id: 'a', distanceKm: 12, date: '2026-06-01', durationSec: 4320 })])
    expect(byId(cards, 'pb-5000-training').earned).toBe(true)
    expect(byId(cards, 'pb-10000-training').earned).toBe(true)
    expect(byId(cards, 'ms-10000-training').earned).toBe(true)
    const halfPb = byId(cards, 'pb-21097.5-training')
    expect(halfPb.earned).toBe(false)
    expect(halfPb.progress).toMatchObject({ current: 12, target: 21.0975 })
    expect(halfPb.progress?.valueText).toBe('12 / 21.1km')
  })

  it('22km 런은 하프 PB(등속 보간)를 획득한다 — 캐노니컬 extra 거리 산출 확인', () => {
    const cards = catalogFor([makeRun({ id: 'a', distanceKm: 22, date: '2026-06-01', durationSec: 7920 })])
    const halfPb = byId(cards, 'pb-21097.5-training')
    expect(halfPb.earned).toBe(true)
    // 등속: 7920 × (21097.5 / 22000) ≈ 7595초 → 2:06:35
    expect(halfPb.valueText).toBe('2:06:35')
    expect(byId(cards, 'ms-21097.5-training').earned).toBe(true)
    expect(byId(cards, 'pb-42195-training').earned).toBe(false)
  })

  it('self-race 태그 런은 레이싱 카탈로그에만 PB 를 만든다', () => {
    const runs = [makeRun({ id: 'r', distanceKm: 6, date: '2026-06-01', tags: ['self-race'] })]
    expect(byId(catalogFor(runs, 'training'), 'pb-5000-training').earned).toBe(false)
    expect(byId(catalogFor(runs, 'race'), 'pb-5000-race').earned).toBe(true)
  })

  it('스트릭: 하루뿐이면 미획득(2일 문턱), 이틀 연속이면 획득', () => {
    const single = catalogFor([makeRun({ id: 'a', distanceKm: 5, date: '2026-06-01' })])
    expect(byId(single, 'streak').earned).toBe(false)
    expect(byId(single, 'streak').progress?.valueText).toBe('1 / 2일')
    const double = catalogFor([
      makeRun({ id: 'a', distanceKm: 5, date: '2026-06-01' }),
      makeRun({ id: 'b', distanceKm: 5, date: '2026-06-02' })
    ])
    const streak = byId(double, 'streak')
    expect(streak.earned).toBe(true)
    expect(streak.valueText).toBe('2일')
    expect(streak.fingerprint).toBe('2')
  })

  it('클럽: 누적 도달 시 획득 + 넘어선 런의 날짜가 achievedAt, 미달은 진행 표시', () => {
    const runs = [
      makeRun({ id: 'a', distanceKm: 60, date: '2026-05-01' }),
      makeRun({ id: 'b', distanceKm: 50, date: '2026-05-10' }),
      makeRun({ id: 'c', distanceKm: 10, date: '2026-05-20' })
    ]
    const cards = catalogFor(runs)
    const club100 = byId(cards, 'club-100')
    expect(club100.earned).toBe(true)
    expect(club100.achievedAt).toBe('2026-05-10')
    const club500 = byId(cards, 'club-500')
    expect(club500.earned).toBe(false)
    expect(club500.progress?.valueText).toBe('120 / 500km')
  })

  it('꾸준함·클럽 카드는 컨텍스트와 무관하게 동일(global 스코프)', () => {
    const runs = [
      makeRun({ id: 'a', distanceKm: 5, date: '2026-06-01' }),
      makeRun({ id: 'b', distanceKm: 6, date: '2026-06-02', tags: ['self-race'] })
    ]
    const training = catalogFor(runs, 'training')
    const race = catalogFor(runs, 'race')
    expect(byId(training, 'streak')).toEqual(byId(race, 'streak'))
    expect(byId(training, 'club-100')).toEqual(byId(race, 'club-100'))
  })
})

describe('computeLifetimeDistanceKm', () => {
  it('훈련+레이싱 전체 합산, 무효 거리는 제외', () => {
    const runs = [
      makeRun({ id: 'a', distanceKm: 10.5 }),
      makeRun({ id: 'b', distanceKm: 4.5, tags: ['self-race'] }),
      makeRun({ id: 'c', distanceKm: 0 })
    ]
    expect(computeLifetimeDistanceKm(runs)).toBe(15)
  })
})

describe('reconcileTrophySeen', () => {
  const runs = [
    makeRun({ id: 'a', distanceKm: 12, date: '2026-06-01' }),
    makeRun({ id: 'b', distanceKm: 5, date: '2026-06-02' })
  ]
  const cards = catalogFor(runs)

  it('최초 방문(seen=null)은 NEW 없이 베이스라인만 만든다', () => {
    const { newIds, nextSeen } = reconcileTrophySeen(cards, null)
    expect(newIds.size).toBe(0)
    expect(Object.keys(nextSeen).length).toBeGreaterThan(0)
    expect(nextSeen['pb-5000-training']).toBeTruthy()
  })

  it('지문이 바뀐(갱신) 카드와 새로 획득한 카드만 NEW', () => {
    const { nextSeen: baseline } = reconcileTrophySeen(cards, null)
    const renewed = catalogFor([...runs, makeRun({ id: 'c', distanceKm: 12, date: '2026-06-10', durationSec: 3000 })])
    const { newIds } = reconcileTrophySeen(renewed, baseline)
    expect(newIds.has('pb-5000-training')).toBe(true) // 더 빠른 기록 → 지문 변경
    expect(newIds.has('ms-5000-training')).toBe(false) // 첫 완주 시점 불변
  })

  it('미획득 카드는 seen 에 실리지 않고 NEW 도 아니다', () => {
    const { newIds, nextSeen } = reconcileTrophySeen(cards, {})
    expect(nextSeen['pb-42195-training']).toBeUndefined()
    expect(newIds.has('pb-42195-training')).toBe(false)
  })
})

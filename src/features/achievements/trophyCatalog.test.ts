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

/**
 * 카드에 적히는 **달성 근거**. 전리품 카드는 자랑거리인데, 예전 문구("출발부터 10K 거리까지 도달한
 * 최고 기록")는 카드의 *정의*라 어떤 카드에 붙여도 참이었다 — 즉 아무 근거도 아니었다.
 */
describe('PB 카드 달성 근거', () => {
  it('기록을 깼으면 깨뜨린 대상과 단축폭을 적는다', () => {
    const cards = catalogFor([
      makeRun({ id: 'r1', distanceKm: 5, durationSec: 1800, date: '2026-01-01' }),
      makeRun({ id: 'r2', distanceKm: 5, durationSec: 1786, date: '2026-02-01' })
    ])
    expect(byId(cards, 'pb-5000-training').description).toBe('직전 기록 30:00보다 14초 단축.')
  })

  it('1분을 넘는 단축은 분·초로 적는다 (74초보다 몸으로 읽힌다)', () => {
    const cards = catalogFor([
      makeRun({ id: 'r1', distanceKm: 5, durationSec: 1800, date: '2026-01-01' }),
      makeRun({ id: 'r2', distanceKm: 5, durationSec: 1726, date: '2026-02-01' })
    ])
    expect(byId(cards, 'pb-5000-training').description).toBe('직전 기록 30:00보다 1분 14초 단축.')
  })

  it('첫 기록은 깰 대상이 없으므로 측정 방식을 근거로 적는다', () => {
    const cards = catalogFor([makeRun({ id: 'r1', distanceKm: 5, durationSec: 1800, date: '2026-01-01' })])
    expect(byId(cards, 'pb-5000-training').description).toBe('첫 5K 기록 — 출발부터 5K 지점까지의 시간으로 잡습니다.')
  })

  it('미획득 카드는 여는 방법을 적는다 (근거 자리를 비우지 않는다)', () => {
    const cards = catalogFor([makeRun({ id: 'r1', distanceKm: 5, durationSec: 1800, date: '2026-01-01' })])
    expect(byId(cards, 'pb-42195-training').description).toContain('완주하면')
  })

  it('모든 카드는 근거 문구를 갖는다 (카드에 빈 줄이 생기지 않는다)', () => {
    for (const card of catalogFor([makeRun({ id: 'r1', distanceKm: 12, durationSec: 4000, date: '2026-01-01' })])) {
      expect(card.description.length).toBeGreaterThan(0)
    }
  })
})

/**
 * 탭(훈련/레이싱) 고유 카드와 통합 집계 카드의 구분.
 *
 * 꾸준함·클럽 6장은 훈련/레이싱 **통합** 집계라 어느 탭에서도 획득으로 들어온다. 그래서 탭 카운터가
 * 14장 전부를 세면, 레이싱으로 400m 만 뛴 계정의 레이싱 탭에 `6/14` 가 뜨고 "누적 1000km 클럽 획득"
 * 으로 보였다(2026-08-11 사용자 지적). 카운터가 세는 모집단이 이 구분에 달려 있으므로 고정한다.
 */
describe('scope — 탭 고유 카드 8장 · 통합 집계 6장', () => {
  const runs = [makeRun({ id: 'r1', distanceKm: 12, durationSec: 4000, date: '2026-01-01' })]

  it('탭 고유(PB·마일스톤) 8장, 통합 집계(스트릭·주간·월간·클럽) 6장', () => {
    for (const context of ['training', 'race'] as const) {
      const cards = catalogFor(runs, context)
      expect(cards.filter((c) => c.scope === 'context')).toHaveLength(8)
      expect(cards.filter((c) => c.scope === 'global')).toHaveLength(6)
    }
  })

  it('탭 고유는 PB·마일스톤뿐이다 (탭을 바꾸면 값이 바뀌는 카드)', () => {
    const kinds = new Set(catalogFor(runs, 'training').filter((c) => c.scope === 'context').map((c) => c.kind))
    expect([...kinds].sort()).toEqual(['milestone', 'pb'])
  })

  it('통합 집계는 꾸준함·볼륨뿐이다 (탭과 무관하게 같은 값)', () => {
    const kinds = new Set(catalogFor(runs, 'training').filter((c) => c.scope === 'global').map((c) => c.kind))
    expect([...kinds].sort()).toEqual(['club', 'monthly', 'streak', 'weekly'])
  })

  /** 레이싱 기록이 없는 계정: 레이싱 탭의 고유 획득은 0이어야 한다(통합 집계가 섞여 들어오면 안 된다). */
  it('레이싱 기록이 없으면 레이싱 탭 고유 획득은 0', () => {
    const trainingOnly = [makeRun({ id: 'r1', distanceKm: 12, durationSec: 4000, date: '2026-01-01' })]
    const racing = catalogFor(trainingOnly, 'race').filter((c) => c.scope === 'context')
    expect(racing.filter((c) => c.earned)).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { computeAchievements } from '@/shared/lib/achievement/achievements'
import type { RunLog } from '@/entities/run/model'
import { buildTrophyCatalog } from './trophyCatalog'
import { trophyArtFor } from './trophyArt'

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

/**
 * 카드 ↔ 아트 매핑 전수(2026-08-11 2차 핸드오프로 14장 전원 아트 보유).
 *
 * 이 테스트가 막는 사고: 아트 없는 카드는 픽토그램으로 조용히 폴백한다 — **빌드도 통과하고 런타임
 * 오류도 없다.** 그래서 id 규칙이 어긋나면(실제로 `pb-21097-racing` 처럼 잘못 적어 8장이 전부 폴백된
 * 적이 있다) 화면을 눈으로 볼 때까지 아무도 모른다. 카탈로그가 실제로 만드는 id 로 검사한다.
 */
describe('trophyArtFor — 14장 전원 아트', () => {
  const cards = ['training', 'race'].flatMap((context) =>
    buildTrophyCatalog(
      computeAchievements([makeRun({ id: 'r1', distanceKm: 42.2 })]),
      [makeRun({ id: 'r1', distanceKm: 42.2 })],
      context as 'training' | 'race'
    )
  )

  it('훈련·레이싱 두 트랙 모두 폴백 없이 아트를 찾는다', () => {
    const missing = cards.filter((card) => !trophyArtFor(card)).map((card) => card.id)
    expect(missing).toEqual([])
  })

  it('각인이 다른 카드는 서로 다른 아트를 쓴다 (5K 카드에 10K 각인이 뜨면 틀린 카드다)', () => {
    const pb = ['pb-5000', 'pb-10000', 'pb-21097.5', 'pb-42195']
      .map((prefix) => trophyArtFor({ id: `${prefix}-training` }))
    expect(new Set(pb).size).toBe(4)
  })

  it('훈련·레이싱은 같은 거리면 같은 아트를 쓴다 (아트는 거리로만 갈린다)', () => {
    expect(trophyArtFor({ id: 'pb-5000-training' })).toBe(trophyArtFor({ id: 'pb-5000-race' }))
  })

  it('모르는 id 는 null 로 떨어져 픽토그램 폴백으로 간다', () => {
    expect(trophyArtFor({ id: 'streak-30' })).toBeNull()
    expect(trophyArtFor({ id: 'pb-3000-training' })).toBeNull()
  })
})

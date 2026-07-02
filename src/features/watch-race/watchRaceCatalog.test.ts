import { beforeEach, describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { GhostCurvePoint } from '@/shared/lib/selfRace/ghost'
import { buildWatchRaceCatalog, downsampleCurve } from './watchRaceCatalog'

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-06-11', startAt: null, endAt: null,
    type: 'Easy', durationSec: null, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-06-11T00:00:00.000Z', updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides
  }
}

describe('buildWatchRaceCatalog', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('PB가 있는 거리 버킷을 곡선 포함 항목으로 만든다', () => {
    // 5km를 25분(300초/km)에 뛴 런 — 5km 버킷 베스트가 된다.
    const run = makeRun({ id: 'r1', distanceKm: 5.2, durationSec: 1560, startAt: '2026-06-10T07:00:00.000Z' })
    const catalog = buildWatchRaceCatalog([run], '2026-06-11T00:00:00.000Z')

    expect(catalog.generatedAt).toBe('2026-06-11T00:00:00.000Z')
    expect(catalog.entries.length).toBeGreaterThan(0)
    const fiveK = catalog.entries.find((e) => e.distanceM === 5000)
    expect(fiveK).toBeTruthy()
    expect(fiveK!.best).toBeTruthy()
    expect(fiveK!.best!.sourceRunId).toBe('r1')
    // 곡선은 {0,0} 시작 + 단조증가 (ghost.ts 좌표계)
    const points = fiveK!.best!.curvePoints
    expect(points[0]).toEqual({ distanceM: 0, elapsedSec: 0 })
    for (let i = 1; i < points.length; i++) {
      expect(points[i].distanceM).toBeGreaterThanOrEqual(points[i - 1].distanceM)
      expect(points[i].elapsedSec).toBeGreaterThanOrEqual(points[i - 1].elapsedSec)
    }
  })

  it('런이 없으면 빈 카탈로그 + 기본 안내 설정', () => {
    const catalog = buildWatchRaceCatalog([], '2026-06-11T00:00:00.000Z')
    expect(catalog.entries).toEqual([])
    expect(catalog.announceConfig).toEqual({
      periodic: { kind: 'distance', stepM: 1000 },
      reversalAlert: true,
      gapMode: 'distance'
    })
    expect(catalog.lastSelection).toEqual({ distanceM: null, opponentKind: 'none' })
  })

  it('폰 레이스 저장 설정(race_last_settings_v1)을 안내 설정·기본 선택으로 미러한다', () => {
    localStorage.setItem(
      'race_last_settings_v1',
      JSON.stringify({
        distanceM: 5000,
        opponentRunId: 'r1',
        periodicKind: 'time',
        stepSec: 120,
        reversalAlert: false,
        gapMode: 'time'
      })
    )
    const catalog = buildWatchRaceCatalog([], '2026-06-11T00:00:00.000Z')
    expect(catalog.announceConfig).toEqual({
      periodic: { kind: 'time', stepSec: 120 },
      reversalAlert: false,
      gapMode: 'time'
    })
    expect(catalog.lastSelection).toEqual({ distanceM: 5000, opponentKind: 'best' })
  })
})

describe('downsampleCurve', () => {
  it('상한 이하 곡선은 그대로 복사한다', () => {
    const points: GhostCurvePoint[] = [
      { distanceM: 0, elapsedSec: 0 },
      { distanceM: 1000, elapsedSec: 300 }
    ]
    const result = downsampleCurve(points, 120)
    expect(result).toEqual(points)
    expect(result).not.toBe(points)
  })

  it('긴 곡선은 첫/끝 점을 보존하며 상한 개수로 줄인다', () => {
    const points: GhostCurvePoint[] = Array.from({ length: 1000 }, (_, i) => ({
      distanceM: i * 10,
      elapsedSec: i * 3
    }))
    const result = downsampleCurve(points, 120)
    expect(result.length).toBe(120)
    expect(result[0]).toEqual(points[0])
    expect(result[result.length - 1]).toEqual(points[points.length - 1])
    // 단조성 유지
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distanceM).toBeGreaterThan(result[i - 1].distanceM)
    }
  })
})

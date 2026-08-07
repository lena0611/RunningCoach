import { describe, expect, it } from 'vitest'
import { buildRunUpdateRow } from './runRepository'
import type { RunLog } from '@/entities/run/model'

/**
 * 런 업데이트는 **패치형**이어야 한다는 계약.
 *
 * 예전 구현은 메모리의 런 전체를 덮어썼다(`route_points: rest.routePoints ?? []`). 목록 쿼리가
 * 경로를 안 불러오게 되는 순간(지연 로드) 모든 업데이트가 GPS 경로를 `[]` 로 지운다 — 그리고
 * 업데이트 호출부 7곳 중 하나는 **앱 로드 시 자동 실행되는 롱런 오분류 자가치유**라서, 사용자가
 * 아무것도 하지 않아도 경로가 조용히 사라진다. 이 테스트가 그 사고를 구조적으로 막는다.
 */
const HEAVY_KEYS = ['laps', 'fast_segments', 'metric_samples', 'route_points']

function run(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'r1',
    userId: 'u1',
    externalId: 'hk-1',
    date: '2026-08-01',
    startAt: '2026-08-01T09:00:00Z',
    endAt: '2026-08-01T09:40:00Z',
    type: 'Easy',
    sessionTitle: '아침 러닝',
    distanceKm: 5,
    durationSec: 2400,
    avgPaceSec: 480,
    avgHeartRate: 130,
    maxHeartRate: 142,
    cadence: 165,
    activeEnergyKcal: 300,
    temperature: 25,
    humidity: 60,
    windMps: 1,
    elevationGainM: 10,
    elevationLossM: 10,
    courseType: 'Flat',
    rpe: 3,
    workoutFeeling: '좋음',
    painNote: '',
    sleepQuality: 3,
    conditionScore: 3,
    stressLevel: 2,
    companion: '',
    memo: '',
    laps: [{ index: 1, distanceKm: 1, durationSec: 480 }],
    fastSegments: [],
    metricSamples: [{ offsetSec: 0, heartRate: 120 }],
    routePoints: [{ offsetSec: 0, latitude: 37.5, longitude: 127.0 }],
    tags: ['healthkit'],
    source: 'healthkit',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    ...overrides
  } as RunLog
}

describe('buildRunUpdateRow — 무거운 데이터는 기본적으로 건드리지 않는다', () => {
  it('기본은 경로·샘플·랩 키를 아예 넣지 않는다 (덮어쓸 수 없다)', () => {
    const row = buildRunUpdateRow(run())
    for (const key of HEAVY_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(row, key), key).toBe(false)
    }
  })

  it('메타 컬럼은 정상적으로 갱신한다', () => {
    const row = buildRunUpdateRow(run({ rpe: 5, memo: '더웠다', type: 'Tempo' }))
    expect(row.rpe).toBe(5)
    expect(row.memo).toBe('더웠다')
    expect(row.type).toBe('Tempo')
    expect(row.updated_at).toBeTypeOf('string')
  })

  it('includeHeavyData 를 명시하면 그때만 함께 저장한다 (HealthKit 경로 백필·리프레시 병합)', () => {
    const row = buildRunUpdateRow(run(), { includeHeavyData: true })
    for (const key of HEAVY_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(row, key), key).toBe(true)
    }
    expect(row.route_points).toHaveLength(1)
    expect(row.metric_samples).toHaveLength(1)
  })

  it('무거운 데이터가 비어 있어도 명시했으면 빈 배열로 저장한다 (의도적 초기화 경로 보존)', () => {
    const row = buildRunUpdateRow(run({ routePoints: [], metricSamples: [] }), { includeHeavyData: true })
    expect(row.route_points).toEqual([])
    expect(row.metric_samples).toEqual([])
  })

  it('id·userId·createdAt 은 업데이트 대상이 아니다', () => {
    const row = buildRunUpdateRow(run())
    expect(Object.prototype.hasOwnProperty.call(row, 'id')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(row, 'user_id')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(row, 'created_at')).toBe(false)
  })

  /** 지금은 목록이 경로를 다 불러오므로, 기본 경로의 의미가 바뀌지 않았음을 명시적으로 남긴다. */
  it('기본 경로는 메타만 담는다 — 오늘 동작과 같은 값을 되쓰지 않을 뿐', () => {
    const row = buildRunUpdateRow(run())
    expect(row.distance_km).toBe(5)
    expect(row.tags).toEqual(['healthkit'])
    expect(Object.keys(row).some((key) => HEAVY_KEYS.includes(key))).toBe(false)
  })
})

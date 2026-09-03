import { describe, expect, it } from 'vitest'
import {
  computeDataCard,
  validateDataCardSpec,
  type DataCardSpec
} from '../supabase/functions/_shared/dataCard'
import type { QueryRunsRow, QueryRunsSpec } from '../supabase/functions/_shared/queryRunsCore'

function row(overrides: Partial<QueryRunsRow> = {}): QueryRunsRow {
  return {
    date: '2026-08-01',
    start_at: null,
    type: 'Easy',
    distance_km: 5,
    duration_sec: 1800,
    avg_pace_sec: 360,
    avg_heart_rate: 130,
    max_heart_rate: 150,
    cadence: 160,
    active_energy_kcal: 300,
    temperature: null,
    humidity: null,
    wind_mps: null,
    elevation_gain_m: null,
    elevation_loss_m: null,
    course_type: 'Flat',
    rpe: null,
    sleep_quality: null,
    condition_score: null,
    stress_level: null,
    companion: null,
    ...overrides
  }
}

const query = (over: Partial<QueryRunsSpec> = {}): QueryRunsSpec => ({
  filters: [],
  groupBy: 'none',
  metrics: ['distanceKm'],
  limit: 24,
  ...over
})

/**
 * #767 수용 기준 — 사용자가 실제로 말한 두 카드가 표현되는가.
 * 둘 다 처음엔 스펙 밖이었다(요일 필터 없음 / 나눗셈 없음). 이 테스트가 그 확장을 잠근다.
 */
describe('#767 사용자 정의 데이터 카드', () => {
  // 8월: 1일(토) 15km LSD, 8일(토) 20km LSD, 5일(수) 5km Easy
  const rows = [
    row({ date: '2026-08-01', type: 'LSD', distance_km: 15 }),
    row({ date: '2026-08-08', type: 'LSD', distance_km: 20 }),
    row({ date: '2026-08-05', type: 'Easy', distance_km: 5 }),
    row({ date: '2026-08-06', type: 'Easy', distance_km: 10 })
  ]

  it('예시 1 — "매주 토요일만 LSD 누적 km" (요일 필터)', () => {
    const spec: DataCardSpec = {
      kind: 'single',
      title: '토요일 LSD 누적',
      metric: 'distanceKm',
      query: query({ filters: [{ field: 'weekday', op: 'eq', value: '토' }, { field: 'type', op: 'eq', value: 'LSD' }] })
    }
    const result = computeDataCard(spec, rows)
    expect(result.value).toBe(35)
    expect(result.unit).toBe('km')
    expect(result.matchedRuns).toBe(2)
  })

  it('요일 필터는 다른 요일을 걸러낸다', () => {
    const spec: DataCardSpec = {
      kind: 'single',
      title: '수요일 누적',
      metric: 'distanceKm',
      query: query({ filters: [{ field: 'weekday', op: 'eq', value: '수' }] })
    }
    expect(computeDataCard(spec, rows).value).toBe(5)
  })

  it('예시 2 — "주간 총 볼륨 대비 LSD 볼륨" (비율 합성)', () => {
    const spec: DataCardSpec = {
      kind: 'ratio',
      title: 'LSD 비중',
      metric: 'distanceKm',
      display: 'percent',
      numerator: query({ groupBy: 'week', filters: [{ field: 'type', op: 'eq', value: 'LSD' }] }),
      denominator: query({ groupBy: 'week' })
    }
    // LSD 35 / 전체 50 = 70%
    const result = computeDataCard(spec, rows)
    expect(result.value).toBe(70)
    expect(result.unit).toBe('%')
    // 표본은 분모(전체) 기준 — 비율의 신뢰도는 전체가 정한다.
    expect(result.matchedRuns).toBe(4)
  })

  it('분모가 0 이면 0% 가 아니라 계산 불가 — 0 으로 보여주면 거짓말이 된다', () => {
    const spec: DataCardSpec = {
      kind: 'ratio',
      title: 'LSD 비중',
      metric: 'distanceKm',
      display: 'percent',
      numerator: query({ filters: [{ field: 'type', op: 'eq', value: 'LSD' }] }),
      denominator: query({ filters: [{ field: 'type', op: 'eq', value: 'Race' }] })
    }
    const result = computeDataCard(spec, rows)
    expect(result.value).toBeNull()
    expect(result.failureKind).toBeTruthy()
  })

  it('비율은 축이 다르거나 지표가 다르면 거부한다 — 숫자가 의미를 잃는다', () => {
    const base = {
      kind: 'ratio' as const,
      title: 'x',
      metric: 'distanceKm' as const,
      display: 'percent' as const,
      numerator: query({ groupBy: 'week' }),
      denominator: query({ groupBy: 'month' })
    }
    expect(validateDataCardSpec(base)).toEqual({ ok: false, error: '비율은 분자와 분모를 같은 기준으로 묶어야 합니다.' })

    const mixed = { ...base, denominator: query({ groupBy: 'week', metrics: ['durationSec'] as const as QueryRunsSpec['metrics'] }) }
    expect(validateDataCardSpec(mixed).ok).toBe(false)
  })

  it('카드 이름이 비면 거부한다', () => {
    expect(validateDataCardSpec({ kind: 'single', title: '  ', metric: 'distanceKm', query: query() }).ok).toBe(false)
  })
})

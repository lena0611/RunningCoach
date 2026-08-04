import { describe, expect, it } from 'vitest'
import {
  normalizeQueryRunsArgs,
  runQueryRuns,
  type QueryRunsRow,
  type QueryRunsSpec
} from '../supabase/functions/coach-run/queryRuns'

function row(overrides: Partial<QueryRunsRow> = {}): QueryRunsRow {
  return {
    date: '2026-06-10',
    start_at: null,
    type: 'Easy',
    distance_km: 5,
    duration_sec: 1800,
    avg_pace_sec: 360,
    avg_heart_rate: 140,
    max_heart_rate: 150,
    cadence: 165,
    active_energy_kcal: 300,
    temperature: 20,
    humidity: null,
    wind_mps: null,
    elevation_gain_m: 10,
    elevation_loss_m: 10,
    course_type: 'Flat',
    rpe: 4,
    sleep_quality: 3,
    condition_score: 3,
    stress_level: 2,
    companion: '',
    ...overrides
  }
}

function spec(overrides: Partial<QueryRunsSpec> = {}): QueryRunsSpec {
  return { filters: [], groupBy: 'none', metrics: ['count', 'distanceKm'], limit: 24, ...overrides }
}

describe('normalizeQueryRunsArgs — 화이트리스트가 거부 이유를 돌려준다', () => {
  it('저장하지 않는 항목은 거부한다 (없는 걸 있는 척하지 않기)', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'shoes', op: 'eq', value: 'A' }] })
    expect('error' in result && result.error).toContain('저장하지 않는')
  })

  it('허용 밖 비교 방식을 거부한다', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'distanceKm', op: 'regex', value: 5 }] })
    expect('error' in result && result.error).toContain('쓸 수 없는 비교')
  })

  it('숫자 필드에 숫자가 아닌 값을 거부한다', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'temperature', op: 'gte', value: '더움' }] })
    expect('error' in result && result.error).toContain('숫자가 아닙니다')
  })

  it('날짜 형식을 강제한다', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'date', op: 'gte', value: '6월' }] })
    expect('error' in result && result.error).toContain('YYYY-MM-DD')
  })

  it('모르는 groupBy·metric 은 안전한 기본값으로 떨어진다', () => {
    const result = normalizeQueryRunsArgs({ groupBy: 'shoeBrand', metrics: ['bogus'] })
    expect('spec' in result && result.spec.groupBy).toBe('none')
    expect('spec' in result && result.spec.metrics).toEqual(['count', 'distanceKm'])
  })

  it('limit 은 상한으로 클램프된다', () => {
    const result = normalizeQueryRunsArgs({ limit: 999 })
    expect('spec' in result && result.spec.limit).toBe(24)
  })
})

describe('runQueryRuns — 집계와 신뢰 장치', () => {
  it('월별로 묶어 합계·평균을 낸다', () => {
    const result = runQueryRuns(spec({ groupBy: 'month', metrics: ['count', 'distanceKm', 'avgPaceSec'] }), [
      row({ date: '2026-06-01', distance_km: 10, avg_pace_sec: 300 }),
      row({ date: '2026-06-20', distance_km: 5, avg_pace_sec: 400 }),
      row({ date: '2026-07-02', distance_km: 7, avg_pace_sec: 350 })
    ])

    expect(result.rows).toEqual([
      { group: '2026-07', count: 1, distanceKm: 7, distanceKmSamples: 1, avgPaceSec: 350, avgPaceSecSamples: 1 },
      { group: '2026-06', count: 2, distanceKm: 15, distanceKmSamples: 2, avgPaceSec: 350, avgPaceSecSamples: 2 }
    ])
    expect(result.matchedRuns).toBe(3)
  })

  it('적용된 조건을 사람이 읽는 문장으로 돌려준다 (답변에 노출해 검증 가능하게)', () => {
    const result = runQueryRuns(
      spec({ filters: [{ field: 'temperature', op: 'gte', value: 28 }] }),
      [row({ temperature: 30 }), row({ temperature: 20 })]
    )
    expect(result.appliedFilters).toEqual(['temperature ≥ 28'])
    expect(result.matchedRuns).toBe(1)
  })

  it('결측 지표는 0 으로 속이지 않고 null + 표본 0 으로 알린다', () => {
    const result = runQueryRuns(spec({ metrics: ['count', 'avgHeartRate'] }), [
      row({ avg_heart_rate: null }),
      row({ avg_heart_rate: null })
    ])
    expect(result.rows[0].avgHeartRate).toBeNull()
    expect(result.rows[0].avgHeartRateSamples).toBe(0)
  })

  it('결과가 없으면 추정 금지 주의를 붙인다', () => {
    const result = runQueryRuns(spec({ filters: [{ field: 'distanceKm', op: 'gte', value: 100 }] }), [row()])
    expect(result.matchedRuns).toBe(0)
    expect(result.caution).toContain('기록이 없다고')
  })

  it('표본이 적으면 단정 금지 주의를 붙인다', () => {
    const result = runQueryRuns(spec(), [row(), row()])
    expect(result.caution).toContain('표본이 2건')
  })

  it('요일로 묶을 수 있다', () => {
    // 2026-06-08 은 월요일, 2026-06-09 는 화요일
    const result = runQueryRuns(spec({ groupBy: 'weekday', metrics: ['count'] }), [
      row({ date: '2026-06-08' }),
      row({ date: '2026-06-09' }),
      row({ date: '2026-06-09' })
    ])
    const byGroup = Object.fromEntries(result.rows.map((item) => [item.group, item.count]))
    expect(byGroup).toEqual({ 월: 1, 화: 2 })
  })

  it('동반자가 비어 있으면 혼자로 묶는다', () => {
    const result = runQueryRuns(spec({ groupBy: 'companion', metrics: ['count'] }), [row({ companion: '' })])
    expect(result.rows[0].group).toBe('혼자')
  })
})

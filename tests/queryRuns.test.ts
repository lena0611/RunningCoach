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
  it('저장하지 않는 항목은 거부하고 실패 종류를 밝힌다 (없는 걸 있는 척하지 않기)', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'shoes', op: 'eq', value: 'A' }] })
    expect('error' in result && result.error).toContain('저장하지 않는')
    expect('error' in result && result.kind).toBe('unsupported_field')
  })

  it('형식 오류는 invalid_args 로 분류된다', () => {
    const result = normalizeQueryRunsArgs({ filters: [{ field: 'distanceKm', op: 'regex', value: 5 }] })
    expect('error' in result && result.kind).toBe('invalid_args')
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

  it('결측 지표는 0 으로 속이지 않고 null + 표본 0 + missing_values 로 알린다', () => {
    const result = runQueryRuns(spec({ metrics: ['count', 'avgHeartRate'] }), [
      row({ avg_heart_rate: null }),
      row({ avg_heart_rate: null })
    ])
    expect(result.rows[0].avgHeartRate).toBeNull()
    expect(result.rows[0].avgHeartRateSamples).toBe(0)
    // 표본 2건이기도 하지만, "그 값은 기록되지 않았다"가 사용자에게 더 정확한 실패다.
    expect(result.failureKind).toBe('missing_values')
    expect(result.caution).toContain('기록되어 있지 않다')
  })

  it('결과가 없으면 no_matching_runs + 추정 금지 주의를 붙인다', () => {
    const result = runQueryRuns(spec({ filters: [{ field: 'distanceKm', op: 'gte', value: 100 }] }), [row()])
    expect(result.matchedRuns).toBe(0)
    expect(result.failureKind).toBe('no_matching_runs')
    expect(result.caution).toContain('기록이 없다고')
  })

  it('표본이 적으면 low_sample + 단정 금지 주의를 붙인다', () => {
    const result = runQueryRuns(spec(), [row(), row()])
    expect(result.failureKind).toBe('low_sample')
    expect(result.caution).toContain('표본이 2건')
  })

  it('정상 결과는 실패 종류가 없다', () => {
    const result = runQueryRuns(spec(), [row(), row(), row(), row()])
    expect(result.failureKind).toBeNull()
    expect(result.caution).toBeNull()
  })

  // 2026-08-05 실사용 실패에서 추가: "마지막 러닝부터 며칠 쉬었나"에 조회 수단이 없어 코치가 답을 미뤘다.
  it('lastDate/firstDate 로 마지막·첫 러닝 날짜를 조회할 수 있다', () => {
    const result = runQueryRuns(spec({ metrics: ['count', 'lastDate', 'firstDate'] }), [
      row({ date: '2026-06-10' }),
      row({ date: '2026-07-28' }),
      row({ date: '2026-05-02' }),
      row({ date: '2026-07-01' })
    ])
    expect(result.rows[0].lastDate).toBe('2026-07-28')
    expect(result.rows[0].firstDate).toBe('2026-05-02')
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

/**
 * #767 — 코어를 공용 위치(_shared)로 내렸다. 웹(요약 탭 사용자 카드)이 **같은 파일**을 import 해
 * 코치 답변과 같은 숫자를 말하는 게 이 분리의 목적이므로, 그 경로가 실제로 물리는지 잠근다.
 * 미러(두 벌)로 되돌아가면 이 테스트가 먼저 깨진다.
 */
describe('#767 계산 코어 공용화', () => {
  it('_shared 코어를 직접 import 해도 같은 결과를 낸다 — Edge 래퍼는 문구만 얹는다', async () => {
    const core = await import('../supabase/functions/_shared/queryRunsCore')
    const rows = [row({ date: '2026-06-01', distance_km: 10 }), row({ date: '2026-06-08', distance_km: 12 })]
    const spec: QueryRunsSpec = { filters: [], groupBy: 'none', metrics: ['count', 'distanceKm'], limit: 24 }

    const viaCore = core.runQueryRunsCore(spec, rows)
    const viaEdge = runQueryRuns(spec, rows)

    expect(viaCore.rows).toEqual(viaEdge.rows)
    expect(viaCore.matchedRuns).toBe(viaEdge.matchedRuns)
    // 코어는 실패 '종류'만 낸다. 코치 응대 문구(caution)는 Edge 래퍼가 만든다.
    expect(viaCore).not.toHaveProperty('caution')
    expect(viaEdge).toHaveProperty('caution')
  })

  it('실패 상세도 코어가 내고 문구는 래퍼가 만든다 — 표본이 적을 때', async () => {
    const core = await import('../supabase/functions/_shared/queryRunsCore')
    const rows = [row({ date: '2026-06-01', distance_km: 10 })]
    const spec: QueryRunsSpec = { filters: [], groupBy: 'none', metrics: ['count'], limit: 24 }

    expect(core.runQueryRunsCore(spec, rows).failureKind).toBe('low_sample')
    expect(core.runQueryRunsCore(spec, rows).failureDetail).toBe('1')
    expect(runQueryRuns(spec, rows).caution).toBeTruthy()
  })
})

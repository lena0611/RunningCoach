import { describe, expect, it } from 'vitest'
import {
  computeDataCard,
  dataCardTitleWidth,
  validateDataCardSpec,
  type DataCardSpec
} from '../supabase/functions/_shared/dataCard'
import { normalizeDataCardProposalArgs } from '../supabase/functions/_shared/dataCardProposal'
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
    // 주차별 비율의 평균. 8/1(토) 15 LSD / 15 전체 = 100%, 8/5·8/6·8/8 주: 20 LSD / 35 = 57.1%
    const result = computeDataCard(spec, rows)
    expect(result.value).toBe(78.6)
    expect(result.unit).toBe('%')
    // 표본은 분모(전체) 기준 — 비율의 신뢰도는 전체가 정한다.
    expect(result.matchedRuns).toBe(4)
  })

  it('묶어서 물으면 **묶음별 비율의 평균** — 전체를 합쳐 나누면 큰 주가 결과를 지배한다', () => {
    // 1주차: LSD 5 / 전체 10 = 50%,  2주차: LSD 10 / 전체 90 = 11.1%
    // 평균 = 30.6%,  합쳐서 나누면 15/100 = 15% — 두 값은 다르고, "주간 비중"은 앞이 맞다.
    const twoWeeks = [
      row({ date: '2026-08-03', type: 'LSD', distance_km: 5 }),
      row({ date: '2026-08-05', type: 'Easy', distance_km: 5 }),
      row({ date: '2026-08-10', type: 'LSD', distance_km: 10 }),
      row({ date: '2026-08-12', type: 'Easy', distance_km: 80 })
    ]
    const spec: DataCardSpec = {
      kind: 'ratio',
      title: 'LSD 주간 비중 평균',
      metric: 'distanceKm',
      display: 'percent',
      numerator: query({ groupBy: 'week', filters: [{ field: 'type', op: 'eq', value: 'LSD' }] }),
      denominator: query({ groupBy: 'week' })
    }
    const result = computeDataCard(spec, twoWeeks)
    expect(result.value).toBe(30.6)
    expect(result.groupCount).toBe(2)
    expect(result.groupBy).toBe('week')
  })

  it('LSD 를 안 한 주는 0% 로 센다 — 평균에서 빼면 비중이 부풀려진다', () => {
    const twoWeeks = [
      row({ date: '2026-08-03', type: 'LSD', distance_km: 5 }),
      row({ date: '2026-08-05', type: 'Easy', distance_km: 5 }),
      row({ date: '2026-08-12', type: 'Easy', distance_km: 10 })
    ]
    const spec: DataCardSpec = {
      kind: 'ratio',
      title: 'LSD 주간 비중 평균',
      metric: 'distanceKm',
      display: 'percent',
      numerator: query({ groupBy: 'week', filters: [{ field: 'type', op: 'eq', value: 'LSD' }] }),
      denominator: query({ groupBy: 'week' })
    }
    // 1주차 50%, 2주차 0% → 평균 25%. 2주차를 빼면 50% 가 돼 실제보다 부풀려진다.
    expect(computeDataCard(spec, twoWeeks).value).toBe(25)
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

/**
 * #767 — 제목 길이 상한(2026-09-03 모바일 실측: 375px 라벨 132px, 한글 10자=121px, 11자=133px).
 * **저장 뒤엔 제목을 고칠 방법이 없다**(편집 UI 없음) — 그래서 제안 단계에서 막는다.
 */
describe('카드 제목 길이', () => {
  const spec = (title: string): DataCardSpec => ({ kind: 'single', title, metric: 'distanceKm', query: query() })

  it('글자 수가 아니라 폭으로 센다 — 공백·영문은 반 칸', () => {
    // 12글자지만 공백 3 + 영문 3 이라 폭은 9칸 → 한 줄에 들어간다.
    expect(dataCardTitleWidth('주간 대비 LSD 비중')).toBe(9)
    expect(validateDataCardSpec(spec('주간 대비 LSD 비중')).ok).toBe(true)
    expect(dataCardTitleWidth('토요일 LSD 누적')).toBe(7.5)
  })

  it('한글 11자는 거부한다 — 카드에서 두 줄로 꺾인다', () => {
    const verdict = validateDataCardSpec(spec('가나다라마바사아자차카'))
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toContain('너무 깁니다')
  })

  it('한글 10자는 통과한다 — 경계', () => {
    expect(validateDataCardSpec(spec('가나다라마바사아자차')).ok).toBe(true)
  })
})

/**
 * #767 — 카드는 **매일 보는 물건**이라 언제 열어도 "지금 기준"이어야 한다.
 * 처음엔 모델이 준 절대 날짜(`2026-08-01~08-31`)를 그대로 저장해 카드가 8월에 얼어붙었다
 * (2026-09-03 실측: "최근 4주" 요청이 8월 카드가 됐다). 이 테스트가 그 회귀를 막는다.
 */
describe('카드 기간은 오늘 기준(상대)', () => {
  const rows = [
    row({ date: '2026-09-02', distance_km: 10 }),
    row({ date: '2026-08-20', distance_km: 20 }),
    row({ date: '2026-07-01', distance_km: 30 })
  ]
  const spec: DataCardSpec = {
    kind: 'single',
    title: '최근 거리',
    metric: 'distanceKm',
    period: { kind: 'rolling', lastDays: 7 },
    query: query()
  }

  it('오늘이 바뀌면 값도 바뀐다 — 같은 스펙, 다른 날', () => {
    expect(computeDataCard(spec, rows, new Date('2026-09-03T00:00:00')).value).toBe(10)
    // 2주 뒤엔 9/2 러닝도 창 밖이다.
    expect(computeDataCard(spec, rows, new Date('2026-09-17T00:00:00')).value).toBeNull()
  })

  it('창을 안 주면 전체 기간', () => {
    const all: DataCardSpec = { ...spec, period: null }
    expect(computeDataCard(all, rows, new Date('2026-09-03T00:00:00')).value).toBe(60)
  })

  it('요청한 창을 결과에 실어 화면이 "최근 N주"라고 말할 수 있게 한다', () => {
    expect(computeDataCard(spec, rows, new Date('2026-09-03T00:00:00')).windowDays).toBe(7)
  })

  it('절대 날짜 필터는 거부한다 — 저장되면 그 기간에 얼어붙는다', () => {
    const frozen: DataCardSpec = {
      kind: 'single',
      title: '8월 거리',
      metric: 'distanceKm',
      query: query({ filters: [{ field: 'date', op: 'gte', value: '2026-08-01' }] })
    }
    const verdict = validateDataCardSpec(frozen)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toContain('기간 설정으로 지정')
  })
})

/**
 * #767 — 사용자가 말한 방식이 셋으로 갈린다. **뭉치면 반드시 한쪽이 틀린다**:
 * "최근 한 달"을 이번 달로 굳히면 월초에 값이 사라지고, "8월"을 롤링으로 바꾸면 지난 기록이 흔들린다.
 */
describe('기간 3종 — 무엇이 움직이고 무엇이 얼어야 하나', () => {
  const rows = [
    row({ date: '2026-09-02', distance_km: 10 }),
    row({ date: '2026-08-28', distance_km: 20 }),
    row({ date: '2026-08-05', distance_km: 30 })
  ]
  const card = (period: DataCardSpec['period']): DataCardSpec => ({
    kind: 'single',
    title: '거리',
    metric: 'distanceKm',
    period,
    query: query()
  })

  it('rolling 은 매일 창이 밀린다', () => {
    const spec = card({ kind: 'rolling', lastDays: 7 })
    // 9/3 기준 7일 = 8/28~9/3 → 9/2(10) + 8/28(20)
    expect(computeDataCard(spec, rows, new Date('2026-09-03T00:00:00')).value).toBe(30)
    // 8/30 기준 7일 = 8/24~8/30 → 8/28(20) 만. 창이 밀리며 다른 값이 된다.
    expect(computeDataCard(spec, rows, new Date('2026-08-30T00:00:00')).value).toBe(20)
  })

  it('calendar 는 달력 경계부터 오늘까지 — 달이 바뀌면 리셋된다("이번 달 누적"의 뜻)', () => {
    const spec = card({ kind: 'calendar', unit: 'month' })
    // 9/3: 9월분만(10). 8/30: 8월분만(20+30).
    expect(computeDataCard(spec, rows, new Date('2026-09-03T00:00:00')).value).toBe(10)
    expect(computeDataCard(spec, rows, new Date('2026-08-30T00:00:00')).value).toBe(50)
  })

  it('fixed 는 언제 열어도 같다 — 지난 기간 기록이 흔들리면 안 된다', () => {
    const spec = card({ kind: 'fixed', from: '2026-08-01', to: '2026-08-31' })
    expect(computeDataCard(spec, rows, new Date('2026-09-03T00:00:00')).value).toBe(50)
    expect(computeDataCard(spec, rows, new Date('2027-01-01T00:00:00')).value).toBe(50)
  })

  it('"이번 달"과 "최근 한 달"은 다르다 — 월초에 갈린다', () => {
    const calendar = card({ kind: 'calendar', unit: 'month' })
    const rolling = card({ kind: 'rolling', lastDays: 30 })
    const monthStart = new Date('2026-09-01T00:00:00')
    // 9/1: 이번 달은 9월분이 아직 없어 null. 최근 30일은 8월 러닝을 그대로 포함한다(20+30).
    // 9/2 러닝은 '오늘(9/1)' 이후라 rolling 상한에 걸려 빠진다 — 그게 "최근 30일"의 뜻이다.
    expect(computeDataCard(calendar, rows, monthStart).value).toBeNull()
    expect(computeDataCard(rolling, rows, monthStart).value).toBe(50)
  })

  it('고정 기간이라도 날짜가 뒤집혔거나 형식이 아니면 거부한다', () => {
    expect(validateDataCardSpec(card({ kind: 'fixed', from: '2026-08-31', to: '2026-08-01' })).ok).toBe(false)
    expect(validateDataCardSpec(card({ kind: 'fixed', from: '8월', to: '8월' })).ok).toBe(false)
    expect(validateDataCardSpec(card({ kind: 'fixed', from: '2026-08-01', to: '2026-08-31' })).ok).toBe(true)
  })

  it('레거시 window 로 저장된 카드도 계속 돈다', () => {
    const legacy = { kind: 'single', title: '거리', metric: 'distanceKm', window: { lastDays: 7 }, query: query() } as DataCardSpec
    expect(computeDataCard(legacy, rows, new Date('2026-09-03T00:00:00')).value).toBe(30)
  })
})

/**
 * #767 — 되묻기 통로(2026-09-03). 도구 호출을 강제한 뒤 코치에게 물어볼 여지가 없어져
 * **애매하면 되묻는 대신 추측**하게 됐다. 강제는 유지하고 도구 안에 질문 경로를 뒀다.
 * 되묻는 턴에는 카드를 만들면 안 되고, 그 판단을 프롬프트에 맡기면 샌다 — 그래서 정규화가 먼저 가른다.
 */
describe('되묻기 경로', () => {
  it('clarify 가 있으면 카드를 만들지 않고 질문만 돌려준다', () => {
    const result = normalizeDataCardProposalArgs({
      clarify: '주간 볼륨은 거리 기준인가요, 시간 기준인가요?',
      title: null,
      kind: null,
      metric: null,
      query: null
    })
    expect(result).toEqual({ clarify: '주간 볼륨은 거리 기준인가요, 시간 기준인가요?' })
    expect('spec' in result).toBe(false)
  })

  it('clarify 가 비어 있으면 평소대로 카드를 만든다 — 물어볼 게 없으면 묻지 않는다', () => {
    const result = normalizeDataCardProposalArgs({
      clarify: '   ',
      title: '토요일 LSD',
      kind: 'single',
      metric: 'distanceKm',
      query: { filters: [{ field: 'weekday', op: 'eq', value: '토' }], groupBy: 'none', metrics: ['distanceKm'] },
      period: { kind: 'rolling', lastDays: 28 }
    })
    expect('spec' in result).toBe(true)
    if ('spec' in result) expect(result.spec.title).toBe('토요일 LSD')
  })
})

/**
 * 요약 탭 사용자 정의 데이터 카드(#767) — **스펙 → 숫자**를 결정론으로 계산한다.
 *
 * 대화로 만든 카드는 등록 때 LLM 이 스펙으로 한 번 번역하고, 그 뒤 화면을 열 때마다는 이 모듈이 계산한다.
 * 매번 LLM 을 부르면 원가가 감당이 안 되고(입력이 원가의 95%, #661), 무엇보다 **같은 카드의 숫자가 흔들린다**.
 * 값이 흔들리면 신뢰가 무너진다.
 *
 * ⚠ **카드는 수치만 말한다**(2026-09-03 결정). 임계값·경고·판정 색을 붙이지 않는다 —
 *   근거 없는 수치를 단언해 신뢰를 깬 전례가 있다(심박 상한 오답, 2026-08-04). 해석은 사용자 몫이고,
 *   근거가 확보된 판정은 카드가 아니라 코치 모먼트로 올린다.
 *   단 표본 부족·값 없음 같은 **사실 표기**는 판정이 아니라 정직성이라 남긴다.
 */

import {
  runQueryRunsCore,
  type QueryRunsFailureKind,
  type QueryRunsMetric,
  type QueryRunsRow,
  type QueryRunsSpec
} from './queryRunsCore.ts'

/**
 * 카드 스펙. 조회 하나(single)거나, **같은 축으로 묶은 두 조회의 비율**(ratio)이다.
 * ratio 를 둔 이유: 사용자가 원한 "주간 총 볼륨 대비 LSD 볼륨" 은 조회 하나로는 안 된다(나눗셈이 없다).
 * 임의 수식을 열지 않고 **합성 한 종류만** 둔다 — 닫힌 어휘를 유지해야 검증이 가능하다.
 */
export type DataCardSpec =
  | { kind: 'single'; title: string; query: QueryRunsSpec; metric: QueryRunsMetric }
  | { kind: 'ratio'; title: string; numerator: QueryRunsSpec; denominator: QueryRunsSpec; metric: QueryRunsMetric; display: 'percent' | 'times' }

export type DataCardValue = {
  /** 표시할 값. 계산 불가면 null — 화면은 '—' 로 낸다(0 으로 보여주면 거짓말이 된다). */
  value: number | null
  /** 값에 붙는 단위(km·분·%·배 등). 없으면 빈 문자열. */
  unit: string
  /** 표본 수(러닝 건수) — 적을 때 사실을 밝히기 위해. */
  matchedRuns: number
  /** 계산이 불완전한 이유. 판정이 아니라 사실이다. */
  failureKind: QueryRunsFailureKind | null
}

const METRIC_UNITS: Partial<Record<QueryRunsMetric, string>> = {
  distanceKm: 'km',
  durationSec: '초',
  activeEnergyKcal: 'kcal',
  elevationGainM: 'm',
  avgPaceSec: '초/km',
  avgHeartRate: 'bpm',
  maxHeartRate: 'bpm',
  cadence: 'spm',
  count: '회'
}

/** 검증 — 닫힌 어휘 밖이면 거부 이유를 돌려준다(조용히 무시하지 않는다). */
export function validateDataCardSpec(spec: DataCardSpec): { ok: true } | { ok: false; error: string } {
  if (!spec.title.trim()) return { ok: false, error: '카드 이름이 비어 있습니다.' }
  if (spec.kind === 'single') return { ok: true }
  // 비율은 같은 축으로 묶여야 비교가 성립한다(주 대 주). 축이 다르면 숫자가 의미를 잃는다.
  if (spec.numerator.groupBy !== spec.denominator.groupBy) {
    return { ok: false, error: '비율은 분자와 분모를 같은 기준으로 묶어야 합니다.' }
  }
  // 지표가 섞이면(거리 ÷ 시간) 단위가 사라진다.
  if (!spec.numerator.metrics.includes(spec.metric) || !spec.denominator.metrics.includes(spec.metric)) {
    return { ok: false, error: '비율의 분자와 분모는 같은 지표여야 합니다.' }
  }
  return { ok: true }
}

/** 스펙과 러닝 행으로 카드 값을 만든다. 순수 함수 — 같은 입력이면 언제나 같은 값. */
export function computeDataCard(spec: DataCardSpec, rows: QueryRunsRow[]): DataCardValue {
  if (spec.kind === 'single') {
    const result = runQueryRunsCore(spec.query, rows)
    const first = result.rows[0]
    const raw = first ? first[spec.metric] : null
    return {
      value: typeof raw === 'number' ? raw : null,
      unit: METRIC_UNITS[spec.metric] ?? '',
      matchedRuns: result.matchedRuns,
      failureKind: result.failureKind
    }
  }

  const numerator = runQueryRunsCore(spec.numerator, rows)
  const denominator = runQueryRunsCore(spec.denominator, rows)
  const top = sumMetric(numerator.rows, spec.metric)
  const bottom = sumMetric(denominator.rows, spec.metric)

  // 분모 0 을 0% 로 보여주면 거짓말이 된다 — 계산 불가로 남긴다.
  if (bottom === null || bottom === 0 || top === null) {
    return {
      value: null,
      unit: spec.display === 'percent' ? '%' : '배',
      matchedRuns: denominator.matchedRuns,
      failureKind: denominator.failureKind ?? numerator.failureKind ?? 'no_matching_runs'
    }
  }

  const ratio = top / bottom
  return {
    value: round(spec.display === 'percent' ? ratio * 100 : ratio),
    unit: spec.display === 'percent' ? '%' : '배',
    // 표본은 **분모**(전체) 기준이다 — 비율의 신뢰도는 전체 표본이 정한다.
    matchedRuns: denominator.matchedRuns,
    failureKind: denominator.failureKind ?? numerator.failureKind
  }
}

/** 그룹이 여럿이면 합쳐서 하나로 — 카드는 숫자 한 개다(그룹별 표는 상세 화면 몫). */
function sumMetric(rows: Array<Record<string, string | number | null>>, metric: QueryRunsMetric): number | null {
  const values = rows.map((row) => row[metric]).filter((value): value is number => typeof value === 'number')
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * 웹 ↔ 데이터 카드 코어 어댑터(#767).
 *
 * 요약 탭 사용자 카드는 **코치 답변과 같은 숫자**를 말해야 한다. 그래서 계산기를 새로 짜지 않고
 * Edge 와 같은 파일(`supabase/functions/_shared/`)을 그대로 쓴다 — 이 저장소가 겪은 미러 두 벌 문제
 * (vdotPaces ↔ deriveCoachPaceModel)를 되풀이하지 않기 위해서다. 이 파일이 하는 일은 **모양 맞추기뿐**이다.
 *
 * 서버 왕복이 없다: 러닝은 이미 스토어에 전부 있고 웹 모델이 Edge 와 같은 필드를 갖는다.
 */
import {
  computeDataCard,
  validateDataCardSpec,
  type DataCardSpec,
  type DataCardValue
} from '../../../../supabase/functions/_shared/dataCard.ts'
import type { QueryRunsRow } from '../../../../supabase/functions/_shared/queryRunsCore.ts'

export type { DataCardSpec, DataCardValue }
export { validateDataCardSpec }

/**
 * 입력 러닝 — entities 의 RunLog 를 **import 하지 않고** 필요한 필드만 구조적으로 받는다(#397 래칫).
 * shared 가 domain 을 알면 의존 방향이 뒤집힌다. 호출부(페이지)가 RunLog 를 그대로 넘기면 구조가 맞는다.
 */
export type DataCardRunInput = {
  date: string
  type?: string | null
  startAt?: string | null
  distanceKm?: number | null
  durationSec?: number | null
  avgPaceSec?: number | null
  avgHeartRate?: number | null
  maxHeartRate?: number | null
  cadence?: number | null
  activeEnergyKcal?: number | null
  temperature?: number | null
  humidity?: number | null
  windMps?: number | null
  elevationGainM?: number | null
  elevationLossM?: number | null
  courseType?: string | null
  rpe?: number | null
  sleepQuality?: number | null
  conditionScore?: number | null
  stressLevel?: number | null
  companion?: string | null
}

/** 웹 RunLog → 코어 입력 행(스네이크 케이스). 값이 없으면 null 로 — 0 으로 채우면 평균이 거짓이 된다. */
export function toQueryRunsRow(run: DataCardRunInput): QueryRunsRow {
  return {
    date: run.date,
    start_at: run.startAt ?? null,
    type: run.type ?? null,
    distance_km: numberOrNull(run.distanceKm),
    duration_sec: numberOrNull(run.durationSec),
    avg_pace_sec: numberOrNull(run.avgPaceSec),
    avg_heart_rate: numberOrNull(run.avgHeartRate),
    max_heart_rate: numberOrNull(run.maxHeartRate),
    cadence: numberOrNull(run.cadence),
    active_energy_kcal: numberOrNull(run.activeEnergyKcal),
    temperature: numberOrNull(run.temperature),
    humidity: numberOrNull(run.humidity),
    wind_mps: numberOrNull(run.windMps),
    elevation_gain_m: numberOrNull(run.elevationGainM),
    elevation_loss_m: numberOrNull(run.elevationLossM),
    course_type: run.courseType ?? null,
    rpe: numberOrNull(run.rpe),
    sleep_quality: numberOrNull(run.sleepQuality),
    condition_score: numberOrNull(run.conditionScore),
    stress_level: numberOrNull(run.stressLevel),
    companion: run.companion ?? null
  }
}

/** 카드 하나의 값. 화면은 이 결과만 보면 된다. */
export function computeDataCardFromRuns(spec: DataCardSpec, runs: DataCardRunInput[]): DataCardValue {
  return computeDataCard(spec, runs.map(toQueryRunsRow))
}

/**
 * 표시 문자열. 값이 없으면 '—' — 0 으로 보여주면 "없음"과 "0"이 구분되지 않는다.
 * ⚠ 판정 문구를 붙이지 않는다(2026-09-03 결정: 카드는 수치만, 해석은 사용자 몫).
 */
export function formatDataCardValue(value: DataCardValue): string {
  if (value.value === null) return '—'
  return `${value.value}${value.unit}`
}

/**
 * 카드 아래 한 줄. **무엇을 기준으로 낸 값인지**를 말한다 — 판정이 아니라 사실이다.
 * 묶어서 평균한 값이면 "최근 4주 기준"처럼 묶음을 밝힌다. 표본 수만 말하면 사용자는
 * "주간 비중 평균"의 평균 대상이 몇 주인지 알 수 없다(2026-09-03 지적).
 */
export function describeDataCardBasis(value: DataCardValue): string {
  if (value.matchedRuns === 0) return '해당 기록 없음'
  const unit = GROUP_UNITS[value.groupBy]
  if (value.groupCount > 0 && unit) return `최근 ${value.groupCount}${unit} 기준`
  return `러닝 ${value.matchedRuns}건 기준`
}

const GROUP_UNITS: Record<string, string> = {
  week: '주',
  month: '개월'
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

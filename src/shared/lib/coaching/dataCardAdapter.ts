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
  // display 는 계산 쪽이 만든다 — 페이스는 분:초다(`565초/km` 는 사람이 못 읽는다).
  return `${value.display}${value.unit}`
}

/**
 * 카드 아래 한 줄. **무엇을 기준으로 낸 값인지**를 말한다 — 판정이 아니라 사실이다.
 * 묶어서 평균한 값이면 "최근 4주 기준"처럼 묶음을 밝힌다. 표본 수만 말하면 사용자는
 * "주간 비중 평균"의 평균 대상이 몇 주인지 알 수 없다(2026-09-03 지적).
 */
export function describeDataCardBasis(value: DataCardValue): string {
  if (value.matchedRuns === 0) return '해당 기록 없음'
  const requested = describeWindow(value)
  const unit = GROUP_UNITS[value.groupBy]

  if (value.groupCount > 0 && unit) {
    /*
      요청한 창과 실제 평균한 묶음 수는 다를 수 있다 — 안 뛴 주는 분모가 없어 평균에서 빠진다.
      "최근 3주"만 쓰면 4주를 요청한 사용자에겐 **창이 바뀐 것처럼** 보인다(2026-09-03 지적).
      그래서 요청을 앞에 두고 실제를 괄호처럼 뒤에 붙인다.
    */
    const requestedGroups = value.period?.kind === 'calendar' ? null : expectedGroupCount(value.windowDays, value.groupBy)
    if (requested && requestedGroups && requestedGroups !== value.groupCount) {
      return `${requested} 중 ${value.groupCount}${unit} 기준`
    }
    return `${requested || `최근 ${value.groupCount}${unit}`} 기준`
  }
  if (requested) return `${requested} · 러닝 ${value.matchedRuns}건`
  return `러닝 ${value.matchedRuns}건 기준`
}

const GROUP_UNITS: Record<string, string> = {
  week: '주',
  month: '개월'
}

/**
 * 기간을 사람 말로. **사용자가 말한 방식 그대로** 되돌려준다 — "이번 달"을 "최근 30일"로 바꿔 쓰면
 * 값이 맞아도 다른 걸 답한 것처럼 읽힌다.
 */
function describeWindow(value: DataCardValue): string {
  const period = value.period ?? (value.windowDays ? ({ kind: 'rolling', lastDays: value.windowDays } as const) : null)
  if (!period) return ''
  if (period.kind === 'rolling') {
    const days = period.lastDays
    if (days % 7 === 0) return `최근 ${days / 7}주`
    if (days % 30 === 0) return `최근 ${days / 30}개월`
    return `최근 ${days}일`
  }
  if (period.kind === 'calendar') {
    return period.unit === 'week' ? '이번 주' : period.unit === 'month' ? '이번 달' : '올해'
  }
  // 고정 기간은 같은 달이면 "8월", 아니면 시작~끝. 얼어 있다는 사실이 문구로 드러나야 한다.
  const [fy, fm] = period.from.split('-')
  const [ty, tm] = period.to.split('-')
  if (fy === ty && fm === tm) return `${Number(fm)}월`
  return `${period.from} ~ ${period.to}`
}

/** 요청한 창에 묶음이 몇 개 들어가는지(주/개월). 실제와 다르면 둘 다 보여준다. */
function expectedGroupCount(windowDays: number | null, groupBy: string): number | null {
  if (!windowDays) return null
  if (groupBy === 'week') return Math.round(windowDays / 7)
  if (groupBy === 'month') return Math.round(windowDays / 30)
  return null
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

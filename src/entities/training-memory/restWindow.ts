import type { ActiveRest, RestReason } from './model'

/**
 * 휴식 선언(#473)의 현재 상태를 today 기준으로 파생한다. 순수 함수 — 닦달 차단은 세션 status='rested'
 * 가 담당하고, 이건 차분한 "쉬는 중 · 복귀 D-N" 배너·복귀일 감지·대안 제시 조건에만 쓴다.
 *
 * 위치: ActiveRest(training-memory 엔티티) 위의 도메인 파생이라 엔티티층에 둔다(#397 — shared 에 도메인 쌓지 않기).
 *
 * - active: 오늘이 휴식 구간[startDate, untilDate] 안인가(지금 쉬는 중).
 * - returnDate: 복귀일 = untilDate + 1일.
 * - daysUntilReturn: 복귀까지 남은 일수(오늘=untilDate 면 1=D-1, 복귀일이면 0).
 * - isReturnDay: 오늘이 복귀일인가("회복 후 정리" 톤 트리거).
 * - isOver: 복귀일을 이미 지났는가(휴식 메타 정리 대상).
 */
export type RestState = {
  active: boolean
  reason: RestReason | null
  startDate: string | null
  untilDate: string | null
  returnDate: string | null
  daysUntilReturn: number | null
  isReturnDay: boolean
  isOver: boolean
  /** 휴식 기간 일수([startDate..untilDate] 포함). >28(4주)이면 복귀 시 목표 재점검(SSOT 디트레이닝 4주 경계). */
  durationDays: number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** b 에서 a 까지의 일수(a - b). 둘 다 YYYY-MM-DD. */
function diffDaysIso(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / MS_PER_DAY)
}

const INACTIVE: RestState = {
  active: false,
  reason: null,
  startDate: null,
  untilDate: null,
  returnDate: null,
  daysUntilReturn: null,
  isReturnDay: false,
  isOver: false,
  durationDays: null
}

export function deriveRestState(activeRest: ActiveRest | null | undefined, today: string): RestState {
  if (!activeRest) return INACTIVE
  const { startDate, untilDate, reason } = activeRest
  const returnDate = addDaysIso(untilDate, 1)
  return {
    active: today >= startDate && today <= untilDate,
    reason,
    startDate,
    untilDate,
    returnDate,
    daysUntilReturn: diffDaysIso(returnDate, today),
    isReturnDay: today === returnDate,
    isOver: today > untilDate,
    durationDays: diffDaysIso(untilDate, startDate) + 1
  }
}

/**
 * "완전 휴식 대신 가벼운 회복주" 대안을 1회 제시해도 되는가 (SSOT §휴식과 복귀).
 * 부하 경감(회복주)이 완전 중단보다 디트레이닝 회피에 우월(Mujika & Padilla):
 * - 통제 가능한 비의료 휴식(weather·personal)은 안전하게 제시 가능.
 * - injury 휴식은 부하성 경증(severity 1~2)일 때만.
 * - 'other'(불명·의료 가능성)는 보수적으로 제시하지 않는다.
 *
 * 안전 오버라이드(이유 불문): 공존하는 활성 부상의 severity ≥ 3(통증·redFlag로 멈춰야 하는 수준)이면
 * 부상 KB 게이트가 완전 휴식을 우선하므로 제시하지 않는다 — 날씨·일정으로 쉬더라도 강한 부상이 있으면
 * 달리라고 권하지 않는다. injurySeverity 는 "휴식 시점에 공존하는 활성 부상의 강도"다(없으면 0/불명).
 * ⚠ injury 휴식인데 등록된 활성 부상이 없어 severity 가 불명(0/null)이면 보수적으로 미제시한다.
 */
export function shouldOfferRecoveryRun(
  reason: RestReason | null | undefined,
  injurySeverity: number | null | undefined
): boolean {
  const sev = injurySeverity ?? 0
  if (sev >= 3) return false
  if (reason === 'weather' || reason === 'personal') return true
  if (reason === 'injury') return sev >= 1 && sev <= 2
  return false
}

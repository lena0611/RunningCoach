/**
 * 복귀 램프(#473 Phase 2, SSOT §휴식과 복귀 "복귀 시점 처방").
 *
 * 휴식 후 복귀 초반 세션의 거리 상한을 결정론으로 정한다:
 *   단일 세션 거리 ≤ 직전 30일 최장 런 +10% (BJSM 2025 Garmin 5,205명; 매 세션 규칙, 1회성 아님).
 * 휴식 후엔 "직전 30일 최장"이 작거나 0이라 상한이 자연히 짧아지고, 이 상한이 주차별 %를 따로 정하지
 * 않아도 램프를 스스로 통제한다(긴 휴식일수록 더 보수적). ⚠ "첫 주 -X%/주 +Y%" 같은 단일 권위 수치는
 * 검증된 출처에 없어 단정하지 않는다 — 세션 상한 + 복귀 윈도(초반 N개 세션 Easy화)를 1차 가드레일로 쓴다.
 *
 * 디트레이닝 4주 경계 차등(SSOT 라인 84): 휴식이 길수록 더 많은 초반 세션을 낮춘다(windowSessions).
 *
 * ⚠ 범위: 부상 복귀의 walk-run 점진 처방(걷기-뛰기 5단계, injury KB §3-B·SSOT 라인 89)은 이 코어 램프 밖이다(후속 PR).
 * 현재는 reason(injury/weather/personal) 무관하게 동일한 "Easy + 거리 캡" 거리 램프를 적용한다 — injury 복귀자도
 * walk-run 게이트가 들어오기 전까지는 run-only 거리 캡만 받는 공백이 있다(통증·redFlag 시 부상 KB 우선은 별도, SSOT 라인 87).
 * 순수 함수(엔티티 의존 없음). 최장 런 집계(getLongestRunKmWithinDays)는 runStats 에 둔다(#397 경계).
 */

/**
 * 디트레이닝이 무시할 수준인 단기 휴식 경계(일). 이 미만이면 램프 미적용(원래 계획대로 이어간다).
 * 근거: SSOT 라인 84 "단기 손실의 대부분은 혈장량·혈액량 수축이라 복귀 며칠 내 회복"(미토콘드리아 효소 반감기 ~12일).
 * 7은 SSOT 의 "며칠"을 운영값으로 고정한 것이다(정확한 일수는 SSOT 에 없음 — 라인 85 "단일 권위 수치는 검증 출처에 없다" 정합).
 */
export const RETURN_RAMP_MIN_LAYOFF_DAYS = 7
/** >4주(디트레이닝 장기 경계, SSOT 라인 84) — 복귀 처방을 더 낮춘다(초반 세션 더 많이 캡). */
export const RETURN_LONG_LAYOFF_DAYS = 28
/** 직전 30일에 런이 없을 때(긴 완전 휴식) 복귀 첫 세션 거리의 보수적 기본 상한(km). floor 아닌 ceiling(min 으로 적용). */
export const RETURN_EMPTY_WINDOW_CAP_KM = 3
/** 직전 30일 최장 런 대비 상한 배수(+10%). */
export const RETURN_CAP_MULTIPLIER = 1.1

/**
 * 복귀 초반 세션 거리 상한(km) = 직전30일 최장 런 +10%. 윈도가 비면(0) 보수적 기본 상한.
 * 소수 첫째 자리 반올림. (상한이므로 원래 처방이 더 짧으면 그대로 둔다 — capReturnEarlySessions 의 min.)
 */
export function returnSessionCapKm(maxPrev30Km: number): number {
  if (maxPrev30Km > 0) return Math.round(maxPrev30Km * RETURN_CAP_MULTIPLIER * 10) / 10
  return RETURN_EMPTY_WINDOW_CAP_KM
}

/**
 * 휴식 길이별로 복귀 초반에 Easy·캡으로 낮출 세션 수(디트레이닝 4주 경계 차등, SSOT 라인 84·89).
 * <7일: 0(단기 손실 무시 수준 → 원래 계획대로). 7~27일: 2. ≥28일(>4주): 3(더 보수적으로 더 많이 낮춤).
 */
export function returnRampWindowSessions(layoffDays: number): number {
  if (layoffDays < RETURN_RAMP_MIN_LAYOFF_DAYS) return 0
  if (layoffDays >= RETURN_LONG_LAYOFF_DAYS) return 3
  return 2
}

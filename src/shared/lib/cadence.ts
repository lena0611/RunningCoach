// 양발 총 케이던스(spm)의 정상 범위. inferRunType.ts의 isUsableCadence와 동일 기준을 공유한다.
export const MIN_PLAUSIBLE_CADENCE = 120
export const MAX_PLAUSIBLE_CADENCE = 230

/**
 * 케이던스 원시값을 양발 총 케이던스(spm)로 방어 정규화한다.
 *
 * 소스(특히 HealthKit 네이티브 브리지)는 케이던스 단위가 일관되지 않다.
 * - 한쪽 다리 값으로 보이는 낮은 값(<120)은 ×2로 양발 총합 보정
 * - 이중 계산으로 보이는 높은 값(>230)은 ÷2로 보정
 *
 * 단순 ×2/÷2 단위 오류로 정상 범위에 들어오지 않는 값(예: per-lap 걸음 수처럼
 * 자릿수 자체가 다른 값)은 신뢰할 수 없으므로 표시·집계에서 제외하도록 null을 반환한다.
 */
export function sanitizeCadence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value >= MIN_PLAUSIBLE_CADENCE && value <= MAX_PLAUSIBLE_CADENCE) return Math.round(value)
  const corrected = value < MIN_PLAUSIBLE_CADENCE ? value * 2 : value / 2
  return corrected >= MIN_PLAUSIBLE_CADENCE && corrected <= MAX_PLAUSIBLE_CADENCE ? Math.round(corrected) : null
}

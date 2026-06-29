// 메모리에 모은 완주 기록(초 단위) 배열에서 비식별 퍼센타일 컷을 계산한다.
// 원본 row는 절대 저장하지 않는다 — 입력 배열은 호출부가 메모리에서만 들고 있다가 버린다.
//
// 보간 방식은 type-7(numpy 기본)과 동일한 선형보간 분위수다. 제품의
// raceBenchmark.interpolatePercentile 도 컷 사이를 선형보간하므로 산출 방식과 소비 방식이 일관된다.

/** 느린쪽 꼬리(p95/p99)와 빠른쪽(p2.5)까지 포함한 촘촘한 컷. */
export const DEFAULT_PERCENTILES = [1, 2.5, 5, 10, 25, 50, 75, 90, 95, 99]

/**
 * @param {number[]} values 완주 기록(초)
 * @param {number[]} percentiles 0~100
 * @returns {{percentile:number,durationSec:number}[]}
 */
export function percentileCuts(values, percentiles = DEFAULT_PERCENTILES) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  return percentiles.map((p) => ({ percentile: p, durationSec: quantile(sorted, p / 100) }))
}

/** type-7 선형보간 분위수. sorted는 오름차순. q는 0~1. */
function quantile(sorted, q) {
  const n = sorted.length
  if (n === 1) return Math.round(sorted[0])
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const frac = pos - lo
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * frac)
}

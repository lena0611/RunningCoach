// 3-윈도우 중앙값 대비 이 값(m)을 넘게 튀는 단일 고도 샘플을 GPS 이상치(스파이크)로 본다.
// GPS/기압 고도 노이즈는 보통 10m 미만이고, 실제 언덕은 이웃 샘플도 함께 변해 중앙값 편차가 작다.
export const ALTITUDE_SPIKE_THRESHOLD_M = 12

type AltitudeSample = { offsetSec: number; altitude: number | null }

/**
 * 고도 시리즈에서 단일 샘플 GPS 스파이크를 방어 정규화한다(#244, 케이던스 sanitizeCadence와 동일 취지).
 *
 * 각 내부 샘플을 자신을 포함한 3-윈도우([i-1, i, i+1])의 중앙값과 비교해, 편차가
 * ALTITUDE_SPIKE_THRESHOLD_M를 넘으면 중앙값으로 대체한다. 평탄 코스가 -27m로 푹 꺼지는
 * 단일 스파이크를 제거해 차트 범위·course type(altitudeRange) 분류 왜곡을 막는다.
 *
 * 중앙값에 자기 자신을 포함하므로, 좋은 샘플은 옆에 스파이크가 있어도 오염되지 않는다
 * (median([17,18,-27])=17이라 18은 유지, median([18,-27,18])=18이라 -27만 교정).
 * 첫/끝 샘플과 null은 그대로 둔다. 2개 이상 연속 스파이크는 완전히 잡지 못한다(후속 과제).
 */
export function sanitizeAltitudeSeries<T extends AltitudeSample>(points: T[]): T[] {
  if (points.length < 3) return points
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point
    const center = point.altitude
    if (typeof center !== 'number' || !Number.isFinite(center)) return point

    const window = [points[index - 1].altitude, center, points[index + 1].altitude].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    )
    if (window.length < 2) return point

    const med = median(window)
    if (Math.abs(center - med) <= ALTITUDE_SPIKE_THRESHOLD_M) return point
    return { ...point, altitude: Math.round(med * 10) / 10 }
  })
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

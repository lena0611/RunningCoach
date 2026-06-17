/**
 * 관측 기반 Easy 페이스 보정 (#405, A안).
 *
 * VDOT(특히 워치 VO2max 추정)로 환산한 Easy 페이스는 실제 심박과 충돌할 수 있다
 * (페이스대로 뛰면 Easy 심박 상한 초과). 그래서 **사용자가 실제로 Easy 심박 이하에서 뛴 페이스**를
 * 학습해 처방한다 — 추정(estimate)이 아니라 관측(measured)이라 심박과 싸우지 않는다.
 *
 * 순수 로직. running-coaching-standards: 페이스는 보조, 강도(심박/RPE)가 정본. measured > estimate.
 */

import type { RunLog } from '@/entities/run/model'

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** 최근 이 기간 내 런만 본다(체력 변화 반영). */
const WINDOW_DAYS = 90
/** 신뢰할 최소 표본 수. 그 미만이면 null(추정 폴백). */
const MIN_SAMPLES = 3
/** 워밍업/짧은 구간 노이즈 제외 최소 거리. */
const MIN_DISTANCE_KM = 2

export type ObservedEasyPace = {
  /** 대표 Easy 페이스(중앙값, sec/km). */
  easyPaceSec: number
  /** 권장 구간 [느린, 빠른] (sec/km) — 기존 PaceModel.easyPaceRangeSec 규약과 동일. */
  easyPaceRangeSec: [number, number]
  /** 표본 런 수. */
  sampleCount: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * 최근 런 중 **평균 심박이 Easy 상한 이하**(= 진짜 Easy 효력)였던 런들의 페이스 중앙값을 구한다.
 * 표본이 부족하거나 상한이 없으면 null → 호출부는 기존 VDOT 추정으로 폴백.
 */
export function deriveObservedEasyPace(
  runs: RunLog[],
  easyCeilingBpm: number | null,
  today: Date
): ObservedEasyPace | null {
  if (!easyCeilingBpm) return null
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const since = start.getTime() - (WINDOW_DAYS - 1) * MS_PER_DAY

  const paces = runs
    .filter(
      (r) =>
        r.avgHeartRate != null &&
        r.avgHeartRate > 0 &&
        r.avgHeartRate <= easyCeilingBpm &&
        (r.durationSec ?? 0) > 0 &&
        (r.distanceKm ?? 0) >= MIN_DISTANCE_KM &&
        new Date(`${r.date}T00:00:00`).getTime() >= since
    )
    .map((r) => r.durationSec! / r.distanceKm)

  if (paces.length < MIN_SAMPLES) return null

  const mid = Math.round(median(paces))
  // 관측 중앙값 ±5% 의 보수적 권장 구간([느린, 빠른]).
  return {
    easyPaceSec: mid,
    easyPaceRangeSec: [Math.round(mid * 1.05), Math.round(mid * 0.95)],
    sampleCount: paces.length
  }
}

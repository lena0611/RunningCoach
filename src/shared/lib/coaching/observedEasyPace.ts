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
 * 최근 런 중 **진짜 Easy 효력**이었던 런들의 페이스 중앙값을 구한다.
 *
 * 1차로 "Easy 심박존(Z2: 회복 상한 초과 ~ 이지 상한 이하)" 런만 쓴다 — 회복(아주 느린) 런이
 * 중앙값을 과하게 느리게 끌어내리는 걸 막는다(#405 정밀화). Z2 표본이 부족하면 "이지 상한 이하 전체"로
 * 폴백(여전히 심박 안전), 그것도 부족하면 null(→ 호출부 VDOT 추정 폴백).
 */
export function deriveObservedEasyPace(
  runs: RunLog[],
  easyCeilingBpm: number | null,
  today: Date,
  /** 회복존 상한(Z1 top). 주면 Z2 밴드(이 값 초과 ~ easyCeiling)로 좁혀 더 정확한 Easy 페이스를 뽑는다. */
  recoveryCeilingBpm: number | null = null
): ObservedEasyPace | null {
  if (!easyCeilingBpm) return null
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const since = start.getTime() - (WINDOW_DAYS - 1) * MS_PER_DAY

  const inPool = (r: RunLog) =>
    r.avgHeartRate != null &&
    r.avgHeartRate > 0 &&
    r.avgHeartRate <= easyCeilingBpm &&
    (r.durationSec ?? 0) > 0 &&
    (r.distanceKm ?? 0) >= MIN_DISTANCE_KM &&
    new Date(`${r.date}T00:00:00`).getTime() >= since

  const pool = runs.filter(inPool)
  // Z2(진짜 Easy) 밴드 우선 — 회복존 런 제외. 부족하면 이지 상한 이하 전체로 폴백.
  const z2 = recoveryCeilingBpm ? pool.filter((r) => (r.avgHeartRate as number) > recoveryCeilingBpm) : pool
  const chosen = z2.length >= MIN_SAMPLES ? z2 : pool
  if (chosen.length < MIN_SAMPLES) return null

  const paces = chosen.map((r) => r.durationSec! / r.distanceKm)
  const mid = Math.round(median(paces))
  // 관측 중앙값 ±5% 의 보수적 권장 구간([느린, 빠른]).
  return {
    easyPaceSec: mid,
    easyPaceRangeSec: [Math.round(mid * 1.05), Math.round(mid * 0.95)],
    sampleCount: chosen.length
  }
}

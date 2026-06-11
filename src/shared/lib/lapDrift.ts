import type { RunLog } from '@/entities/run/model'

/**
 * 랩 기반 후반 드리프트(페이스 급락 + 심박 상승) 평가 — 순수 로직.
 *
 * trendInsights(품질 렌즈)와 tempoAdaptation(Tempo 등급·적응)이 같은 기준으로 후반 안정성을
 * 판정하도록 단일 출처로 둔다. level: 0 안정 / 1 경미 / 2 주의 / 3 심각.
 */

export type LapDrift = {
  level: 0 | 1 | 2 | 3
  heartRateDriftBpm: number | null
  paceDeltaSec: number | null
}

// 후반 급락 임계(초/km)와 심박 드리프트 임계(bpm). trendInsights 기존 값과 동일.
const LATE_FADE_PACE_SEC = 18
const LARGE_HR_DRIFT_BPM = 10
const MODERATE_HR_DRIFT_BPM = 4

export function evaluateLapDrift(run: RunLog): LapDrift {
  const laps = run.laps.filter((lap) => lap.avgHeartRate && lap.paceSec)
  if (laps.length < 2) return { level: 1, heartRateDriftBpm: null, paceDeltaSec: null }
  const splitIndex = Math.ceil(laps.length / 2)
  const firstHalf = laps.slice(0, splitIndex)
  const secondHalf = laps.slice(splitIndex)
  if (!secondHalf.length) return { level: 1, heartRateDriftBpm: null, paceDeltaSec: null }
  const firstHalfHeartRate = averageNullable(firstHalf.map((lap) => lap.avgHeartRate))
  const secondHalfHeartRate = averageNullable(secondHalf.map((lap) => lap.avgHeartRate))
  const firstHalfPace = weightedLapPace(firstHalf)
  const secondHalfPace = weightedLapPace(secondHalf)
  const heartRateDriftBpm = firstHalfHeartRate !== null && secondHalfHeartRate !== null
    ? Math.round(secondHalfHeartRate - firstHalfHeartRate)
    : null
  const paceDeltaSec = firstHalfPace !== null && secondHalfPace !== null
    ? Math.round(secondHalfPace - firstHalfPace)
    : null
  const largeHeartRateDrift = heartRateDriftBpm !== null && heartRateDriftBpm > LARGE_HR_DRIFT_BPM
  const lateFade = paceDeltaSec !== null && paceDeltaSec >= LATE_FADE_PACE_SEC
  const moderateHeartRateDrift = heartRateDriftBpm !== null && heartRateDriftBpm > MODERATE_HR_DRIFT_BPM
  if (largeHeartRateDrift && lateFade) return { level: 3, heartRateDriftBpm, paceDeltaSec }
  if (largeHeartRateDrift || lateFade) return { level: 2, heartRateDriftBpm, paceDeltaSec }
  if (moderateHeartRateDrift) return { level: 1, heartRateDriftBpm, paceDeltaSec }
  return { level: 0, heartRateDriftBpm, paceDeltaSec }
}

function averageNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  if (!valid.length) return null
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function weightedLapPace(laps: RunLog['laps']): number | null {
  const paceLaps = laps.filter((lap) => lap.paceSec !== null)
  if (!paceLaps.length) return null
  const distance = paceLaps.reduce((sum, lap) => sum + (lap.distanceKm ?? 0), 0)
  if (distance > 0) {
    return paceLaps.reduce((sum, lap) => sum + (lap.paceSec ?? 0) * (lap.distanceKm ?? 0), 0) / distance
  }
  return averageNullable(paceLaps.map((lap) => lap.paceSec))
}

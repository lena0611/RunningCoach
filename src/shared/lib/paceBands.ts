/**
 * 개인 페이스 기준 (#878 A5) — 런 종류 판정(inferRunType)과 Easy 비율이 쓰는 "이 사람에게 빠른/느린 페이스".
 *
 * 예전엔 개발자 페이스가 상수로 박혀 있었다(6:30/km 이하=템포, 8:00 이상=회복, 5:45 이하=스트라이드).
 * 4:50/km 러너는 모든 5km 가 템포·Easy 0%, 8:30/km 초보는 전부 회복이 됐다.
 * 이제 기준 Easy 페이스(E)에 대한 **비율**로 정한다. 비율은 Daniels VDOT 강도 관계에서 왔다
 * (vdotPaces.ts INTENSITY: E 대표 0.70 · 범위 0.62~0.74 · M 0.80 · T 0.88 — 페이스는 강도에 반비례):
 * - easyFloor 0.90E: Easy 범위 빠른 끝(≈0.95E)과 마라톤 페이스(≈0.875E) 사이 — 이보다 빠르게 오래 달리면 Easy 가 아니다.
 * - recoveryFloor 1.12E: Easy 범위 느린 끝(≈1.13E)보다 느리면 회복주.
 * - strideCeiling 0.80E: 역치 페이스(≈0.80E)보다 빠른 짧은 가속만 스트라이드로 본다.
 * 나머지(steady·스트라이드 탐지 클램프)는 예전 상수를 개발자 E(7:10/km)로 나눈 비율을 옮긴 **설계값**이다.
 */

export type PaceBands = {
  /** 기준 Easy 페이스(sec/km). */
  easyPaceSec: number
  /** 이보다 느리거나 같으면 Easy 쪽, 빠르거나 같으면 템포 쪽. */
  easyFloorSec: number
  /** 이보다 느리면 회복주. */
  recoveryFloorSec: number
  /** 스트라이드로 인정하는 가장 느린 가속 페이스. */
  strideCeilingSec: number
  /** Steady Long 판정(랩 없을 때 평균 페이스 상한). */
  steadyAvgCeilingSec: number
  /** Steady Long 판정(랩 페이스 상한). */
  steadyLapCeilingSec: number
  /** 페이스 샘플로 스트라이드를 찾을 때 임계 [가장 빠른, 가장 느린]과 기본값. */
  metricStrideClampSec: [number, number]
  metricStrideDefaultSec: number
  /** 경로 좌표로 가속 구간을 찾을 때 임계 [가장 빠른, 가장 느린]. */
  routeStrideClampSec: [number, number]
}

const RATIO = {
  easyFloor: 0.9,
  recoveryFloor: 1.12,
  strideCeiling: 0.8,
  steadyAvg: 0.93,
  steadyLap: 0.98,
  metricStride: [0.7, 0.85],
  metricStrideDefault: 0.84,
  routeStride: [0.66, 0.81]
} as const

export function paceBandsFor(easyPaceSec: number | null | undefined): PaceBands | null {
  if (typeof easyPaceSec !== 'number' || !Number.isFinite(easyPaceSec) || easyPaceSec <= 0) return null
  const at = (ratio: number) => Math.round(easyPaceSec * ratio)
  return {
    easyPaceSec: Math.round(easyPaceSec),
    easyFloorSec: at(RATIO.easyFloor),
    recoveryFloorSec: at(RATIO.recoveryFloor),
    strideCeilingSec: at(RATIO.strideCeiling),
    steadyAvgCeilingSec: at(RATIO.steadyAvg),
    steadyLapCeilingSec: at(RATIO.steadyLap),
    metricStrideClampSec: [at(RATIO.metricStride[0]), at(RATIO.metricStride[1])],
    metricStrideDefaultSec: at(RATIO.metricStrideDefault),
    routeStrideClampSec: [at(RATIO.routeStride[0]), at(RATIO.routeStride[1])]
  }
}

export type PaceSample = { date: string; distanceKm: number | null; avgPaceSec: number | null; durationSec?: number | null }

const HABITUAL_WINDOW_DAYS = 90
const HABITUAL_MIN_DISTANCE_KM = 1
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 기준 Easy 페이스 — 처방이 쓰는 페이스 모델(관측 Easy > PB VDOT > VO2max)의 E, 없으면 **본인 평소 페이스**
 * (최근 90일 런 평균 페이스의 중앙값). 심박도 기록도 없으면 페이스는 그 사람 기준으로만 빠르다/느리다를 말할 수 있다.
 * 런이 하나뿐이면 그 런 자신이 기준이라 Easy 로 본다(첫 런을 지어낸 강도로 채점하지 않는다).
 */
export function easyPaceReference(modelEasyPaceSec: number | null | undefined, runs: PaceSample[], today: Date): number | null {
  if (typeof modelEasyPaceSec === 'number' && Number.isFinite(modelEasyPaceSec) && modelEasyPaceSec > 0) return modelEasyPaceSec
  return habitualPaceSec(runs, today)
}

export function habitualPaceSec(runs: PaceSample[], today: Date): number | null {
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const since = start.getTime() - (HABITUAL_WINDOW_DAYS - 1) * MS_PER_DAY
  const paces = runs
    .filter((run) => (run.distanceKm ?? 0) >= HABITUAL_MIN_DISTANCE_KM && new Date(`${run.date}T00:00:00`).getTime() >= since)
    .map((run) => run.avgPaceSec ?? (run.durationSec && run.distanceKm ? run.durationSec / run.distanceKm : null))
    .filter((pace): pace is number => typeof pace === 'number' && Number.isFinite(pace) && pace >= 180 && pace <= 900)
    .sort((a, b) => a - b)
  if (!paces.length) return null
  const mid = Math.floor(paces.length / 2)
  return Math.round(paces.length % 2 ? paces[mid] : (paces[mid - 1] + paces[mid]) / 2)
}

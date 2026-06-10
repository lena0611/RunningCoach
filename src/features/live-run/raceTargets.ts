import type { RunLog } from '@/entities/run/model'
import { computeDistancePbs, type DistancePb } from '@/shared/lib/achievement/distancePb'
import { buildGhostCurve, type GhostCurvePoint } from '@/shared/lib/selfRace/ghost'

/**
 * 가상레이싱 `나와의 대결` 거리·상대(고스트) 선택 (#232).
 *
 * 결정(2026-06-09, decision-log): 솔로는 **실력 측정 / 내 베스트 도전** 모드.
 *   타겟 = '없음'(자유 타임트라이얼) 또는 **내 베스트**(거리별 PB) 뿐.
 *   내 베스트 모수 = **훈련·레이싱 전체 통합** 최속 1개(컨텍스트 무관). 단 "출발선부터
 *   누적거리 D 도달 최속"이라 5km 전용 TT가 아니라 "어느 런이든 첫 D km 최속"의 의미.
 *   (업적 PB 사다리의 훈련/레이싱 분리와는 별개 — 여기선 타겟 모수로만 통합 사용.)
 */

const STEP_M = 5000

export type DistanceOption = { distanceM: number; label: string }

export type OpponentKind = 'none' | 'best'

export type OpponentOption = {
  kind: OpponentKind
  /** 'none' 이면 null. */
  runId: string | null
  distanceM: number | null
  elapsedSec: number | null
  avgPaceSec: number | null
  date: string | null
}

function kmLabel(m: number): string {
  const km = m / 1000
  return Number.isInteger(km) ? `${km}km` : `${km.toFixed(1)}km`
}

function paceOf(pb: DistancePb): number {
  return pb.elapsedSec / (pb.distanceM / 1000)
}

/** 베스트(훈련/레이싱 통합 최속)가 있는 거리 버킷을 오름차순으로. */
export function listDistanceOptions(runs: RunLog[]): DistanceOption[] {
  const pbs = computeDistancePbs(runs, STEP_M)
  const distances = [...new Set(pbs.map((p) => p.distanceM))].sort((a, b) => a - b)
  return distances.map((d) => ({ distanceM: d, label: kmLabel(d) }))
}

/** 선택한 거리의 상대 후보: 없음 + 내 베스트(전체 통합 최속, 있으면). */
export function listOpponents(runs: RunLog[], distanceM: number | null): OpponentOption[] {
  const none: OpponentOption = { kind: 'none', runId: null, distanceM, elapsedSec: null, avgPaceSec: null, date: null }
  if (distanceM == null) return [none]
  const pbs = computeDistancePbs(runs, STEP_M).filter((p) => p.distanceM === distanceM)
  if (!pbs.length) return [none]
  // 훈련/레이싱 구분 없이 그 거리 최속 1개 = 내 베스트.
  const best = pbs.reduce((a, b) => (b.elapsedSec < a.elapsedSec ? b : a))
  return [
    none,
    {
      kind: 'best',
      runId: best.runId,
      distanceM: best.distanceM,
      elapsedSec: best.elapsedSec,
      avgPaceSec: paceOf(best),
      date: best.achievedAt.slice(0, 10)
    }
  ]
}

/** 선택한 상대(runId)의 고스트 곡선 포인트. 못 찾으면 null. */
export function ghostCurveForRun(runs: RunLog[], runId: string): GhostCurvePoint[] | null {
  const run = runs.find((r) => r.id === runId)
  if (!run) return null
  const curve = buildGhostCurve(run)
  return curve.points.length >= 2 ? curve.points : null
}

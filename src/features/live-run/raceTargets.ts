import type { RunLog } from '@/entities/run/model'
import { computeDistancePbs, type DistancePb } from '@/shared/lib/achievement/distancePb'
import { buildGhostCurve, type GhostCurvePoint } from '@/shared/lib/selfRace/ghost'

/**
 * 가상레이싱 `나와의 대결` 거리·상대(고스트) 선택 (#232).
 * 거리 설정(거리별 PB 버킷) → 상대 설정(없음 / 해당 거리 레이싱 PB / 해당 거리 훈련 PB).
 *
 * NOTE(스펙 변경): 초기 §9.2는 "타겟=레이싱 세션만, 훈련 제외"였으나, 사용자 결정으로
 *   **훈련 PB도 상대 후보로 허용**한다(거리별). competition-domain §9.2 / decision-log 갱신 대상.
 */

const STEP_M = 5000

export type DistanceOption = { distanceM: number; label: string }

export type OpponentKind = 'none' | 'race' | 'training'

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

/** 훈련/레이싱 PB가 하나라도 있는 거리 버킷을 오름차순으로. */
export function listDistanceOptions(runs: RunLog[]): DistanceOption[] {
  const pbs = computeDistancePbs(runs, STEP_M)
  const distances = [...new Set(pbs.map((p) => p.distanceM))].sort((a, b) => a - b)
  return distances.map((d) => ({ distanceM: d, label: kmLabel(d) }))
}

/** 선택한 거리의 상대 후보: 없음 + 레이싱 PB + 훈련 PB(있는 것만). */
export function listOpponents(runs: RunLog[], distanceM: number | null): OpponentOption[] {
  const none: OpponentOption = { kind: 'none', runId: null, distanceM, elapsedSec: null, avgPaceSec: null, date: null }
  if (distanceM == null) return [none]
  const pbs = computeDistancePbs(runs, STEP_M).filter((p) => p.distanceM === distanceM)
  const opts: OpponentOption[] = [none]
  for (const ctx of ['race', 'training'] as const) {
    const pb = pbs.find((p) => p.context === ctx)
    if (pb) {
      opts.push({
        kind: ctx,
        runId: pb.runId,
        distanceM: pb.distanceM,
        elapsedSec: pb.elapsedSec,
        avgPaceSec: paceOf(pb),
        date: pb.achievedAt.slice(0, 10)
      })
    }
  }
  return opts
}

/** 선택한 상대(runId)의 고스트 곡선 포인트. 못 찾으면 null. */
export function ghostCurveForRun(runs: RunLog[], runId: string): GhostCurvePoint[] | null {
  const run = runs.find((r) => r.id === runId)
  if (!run) return null
  const curve = buildGhostCurve(run)
  return curve.points.length >= 2 ? curve.points : null
}

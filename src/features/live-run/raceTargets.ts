import type { RunLog } from '@/entities/run/model'
import { computeDistancePbs } from '@/shared/lib/achievement/distancePb'
import { buildGhostCurve, type GhostCurvePoint } from '@/shared/lib/selfRace/ghost'

/**
 * 가상레이싱 `혼자하기` 타겟 후보 (#232, competition-domain §9.2).
 * 타겟 = '없음' 또는 **기존 레이싱 세션**(`self-race` 태그된 과거 런)뿐. 훈련 기록은 제외한다.
 * 부트스트랩: self-race 런이 없으면 목록은 비고 '없음'만 선택 가능 — 첫 레이싱이 첫 타겟을 만든다.
 */
export type RaceTarget = {
  runId: string
  date: string
  distanceKm: number
  durationSec: number | null
  avgPaceSec: number | null
  /** 거리별 레이싱 PB(최고)면 강조. */
  isPb: boolean
}

const SELF_RACE_TAG = 'self-race'

/** 레이싱 세션(=self-race 태그) 목록을 최신순으로. 레이싱 PB는 isPb로 강조. */
export function listRaceTargets(runs: RunLog[]): RaceTarget[] {
  const raceRuns = runs.filter((run) => run.tags?.includes(SELF_RACE_TAG))
  const pbRunIds = new Set(
    computeDistancePbs(runs).filter((pb) => pb.context === 'race').map((pb) => pb.runId)
  )
  return raceRuns
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((run) => ({
      runId: run.id,
      date: run.date,
      distanceKm: run.distanceKm,
      durationSec: run.durationSec,
      avgPaceSec: run.avgPaceSec,
      isPb: pbRunIds.has(run.id)
    }))
}

/** 선택한 타겟(runId)의 고스트 곡선 포인트. 못 찾으면 null. */
export function ghostCurveForTarget(runs: RunLog[], runId: string): GhostCurvePoint[] | null {
  const run = runs.find((r) => r.id === runId)
  if (!run) return null
  const curve = buildGhostCurve(run)
  return curve.points.length >= 2 ? curve.points : null
}

import type { RunLog } from '@/entities/run/model'
import { ghostCurveForRun, listDistanceOptions, listOpponents } from '@/features/live-run/raceTargets'
import type { GhostCurvePoint } from '@/shared/lib/selfRace/ghost'
import type { WatchCatalogEntry, WatchRaceCatalogPayload } from './watchRaceBridge'

/**
 * 워치 고스트 카탈로그 조립 (#552 Phase 3).
 * 폰 RacePage 와 같은 소싱(listDistanceOptions/listOpponents/ghostCurveForRun)으로
 * 거리별 내 베스트 + 곡선을 만들어 워치에 내린다 — 워치·폰이 같은 상대를 보게 하는 파리티 계약.
 */

/** WCSession applicationContext 용량(~64KB) 안에서 여러 거리 곡선을 담기 위한 다운샘플 상한. */
const MAX_CURVE_POINTS = 120

/** RacePage LS_KEY 미러 — 폰에서 마지막으로 고른 레이스 설정(음성 주기·격차 단위·거리·상대). */
const RACE_SETTINGS_KEY = 'race_last_settings_v1'

type SavedRaceSettings = {
  distanceM?: number | null
  opponentRunId?: string | null
  periodicKind?: 'distance' | 'time' | 'silent'
  stepM?: number
  stepSec?: number
  reversalAlert?: boolean
  gapMode?: 'distance' | 'time'
}

export function buildWatchRaceCatalog(runs: RunLog[], generatedAt: string): WatchRaceCatalogPayload {
  const saved = loadSavedRaceSettings()
  const entries: WatchCatalogEntry[] = listDistanceOptions(runs).map((option) => {
    const best = listOpponents(runs, option.distanceM).find((o) => o.kind === 'best')
    let bestEntry: WatchCatalogEntry['best'] = null
    if (best?.runId && best.elapsedSec != null && best.avgPaceSec != null) {
      const points = ghostCurveForRun(runs, best.runId)
      if (points) {
        bestEntry = {
          elapsedSec: best.elapsedSec,
          avgPaceSec: best.avgPaceSec,
          date: best.date ?? '',
          sourceRunId: best.runId,
          curvePoints: downsampleCurve(points, MAX_CURVE_POINTS)
        }
      }
    }
    return { distanceM: option.distanceM, label: option.label, best: bestEntry }
  })

  return {
    generatedAt,
    announceConfig: {
      periodic:
        saved?.periodicKind === 'time'
          ? { kind: 'time', stepSec: saved.stepSec ?? 300 }
          : saved?.periodicKind === 'silent'
            ? { kind: 'silent' }
            : { kind: 'distance', stepM: saved?.stepM ?? 1000 },
      reversalAlert: saved?.reversalAlert ?? true,
      gapMode: saved?.gapMode === 'time' ? 'time' : 'distance'
    },
    lastSelection: {
      distanceM: typeof saved?.distanceM === 'number' ? saved.distanceM : null,
      opponentKind: saved?.opponentRunId ? 'best' : 'none'
    },
    entries
  }
}

/**
 * 곡선 다운샘플: 첫/끝 점 보존 + 균등 간격 선택. 단조증가 곡선의 부분집합이라 단조성 유지.
 * (ghost.ts 보간은 선형이므로 120점이면 km당 수 점 이상 — 격차 오차는 수 초 미만.)
 */
export function downsampleCurve(points: GhostCurvePoint[], maxPoints: number): GhostCurvePoint[] {
  if (points.length <= maxPoints) return [...points]
  const result: GhostCurvePoint[] = [points[0]]
  const step = (points.length - 1) / (maxPoints - 1)
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)])
  }
  result.push(points[points.length - 1])
  return result
}

function loadSavedRaceSettings(): SavedRaceSettings | null {
  try {
    const raw = localStorage.getItem(RACE_SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedRaceSettings
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

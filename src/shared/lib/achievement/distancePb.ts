import type { RunLog, RunMetricSample } from '@/entities/run/model'

/**
 * 거리별 PB(개인 최고) 산출 — 출발선부터 누적거리 D에 가장 빨리 도달한 기록.
 *
 * 설계 근거(#228, `.harness/project/competition-domain.md` §9.2, decision-log 2026-06-08 PoC②):
 * - time-to-reach-D 는 metricSamples(offsetSec/paceSec) 적분으로 추정하고, 적분 불가 시
 *   durationSec/distanceKm 균등(등속) fallback 으로 떨어진다. (2단 fallback — laps 미사용)
 * - PoC② 측정상 5km↑ 런의 97%가 적분 가능(paceSec 커버리지 0.98)하므로 밀도 컷오프는
 *   사용성 게이트로 쓰지 않는다. 샘플+paceSec 이 있으면 성겨도 적분(등속 가정보다 우월).
 * - 훈련/레이싱 PB 사다리는 `RunLog.tags`의 'self-race' 포함 여부로 partition 후 각각 산출해
 *   상호 배타로 유지한다.
 */

export type PbContext = 'training' | 'race'

export type DistancePb = {
  context: PbContext
  /** 버킷 누적거리 (m). stepM 의 배수. */
  distanceM: number
  /** 출발선부터 distanceM 에 도달한 추정 경과 시간 (초). */
  elapsedSec: number
  /** 이 PB 를 소유한 RunLog id. */
  runId: string
  /** 달성 시각 (run.startAt ?? run.date). 동률 tie-break 및 노출용. */
  achievedAt: string
}

const SELF_RACE_TAG = 'self-race'

/**
 * 전체 RunLog 에서 거리별 PB 를 훈련/레이싱 컨텍스트별로 산출한다.
 * 전체 재산출이므로 새 기록 import 시 호출만으로 자동 갱신된다(별도 트리거 불필요).
 *
 * @param runs   전체 RunLog
 * @param stepM  버킷 간격(m). 기본 5000(5km).
 * @returns 컨텍스트별·거리별 PB. distanceM 오름차순, training → race 순.
 */
export function computeDistancePbs(runs: RunLog[], stepM = 5000): DistancePb[] {
  if (!Number.isFinite(stepM) || stepM <= 0) return []
  const training: RunLog[] = []
  const race: RunLog[] = []
  for (const run of runs) {
    if ((run.tags ?? []).includes(SELF_RACE_TAG)) race.push(run)
    else training.push(run)
  }
  return [
    ...computeForContext(training, 'training', stepM),
    ...computeForContext(race, 'race', stepM)
  ]
}

function computeForContext(runs: RunLog[], context: PbContext, stepM: number): DistancePb[] {
  const best = new Map<number, DistancePb>()
  for (const run of runs) {
    const totalM = (run.distanceKm ?? 0) * 1000
    if (totalM < stepM) continue // 최단 버킷도 못 채우는 거리미달 런은 PB 후보 아님
    const reach = buildReachFn(run, totalM)
    if (!reach) continue
    const achievedAt = run.startAt ?? run.date
    const maxBucket = Math.floor(totalM / stepM) * stepM
    for (let d = stepM; d <= maxBucket; d += stepM) {
      const sec = reach(d)
      if (sec == null || !Number.isFinite(sec) || sec <= 0) continue
      const cur = best.get(d)
      if (!cur || sec < cur.elapsedSec || (sec === cur.elapsedSec && isEarlier(achievedAt, run.id, cur))) {
        best.set(d, { context, distanceM: d, elapsedSec: sec, runId: run.id, achievedAt })
      }
    }
  }
  return [...best.values()].sort((a, b) => a.distanceM - b.distanceM)
}

/** 동률일 때 더 이른 달성 기록을 우선하고, 그것도 같으면 runId 로 결정적 정렬. */
function isEarlier(achievedAt: string, runId: string, cur: DistancePb): boolean {
  if (achievedAt !== cur.achievedAt) return achievedAt < cur.achievedAt
  return runId < cur.runId
}

type ReachFn = (distanceM: number) => number | null

/**
 * 누적거리(m) → 도달 시각(초) 함수를 만든다.
 * metricSamples 로 곡선을 적분할 수 있으면 그 곡선(총거리에 정규화)을 보간하고,
 * 아니면 균등(등속) fallback 으로 떨어진다.
 */
function buildReachFn(run: RunLog, totalM: number): ReachFn | null {
  const curve = buildCumulativeCurve(run.metricSamples ?? [], totalM)
  if (curve) return (distanceM) => interpolateTime(curve, distanceM)

  // 균등 fallback: 등속 가정 → 도달시각 = duration × (D / 총거리)
  const duration = run.durationSec
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return null
  return (distanceM) => (duration * distanceM) / totalM
}

type CumulativePoint = { t: number; dist: number }

/**
 * metricSamples(offsetSec/paceSec)를 적분해 누적거리 곡선을 만든 뒤 총거리 totalM 에 정규화한다.
 * 정규화는 페이스 노이즈로 인한 적분 드리프트를 실제 기록 거리에 앵커링한다.
 * 적분에 쓸 유효 샘플이 2개 미만이거나 누적거리가 0이면 null(→ 호출부가 fallback).
 */
function buildCumulativeCurve(samples: RunMetricSample[], totalM: number): CumulativePoint[] | null {
  const valid = samples
    .filter((s) => s.offsetSec != null && Number.isFinite(s.offsetSec) && s.paceSec != null && Number.isFinite(s.paceSec) && (s.paceSec as number) > 0)
    .sort((a, b) => a.offsetSec - b.offsetSec)
  if (valid.length < 2) return null

  // paceSec(sec/km) → 속도(m/s) = 1000 / paceSec
  const speedOf = (s: RunMetricSample) => 1000 / (s.paceSec as number)

  const points: CumulativePoint[] = [{ t: 0, dist: 0 }]
  let cum = 0
  let prevT = 0
  let prevV = speedOf(valid[0]) // [0, 첫 샘플] 구간은 첫 샘플 속도로 근사
  for (const s of valid) {
    const v = speedOf(s)
    const dt = s.offsetSec - prevT
    if (dt > 0) {
      cum += ((prevV + v) / 2) * dt // 사다리꼴 적분
      points.push({ t: s.offsetSec, dist: cum })
    }
    prevT = s.offsetSec
    prevV = v
  }
  if (cum <= 0 || !Number.isFinite(cum) || totalM <= 0) return null

  const scale = totalM / cum
  if (scale !== 1) {
    for (const p of points) p.dist *= scale
  }
  return points
}

/** 누적거리 곡선에서 distanceM 도달 시각을 선형보간한다. 곡선의 dist 는 단조증가. */
function interpolateTime(points: CumulativePoint[], distanceM: number): number | null {
  if (distanceM <= 0) return 0
  const last = points[points.length - 1]
  if (distanceM >= last.dist) return last.t
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (distanceM <= b.dist) {
      const span = b.dist - a.dist
      if (span <= 0) return a.t
      const ratio = (distanceM - a.dist) / span
      return a.t + ratio * (b.t - a.t)
    }
  }
  return last.t
}

import type { RunLog } from '@/entities/run/model'
import { computeDistancePbs, type DistancePb, type PbContext } from './distancePb'

/**
 * 세션 데이터 기반 개인 업적 도메인 (#181).
 *
 * 설계(#181, decision-log 2026-06-08):
 * - 전부 run_logs 파생·결정적 계산. 저장 테이블 없음 → 새 기록 import 시 재호출만으로 자동 갱신.
 * - PB·기록류는 'self-race' 태그로 훈련/레이싱 컨텍스트를 상호 배타로 분리(누적·습관류는 후속, 통합 예정).
 * - 거리별 PB 는 #228 `computeDistancePbs` 를 그대로 소유·재사용한다.
 * - coach-run 인용은 웹이 전체 런으로 산출한 요약을 payload 로 전달(서버는 최근 120건만 보므로
 *   올타임 기록을 놓치지 않게 하기 위함, currentWeather 와 동일한 client-summary 패턴).
 */

export type AchievementContext = PbContext // 'training' | 'race'

const SELF_RACE_TAG = 'self-race'

/** 거리 마일스톤(m): 5km / 10km / 하프 / 풀. 첫 달성 기록을 컨텍스트별로 잡는다. */
export const DISTANCE_MILESTONES_M = [5000, 10000, 21097.5, 42195] as const

/** 최속 평균 페이스 후보에서 제외할 최소 거리(m). 아주 짧은 GPS 노이즈/스트라이드 구간 배제. */
const MIN_PACE_RECORD_DISTANCE_M = 1000

type BaseRecord = { context: AchievementContext; runId: string; achievedAt: string }
export type PaceRecord = BaseRecord & { avgPaceSec: number; distanceKm: number }
export type DistanceRecord = BaseRecord & { distanceKm: number }
export type DurationRecord = BaseRecord & { durationSec: number }
export type MilestoneRecord = BaseRecord & { distanceM: number }

export type AchievementSet = {
  distancePbs: DistancePb[]
  fastestPace: PaceRecord[]
  longestDistance: DistanceRecord[]
  longestDuration: DurationRecord[]
  firstMilestones: MilestoneRecord[]
}

function achievedAtOf(run: RunLog): string {
  return run.startAt ?? run.date
}

function contextOf(run: RunLog): AchievementContext {
  return (run.tags ?? []).includes(SELF_RACE_TAG) ? 'race' : 'training'
}

/** value 가 같으면 더 이른 achievedAt → runId 사전순으로 결정적 우선순위. (distancePb 와 동일 규칙) */
function preferEarlier(a: { achievedAt: string; runId: string }, b: { achievedAt: string; runId: string }): boolean {
  if (a.achievedAt !== b.achievedAt) return a.achievedAt < b.achievedAt
  return a.runId < b.runId
}

/** 전체 RunLog 에서 컨텍스트별 업적 집합을 결정적으로 산출한다. */
export function computeAchievements(runs: RunLog[]): AchievementSet {
  const distancePbs = computeDistancePbs(runs)
  const fastestPace: PaceRecord[] = []
  const longestDistance: DistanceRecord[] = []
  const longestDuration: DurationRecord[] = []
  const firstMilestones: MilestoneRecord[] = []

  for (const context of ['training', 'race'] as const) {
    const bucket = runs.filter((r) => contextOf(r) === context)
    if (!bucket.length) continue

    let bestPace: PaceRecord | null = null
    let bestDistance: DistanceRecord | null = null
    let bestDuration: DurationRecord | null = null
    const milestoneFirst = new Map<number, MilestoneRecord>()

    for (const run of bucket) {
      const base = { context, runId: run.id, achievedAt: achievedAtOf(run) }
      const distanceM = (run.distanceKm ?? 0) * 1000

      // 최속 평균 페이스 (값이 작을수록 빠름)
      if (run.avgPaceSec != null && Number.isFinite(run.avgPaceSec) && run.avgPaceSec > 0 && distanceM >= MIN_PACE_RECORD_DISTANCE_M) {
        const cand: PaceRecord = { ...base, avgPaceSec: run.avgPaceSec, distanceKm: run.distanceKm }
        if (!bestPace || cand.avgPaceSec < bestPace.avgPaceSec || (cand.avgPaceSec === bestPace.avgPaceSec && preferEarlier(cand, bestPace))) {
          bestPace = cand
        }
      }

      // 최장 단일 거리
      if (run.distanceKm != null && Number.isFinite(run.distanceKm) && run.distanceKm > 0) {
        const cand: DistanceRecord = { ...base, distanceKm: run.distanceKm }
        if (!bestDistance || cand.distanceKm > bestDistance.distanceKm || (cand.distanceKm === bestDistance.distanceKm && preferEarlier(cand, bestDistance))) {
          bestDistance = cand
        }
      }

      // 최장 단일 시간
      if (run.durationSec != null && Number.isFinite(run.durationSec) && run.durationSec > 0) {
        const cand: DurationRecord = { ...base, durationSec: run.durationSec }
        if (!bestDuration || cand.durationSec > bestDuration.durationSec || (cand.durationSec === bestDuration.durationSec && preferEarlier(cand, bestDuration))) {
          bestDuration = cand
        }
      }

      // 거리 마일스톤 첫 달성 (가장 이른 달성 기록)
      for (const milestone of DISTANCE_MILESTONES_M) {
        if (distanceM >= milestone) {
          const cand: MilestoneRecord = { ...base, distanceM: milestone }
          const cur = milestoneFirst.get(milestone)
          if (!cur || preferEarlier(cand, cur)) milestoneFirst.set(milestone, cand)
        }
      }
    }

    if (bestPace) fastestPace.push(bestPace)
    if (bestDistance) longestDistance.push(bestDistance)
    if (bestDuration) longestDuration.push(bestDuration)
    for (const m of DISTANCE_MILESTONES_M) {
      const rec = milestoneFirst.get(m)
      if (rec) firstMilestones.push(rec)
    }
  }

  return { distancePbs, fastestPace, longestDistance, longestDuration, firstMilestones }
}

// ── coach-run 주입용 컴팩트 요약 ────────────────────────────────────────────────

export type CoachContextHighlights = {
  longestDistanceKm: number | null
  longestDurationSec: number | null
  fastestAvgPaceSec: number | null
  /** 가장 인용가치 높은 거리 PB (5km·10km 버킷 우선, 최대 2개). */
  distancePbs: { distanceM: number; elapsedSec: number }[]
  /** 첫 달성한 거리 마일스톤(m) 목록. */
  milestonesM: number[]
}

export type CoachAchievementSummary = {
  training: CoachContextHighlights
  /** 레이싱 런이 없으면 null (부트스트랩: 첫 레이싱 전 레이싱 사다리 비어있음). */
  race: CoachContextHighlights | null
}

/** coach-run 인용용 컴팩트 요약. 프롬프트 크기 절약을 위해 PB 는 최대 2버킷으로 제한한다. */
export function summarizeAchievementsForCoach(runs: RunLog[]): CoachAchievementSummary {
  const set = computeAchievements(runs)
  const build = (context: AchievementContext): CoachContextHighlights | null => {
    const dist = set.longestDistance.find((r) => r.context === context) ?? null
    const dur = set.longestDuration.find((r) => r.context === context) ?? null
    const pace = set.fastestPace.find((r) => r.context === context) ?? null
    const pbs = set.distancePbs
      .filter((p) => p.context === context)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 2)
      .map((p) => ({ distanceM: p.distanceM, elapsedSec: Math.round(p.elapsedSec) }))
    const milestonesM = set.firstMilestones.filter((m) => m.context === context).map((m) => m.distanceM)
    if (!dist && !dur && !pace && !pbs.length && !milestonesM.length) return null
    return {
      longestDistanceKm: dist ? dist.distanceKm : null,
      longestDurationSec: dur ? dur.durationSec : null,
      fastestAvgPaceSec: pace ? pace.avgPaceSec : null,
      distancePbs: pbs,
      milestonesM
    }
  }
  return {
    training: build('training') ?? { longestDistanceKm: null, longestDurationSec: null, fastestAvgPaceSec: null, distancePbs: [], milestonesM: [] },
    race: build('race')
  }
}

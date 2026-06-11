import type { RunLog } from '@/entities/run/model'
import type { CompetitionResult } from '@/entities/competition/model'
import { computeDistancePbs, type DistancePb, type PbContext } from './distancePb'

/**
 * 세션 데이터 기반 개인 업적 도메인 (#181).
 *
 * 설계(#181, decision-log 2026-06-08):
 * - 전부 run_logs 파생·결정적 계산. 저장 테이블 없음 → 새 기록 import 시 재호출만으로 자동 갱신.
 * - PB·기록류는 'self-race' 태그로 훈련/레이싱 컨텍스트를 상호 배타로 분리한다.
 * - 누적·습관류(최장 연속 스트릭, 주/월 최다 볼륨)는 컨텍스트 분리가 무의미하므로 전체 통합 산출한다.
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

/** 누적·습관류 (컨텍스트 분리 없이 전체 통합). */
export type StreakRecord = { days: number; start: string; end: string }
export type VolumeRecord = { periodStart: string; distanceKm: number; runCount: number }
export type CumulativeAchievements = {
  /** 끊김 없는 최장 연속 러닝 일수(달력일 기준). */
  longestStreak: StreakRecord | null
  /** 주(월요일 시작) 최다 누적 거리. periodStart=해당 주 월요일 YYYY-MM-DD. */
  bestWeeklyVolume: VolumeRecord | null
  /** 월 최다 누적 거리. periodStart=해당 월 YYYY-MM-01. */
  bestMonthlyVolume: VolumeRecord | null
}

export type AchievementSet = {
  distancePbs: DistancePb[]
  fastestPace: PaceRecord[]
  longestDistance: DistanceRecord[]
  longestDuration: DurationRecord[]
  firstMilestones: MilestoneRecord[]
  cumulative: CumulativeAchievements
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

const MS_PER_DAY = 86400000

/** 날짜 문자열(YYYY-MM-DD…)을 UTC 자정 기준 일(day) 인덱스로. 무효면 null. (TZ 영향 제거) */
function dayIndex(dateStr: string): number | null {
  const t = Date.parse(`${(dateStr ?? '').slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / MS_PER_DAY) : null
}

/** 해당 날짜가 속한 주의 월요일(YYYY-MM-DD). */
function mondayStart(dateStr: string): string {
  const t = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`)
  const dow = new Date(t).getUTCDay() // 0=일 … 6=토
  const offset = (dow + 6) % 7 // 월요일까지 거슬러 갈 일수
  return new Date(t - offset * MS_PER_DAY).toISOString().slice(0, 10)
}

function distanceKmOf(run: RunLog): number {
  return run.distanceKm != null && Number.isFinite(run.distanceKm) && run.distanceKm > 0 ? run.distanceKm : 0
}

function maxVolume(map: Map<string, { km: number; n: number }>): VolumeRecord | null {
  let best: VolumeRecord | null = null
  for (const [periodStart, v] of map) {
    const cand: VolumeRecord = { periodStart, distanceKm: Math.round(v.km * 100) / 100, runCount: v.n }
    // 동률이면 더 이른 기간을 우선해 결정적.
    if (!best || cand.distanceKm > best.distanceKm || (cand.distanceKm === best.distanceKm && cand.periodStart < best.periodStart)) {
      best = cand
    }
  }
  return best
}

/** 누적·습관류(스트릭, 주/월 볼륨)를 전체 통합으로 결정적 산출. */
export function computeCumulativeAchievements(runs: RunLog[]): CumulativeAchievements {
  // 스트릭: 러닝이 있었던 고유 달력일을 모아 최장 연속 구간을 찾는다.
  const dayToDate = new Map<number, string>()
  const weekly = new Map<string, { km: number; n: number }>()
  const monthly = new Map<string, { km: number; n: number }>()
  for (const run of runs) {
    const date = (run.date ?? '').slice(0, 10)
    const di = dayIndex(date)
    if (di == null) continue
    if (!dayToDate.has(di)) dayToDate.set(di, date)
    const km = distanceKmOf(run)
    const w = mondayStart(date)
    const m = `${date.slice(0, 7)}-01`
    const wv = weekly.get(w) ?? { km: 0, n: 0 }
    wv.km += km; wv.n += 1; weekly.set(w, wv)
    const mv = monthly.get(m) ?? { km: 0, n: 0 }
    mv.km += km; mv.n += 1; monthly.set(m, mv)
  }

  let longestStreak: StreakRecord | null = null
  const days = [...dayToDate.keys()].sort((a, b) => a - b)
  if (days.length) {
    let runStart = days[0]
    let prev = days[0]
    let curLen = 1
    let best = { len: 1, start: days[0], end: days[0] }
    for (let i = 1; i < days.length; i++) {
      if (days[i] === prev + 1) curLen += 1
      else { runStart = days[i]; curLen = 1 }
      prev = days[i]
      if (curLen > best.len) best = { len: curLen, start: runStart, end: days[i] }
    }
    longestStreak = { days: best.len, start: dayToDate.get(best.start)!, end: dayToDate.get(best.end)! }
  }

  return { longestStreak, bestWeeklyVolume: maxVolume(weekly), bestMonthlyVolume: maxVolume(monthly) }
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

  return { distancePbs, fastestPace, longestDistance, longestDuration, firstMilestones, cumulative: computeCumulativeAchievements(runs) }
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

export type CoachCumulativeHighlights = {
  longestStreakDays: number | null
  bestWeeklyVolumeKm: number | null
  bestMonthlyVolumeKm: number | null
}

/** 최근 가상레이싱(나와의 대결) 결과 1건. competition_result 파생(#233). */
export type CoachRacingResult = {
  distanceM: number
  /** 부호(ghost.ts): 음수 = 타겟 PB 보다 빠름. */
  resultGapSec: number
  outcome: 'win' | 'lose' | 'tie'
  /** 레이싱 날짜(YYYY-MM-DD). */
  racedAt: string
  /** 타겟(내 베스트)을 이겨 새 PB 인지(=outcome 'win'). */
  isPb: boolean
}

export type CoachAchievementSummary = {
  training: CoachContextHighlights
  /** 레이싱 런이 없으면 null (부트스트랩: 첫 레이싱 전 레이싱 사다리 비어있음). */
  race: CoachContextHighlights | null
  /** 누적·습관류 (컨텍스트 분리 없이 전체 통합). */
  cumulative: CoachCumulativeHighlights
  /** 최근 가상레이싱 결과(최신순, 최대 3건). 없으면 빈 배열. 업적 PB 와 별개의 경쟁 주석. */
  recentRacingResults: CoachRacingResult[]
}

/** competition_result 들을 코칭 인용용 최근 결과 요약으로 압축한다(최신순 최대 3건). */
function summarizeRacingResults(results: CompetitionResult[]): CoachRacingResult[] {
  return [...results]
    .sort((a, b) => (b.racedAt ?? '').localeCompare(a.racedAt ?? ''))
    .slice(0, 3)
    .map((r) => ({
      distanceM: r.targetPb.distanceM,
      resultGapSec: Math.round(r.resultGapSec),
      outcome: r.outcome,
      racedAt: (r.racedAt ?? '').slice(0, 10),
      isPb: r.outcome === 'win'
    }))
}

/**
 * coach-run 인용용 컴팩트 요약. 프롬프트 크기 절약을 위해 PB 는 최대 2버킷으로 제한한다.
 * competitionResults 를 넘기면 최근 가상레이싱 결과를 함께 요약한다(#233).
 */
export function summarizeAchievementsForCoach(runs: RunLog[], competitionResults: CompetitionResult[] = []): CoachAchievementSummary {
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
  const c = set.cumulative
  return {
    training: build('training') ?? { longestDistanceKm: null, longestDurationSec: null, fastestAvgPaceSec: null, distancePbs: [], milestonesM: [] },
    race: build('race'),
    cumulative: {
      longestStreakDays: c.longestStreak ? c.longestStreak.days : null,
      bestWeeklyVolumeKm: c.bestWeeklyVolume ? c.bestWeeklyVolume.distanceKm : null,
      bestMonthlyVolumeKm: c.bestMonthlyVolume ? c.bestMonthlyVolume.distanceKm : null
    },
    recentRacingResults: summarizeRacingResults(competitionResults)
  }
}

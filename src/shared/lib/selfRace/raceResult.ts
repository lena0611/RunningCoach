import type { RunLog } from '@/entities/run/model'
import {
  SELF_RACE_TAG,
  type CompetitionOutcome,
  type CompetitionTargetPb,
  type PendingSelfRace
} from '@/entities/competition/model'
/**
 * 가상레이싱 결과 분류·매칭 순수 로직 (#233, competition-domain §10).
 *
 * 라이브 종료 → 결과 보관(PendingSelfRace) → 다음 HealthKit import 의 RunLog 와 근접 매칭 →
 * 'self-race' 태깅 + (타겟 있으면) CompetitionResult 생성. 이 파일은 그 매칭·파생의 단일 기준이다.
 * 부호 약속은 ghost.ts 와 동일(음수 timeGapSec = 내가 빠름).
 */

// ── 매칭 허용 오차 ───────────────────────────────────────────────────────────
// 라이브 GPS 실측과 HealthKit 정본은 같은 활동이라도 거리·시간이 다소 어긋난다(측정 알고리즘 차이).
// startAt 근접이 1차 키, 거리/시간은 보조 게이트.
const START_TOLERANCE_SEC = 900 // ±15분: 카운트다운/워치 시작 시점 차이 흡수
const DISTANCE_ABS_TOLERANCE_M = 300
const DISTANCE_REL_TOLERANCE = 0.05 // 5%
const DURATION_TOLERANCE_SEC = 180
const DAY_FALLBACK_TOLERANCE = 1 // startAt 없을 때 날짜 ±1일

const MS_PER_DAY = 86400000

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function dayIndex(value: string | null | undefined): number | null {
  const t = Date.parse(`${(value ?? '').slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / MS_PER_DAY) : null
}

/** leadState → 승패. ahead(앞섬)=win, behind(뒤짐)=lose, even=tie. */
export function outcomeFromLeadState(leadState: 'ahead' | 'behind' | 'even'): CompetitionOutcome {
  if (leadState === 'ahead') return 'win'
  if (leadState === 'behind') return 'lose'
  return 'tie'
}

export type RaceFinishInput = {
  /** 라이브 측정 시작 wall-clock(ISO). */
  racedAt: string
  racedDistanceM: number
  racedDurationSec: number | null
  /** 타겟 '없음'(자유 TT)이면 null. */
  targetPb: CompetitionTargetPb | null
  /** 종료 시 고스트 시간차(초, ghost.ts 부호) + 우열. 타겟 없으면 null. */
  finalGap: { timeGapSec: number; leadState: 'ahead' | 'behind' | 'even' } | null
}

/**
 * 라이브 종료 정보를 임시 결과의 파생 필드로 변환한다(id/createdAt 제외 — store 가 부여).
 * 타겟이 없으면 outcome/resultGapSec 는 null(태깅만, CompetitionResult 미생성).
 */
export function deriveResultFields(input: RaceFinishInput): Omit<PendingSelfRace, 'id' | 'createdAt'> {
  const hasTarget = input.targetPb != null && input.finalGap != null
  return {
    racedAt: input.racedAt,
    racedDistanceM: Math.max(0, Math.round(input.racedDistanceM)),
    racedDurationSec: input.racedDurationSec != null ? Math.max(0, Math.round(input.racedDurationSec)) : null,
    targetPb: input.targetPb,
    outcome: hasTarget ? outcomeFromLeadState(input.finalGap!.leadState) : null,
    resultGapSec: hasTarget ? Math.round(input.finalGap!.timeGapSec) : null
  }
}

/** 'self-race' 태그를 멱등 추가한다(중복·기존 태그 보존). run.type 은 건드리지 않는다. */
export function addSelfRaceTag(tags: string[] | null | undefined): string[] {
  const next = tags ?? []
  return next.includes(SELF_RACE_TAG) ? [...next] : [...next, SELF_RACE_TAG]
}

/**
 * RunLog 가 임시 결과와 같은 활동인지 매칭 점수를 낸다. 작을수록 잘 맞음, 불일치면 Infinity.
 * startAt 둘 다 있으면 시간차가 1차 키, 없으면 날짜(±1일) 폴백. 거리/시간은 보조 게이트.
 */
export function matchScore(run: RunLog, pending: PendingSelfRace): number {
  // 거리 게이트
  const runM = (run.distanceKm ?? 0) * 1000
  const distTol = Math.max(DISTANCE_ABS_TOLERANCE_M, pending.racedDistanceM * DISTANCE_REL_TOLERANCE)
  const distDiff = Math.abs(runM - pending.racedDistanceM)
  if (distDiff > distTol) return Infinity

  // 시간 게이트(둘 다 있을 때만)
  if (run.durationSec != null && pending.racedDurationSec != null) {
    if (Math.abs(run.durationSec - pending.racedDurationSec) > DURATION_TOLERANCE_SEC) return Infinity
  }

  const runStart = parseMs(run.startAt)
  const pendingStart = parseMs(pending.racedAt)
  if (runStart != null && pendingStart != null) {
    const gapSec = Math.abs(runStart - pendingStart) / 1000
    if (gapSec > START_TOLERANCE_SEC) return Infinity
    return gapSec // 시간차가 1차 정렬 키
  }

  // startAt 폴백: 날짜 근접 + 거리차로 정렬
  const runDay = dayIndex(run.startAt ?? run.date)
  const pendingDay = dayIndex(pending.racedAt)
  if (runDay == null || pendingDay == null || Math.abs(runDay - pendingDay) > DAY_FALLBACK_TOLERANCE) return Infinity
  return START_TOLERANCE_SEC + distDiff // startAt 매칭보다 항상 뒤로 밀어 우선순위 낮춤
}

/** 후보 RunLog 들 중 임시 결과와 가장 잘 맞는 하나를 고른다. 없으면 null. */
export function pickBestMatch(runs: RunLog[], pending: PendingSelfRace): RunLog | null {
  let best: RunLog | null = null
  let bestScore = Infinity
  for (const run of runs) {
    const score = matchScore(run, pending)
    if (score < bestScore) {
      bestScore = score
      best = run
    }
  }
  return best
}

/** 임시 결과가 만료됐는지(생성 후 maxAgeMs 경과). 미매칭 결과 누적 방지. */
export function isPendingExpired(pending: PendingSelfRace, nowMs: number, maxAgeMs: number): boolean {
  const created = parseMs(pending.createdAt)
  if (created == null) return false
  return nowMs - created > maxAgeMs
}

/** target='없음' 여부에 무관하게 라이브 종료가 유의미한 결과인지(보관 가치). 거리 0 은 버림. */
export function isMeaningfulFinish(racedDistanceM: number): boolean {
  return Number.isFinite(racedDistanceM) && racedDistanceM > 0
}

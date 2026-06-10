import type { RunLog } from '@/entities/run/model'
import type { AthleteProfile, RunnerLevel } from '@/entities/training-memory/model'
import { deriveRunnerLevel } from '@/shared/lib/runnerLevel'
import {
  racePredictionSec,
  vdotFromPerformance,
  vdotFromVo2Max,
  type PaceConfidence
} from '@/shared/lib/vdotPaces'

/**
 * 성장형 RPG 레벨 도메인 (#260 설계 / #262 토대).
 *
 * 레벨 = 2축:
 *  - 거리 클래스(전직 축): 입문 → 5K → 10K → 하프 → 풀. "최고 완주 거리"가 결정하며 영구 해금(강등 없음).
 *  - VDOT 등급(실력 축): 거리와 무관한 절대 밴드라 "골드는 어디서든 골드"로 읽힌다. 최근 VDOT로 계산돼 자연 감쇠.
 *
 * 전부 프로필 + run_logs 파생·결정적 계산(업적과 동일 패턴, achievements.ts 참고). 저장 테이블은
 * 자기보고 초기배치 / 퀘스트 완료 / XP·코인 ledger 같은 "파생 불가" 상태에만 둔다(level migration 참고).
 *
 * 무결성: 등급은 실측 성능(VDOT)으로만 오른다. XP·재화는 참여 보상이라 등급에 영향을 주지 않는다.
 */

// ── 등급(실력 축) ──────────────────────────────────────────────────────────────

export type GradeKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
export type GradeBand = { key: GradeKey; label: string; minVdot: number }

/** VDOT 절대 밴드(#260). minVdot 이상이면 해당 등급. 참고 5K: 브론즈 ~28분, 실버 ~24분, 골드 ~21분, 플래 ~19분, 다이아 sub-18. */
export const GRADE_BANDS: readonly GradeBand[] = [
  { key: 'iron', label: '아이언', minVdot: 0 },
  { key: 'bronze', label: '브론즈', minVdot: 32 },
  { key: 'silver', label: '실버', minVdot: 38 },
  { key: 'gold', label: '골드', minVdot: 44 },
  { key: 'platinum', label: '플래티넘', minVdot: 50 },
  { key: 'diamond', label: '다이아', minVdot: 56 }
] as const

export function gradeBandFromVdot(vdot: number | null): GradeBand | null {
  if (vdot === null || !Number.isFinite(vdot)) return null
  let band = GRADE_BANDS[0]
  for (const candidate of GRADE_BANDS) {
    if (vdot >= candidate.minVdot) band = candidate
  }
  return band
}

export function nextGradeBand(band: GradeBand | null): GradeBand | null {
  if (!band) return GRADE_BANDS[1] ?? null
  const index = GRADE_BANDS.findIndex((item) => item.key === band.key)
  return index >= 0 && index < GRADE_BANDS.length - 1 ? GRADE_BANDS[index + 1] : null
}

// ── 거리 클래스(전직 축) ────────────────────────────────────────────────────────

export type DistanceClassKey = 'pre' | '5k' | '10k' | 'half' | 'full'
export type DistanceClass = { key: DistanceClassKey; label: string; distanceM: number }

/** 하프=21097.5m 는 업적 DISTANCE_MILESTONES_M(achievements.ts)와 동일 기준으로 맞춘다. */
export const DISTANCE_CLASSES: readonly DistanceClass[] = [
  { key: 'pre', label: '입문', distanceM: 0 },
  { key: '5k', label: '5K 러너', distanceM: 5000 },
  { key: '10k', label: '10K 러너', distanceM: 10000 },
  { key: 'half', label: '하프 러너', distanceM: 21097.5 },
  { key: 'full', label: '풀 러너', distanceM: 42195 }
] as const

export function distanceClassFromMeters(maxCompletedM: number): DistanceClass {
  let result = DISTANCE_CLASSES[0]
  for (const candidate of DISTANCE_CLASSES) {
    if (maxCompletedM >= candidate.distanceM) result = candidate
  }
  return result
}

export function nextDistanceClass(current: DistanceClass): DistanceClass | null {
  const index = DISTANCE_CLASSES.findIndex((item) => item.key === current.key)
  return index >= 0 && index < DISTANCE_CLASSES.length - 1 ? DISTANCE_CLASSES[index + 1] : null
}

/** 단일 연속 주행으로 완주한 최장 거리(m). 클래스는 "최고 완주 거리"가 결정한다(#260). */
export function maxCompletedDistanceM(runs: RunLog[]): number {
  let max = 0
  for (const run of runs) {
    const meters = (run.distanceKm ?? 0) * 1000
    if (Number.isFinite(meters) && meters > max) max = meters
  }
  return max
}

// ── 게이트1: 다음 클래스 도전 자격(소프트 게이트, 경고만) ─────────────────────────────

export type Gate1Requirement = { longestRunM: number; weeklyVolumeKm: number }

/** #260 게이트1 표의 중앙값. 클래스 진입에 권장하는 최장 주행 + 주간 볼륨. */
export const GATE1_REQUIREMENTS: Partial<Record<DistanceClassKey, Gate1Requirement>> = {
  '5k': { longestRunM: 4000, weeklyVolumeKm: 10 },
  '10k': { longestRunM: 8000, weeklyVolumeKm: 18 },
  half: { longestRunM: 16000, weeklyVolumeKm: 32 },
  full: { longestRunM: 30000, weeklyVolumeKm: 48 }
}

export type Gate1Inputs = { recentLongestRunM: number; weeklyVolumeKm: number }
export type Gate1Result = {
  eligible: boolean
  percent: number
  /** 풀마라톤은 자격 미달 도전 시 강경고(부상 위험). 그 외는 소프트 경고만. */
  hardWarn: boolean
  reasons: string[]
}

const DAY_MS = 86400000

function runDateLocal(run: RunLog): Date | null {
  const text = (run.date ?? '').slice(0, 10)
  if (!text) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 최근 60일 단일 최장 주행 + 최근 28일 주간 평균 볼륨. */
export function gate1InputsFromRuns(runs: RunLog[], today = new Date()): Gate1Inputs {
  const longestWindowStart = today.getTime() - 60 * DAY_MS
  const volumeWindowStart = today.getTime() - 28 * DAY_MS
  let recentLongestRunM = 0
  let volume28 = 0
  for (const run of runs) {
    const date = runDateLocal(run)
    if (!date) continue
    const meters = (run.distanceKm ?? 0) * 1000
    if (date.getTime() >= longestWindowStart && meters > recentLongestRunM) recentLongestRunM = meters
    if (date.getTime() >= volumeWindowStart) volume28 += run.distanceKm ?? 0
  }
  return { recentLongestRunM, weeklyVolumeKm: Math.round((volume28 / 4) * 10) / 10 }
}

export function evaluateGate1(nextClassKey: DistanceClassKey, inputs: Gate1Inputs): Gate1Result | null {
  const requirement = GATE1_REQUIREMENTS[nextClassKey]
  if (!requirement) return null

  const runRatio = requirement.longestRunM > 0 ? Math.min(1, inputs.recentLongestRunM / requirement.longestRunM) : 1
  const volumeRatio = requirement.weeklyVolumeKm > 0 ? Math.min(1, inputs.weeklyVolumeKm / requirement.weeklyVolumeKm) : 1
  const percent = Math.round(100 * (0.5 * runRatio + 0.5 * volumeRatio))
  const eligible = runRatio >= 1 && volumeRatio >= 1
  const hardWarn = nextClassKey === 'full' && !eligible

  const reasons: string[] = []
  if (runRatio < 1) {
    reasons.push(`최장 주행 ${Math.round(inputs.recentLongestRunM / 100) / 10}km → 권장 ${requirement.longestRunM / 1000}km`)
  }
  if (volumeRatio < 1) {
    reasons.push(`주간 볼륨 ${inputs.weeklyVolumeKm}km → 권장 ${requirement.weeklyVolumeKm}km`)
  }
  if (eligible) reasons.push('도전 자격 충족')

  return { eligible, percent, hardWarn, reasons }
}

// ── 등급 감쇠 / 유지 퀘스트 ──────────────────────────────────────────────────────

/** 측정 근거가 이 일수 이상 오래되면 폼이 녹슨 것으로 보고 유지 퀘스트(폼 재측정)를 권한다. */
export const GRADE_MAINTENANCE_DUE_DAYS = 28

export function gradeMaintenanceDue(lastMeasuredDate: string | null, today = new Date()): boolean {
  if (!lastMeasuredDate) return true
  const date = new Date(`${lastMeasuredDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return true
  const days = Math.floor((today.getTime() - date.getTime()) / DAY_MS)
  return days >= GRADE_MAINTENANCE_DUE_DAYS
}

// ── runnerLevel 파생 뷰 (#260: runnerLevel 은 VDOT 등급의 coarse view) ────────────

/** VDOT 등급 → 기존 runnerLevel(초/중/고). training KB의 suitable_levels 필터 호환용. */
export const RUNNER_LEVEL_BY_GRADE: Record<GradeKey, RunnerLevel> = {
  iron: 'beginner',
  bronze: 'beginner',
  silver: 'intermediate',
  gold: 'intermediate',
  platinum: 'advanced',
  diamond: 'advanced'
}

export function runnerLevelFromGrade(grade: GradeKey): RunnerLevel {
  return RUNNER_LEVEL_BY_GRADE[grade]
}

// ── 측정 VDOT 해석(근거 날짜 포함) ──────────────────────────────────────────────

const MIN_PB_DISTANCE_KM = 3
const SELF_RACE_TAG = 'self-race'

type MeasuredVdot = { vdot: number; confidence: PaceConfidence; basis: string; basisDate: string | null }

/** 우선순위: PB(measured) > VO2max(estimate). vdotPaces.resolvePaceModel 과 같은 우선순위이되 근거 날짜를 함께 돌려준다. */
function resolveMeasuredVdot(profile: AthleteProfile): MeasuredVdot | null {
  let best: MeasuredVdot | null = null
  for (const pb of profile.personalBests ?? []) {
    if (pb.distanceKm < MIN_PB_DISTANCE_KM || pb.durationSec <= 0 || pb.distanceKm <= 0) continue
    const vdot = vdotFromPerformance(pb.distanceKm, pb.durationSec)
    if (vdot === null) continue
    if (!best || vdot > best.vdot) {
      best = { vdot, confidence: 'measured', basis: `PB ${pb.distanceKm.toFixed(2)}km 환산`, basisDate: pb.date ?? null }
    }
  }
  if (best) return best
  const vo2Vdot = vdotFromVo2Max(profile.vo2Max)
  if (vo2Vdot !== null) {
    return { vdot: vo2Vdot, confidence: 'estimate', basis: `VO2max ${profile.vo2Max} 추정`, basisDate: profile.vo2MaxSampleDate ?? null }
  }
  return null
}

/** 가장 최근 self-race(나만의 레이싱) 주행 날짜. 폼 재측정 근거로 본다. */
function lastSelfRaceDate(runs: RunLog[]): string | null {
  let latest: string | null = null
  for (const run of runs) {
    if (!(run.tags ?? []).includes(SELF_RACE_TAG)) continue
    const date = (run.date ?? '').slice(0, 10)
    if (date && (!latest || date > latest)) latest = date
  }
  return latest
}

function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

// ── 최상위: 러너 진척(레벨 상태) ───────────────────────────────────────────────────

const PREDICTION_DISTANCES_M: number[] = [5000, 10000, 21097.5, 42195]

/** 온보딩 자기보고 잠정 배치(아직 GPS 주행으로 인증되기 전). */
export type SelfReportedPlacement = { maxDistanceM?: number | null }

export type RunnerProgress = {
  vdot: number | null
  confidence: PaceConfidence
  basis: string | null
  grade: GradeBand | null
  nextGrade: GradeBand | null
  /** 다음 등급까지 필요한 VDOT(없으면 null, 최상위 등급이면 null). */
  vdotToNextGrade: number | null
  distanceClass: DistanceClass
  /** 거리 클래스가 자기보고(잠정)로 올라간 상태인지(아직 실제 주행 미인증). */
  provisional: boolean
  nextClass: DistanceClass | null
  maxCompletedDistanceM: number
  /** 다음 클래스 도전 자격(최상위 클래스면 null). */
  gate1: Gate1Result | null
  runnerLevel: RunnerLevel
  runnerLevelSource: 'grade' | 'derived'
  /** 폼 재측정(유지 퀘스트) 권장 여부. */
  maintenanceDue: boolean
  /** VDOT 기반 거리별 예상 기록(보조 표시용). */
  racePredictions: { distanceM: number; sec: number }[]
}

export function resolveRunnerProgress(
  profile: AthleteProfile,
  runs: RunLog[] = [],
  today = new Date(),
  selfReported: SelfReportedPlacement | null = null
): RunnerProgress {
  const measured = resolveMeasuredVdot(profile)
  const vdot = measured?.vdot ?? null
  const confidence: PaceConfidence = measured?.confidence ?? 'none'

  const grade = gradeBandFromVdot(vdot)
  const nextGrade = nextGradeBand(grade)
  const vdotToNextGrade =
    vdot !== null && nextGrade ? Math.max(0, Math.round((nextGrade.minVdot - vdot) * 10) / 10) : null

  const verifiedM = maxCompletedDistanceM(runs)
  const selfM = selfReported?.maxDistanceM ?? 0
  const completedM = Math.max(verifiedM, selfM)
  const distanceClass = distanceClassFromMeters(completedM)
  // 자기보고가 실제 주행보다 높은 클래스를 만들었으면 "잠정"(아직 GPS 완주 미인증).
  const provisional = distanceClass.key !== distanceClassFromMeters(verifiedM).key
  const nextClass = nextDistanceClass(distanceClass)
  const gate1 = nextClass ? evaluateGate1(nextClass.key, gate1InputsFromRuns(runs, today)) : null

  // runnerLevel: 수동 설정 우선 → 등급 파생 → (VDOT 없으면) 기존 점수제 fallback.
  let runnerLevel: RunnerLevel
  let runnerLevelSource: RunnerProgress['runnerLevelSource']
  if (profile.runnerLevel === 'beginner' || profile.runnerLevel === 'intermediate' || profile.runnerLevel === 'advanced') {
    runnerLevel = profile.runnerLevel
    runnerLevelSource = 'derived'
  } else if (grade) {
    runnerLevel = runnerLevelFromGrade(grade.key)
    runnerLevelSource = 'grade'
  } else {
    runnerLevel = deriveRunnerLevel(profile, runs, today).level
    runnerLevelSource = 'derived'
  }

  const lastMeasured = laterDate(measured?.basisDate ?? null, lastSelfRaceDate(runs))
  const maintenanceDue = gradeMaintenanceDue(lastMeasured, today)

  const racePredictions =
    vdot !== null
      ? PREDICTION_DISTANCES_M.map((meters) => ({ distanceM: meters, sec: racePredictionSec(vdot, meters / 1000) }))
          .filter((item): item is { distanceM: number; sec: number } => item.sec !== null)
      : []

  return {
    vdot,
    confidence,
    basis: measured?.basis ?? null,
    grade,
    nextGrade,
    vdotToNextGrade,
    distanceClass,
    provisional,
    nextClass,
    maxCompletedDistanceM: completedM,
    gate1,
    runnerLevel,
    runnerLevelSource,
    maintenanceDue,
    racePredictions
  }
}

/** "10K 러너 · 실버" 같은 표기. 등급 미측정이면 클래스만. (#264 카드/칩 표시용) */
export function runnerProgressLabel(progress: RunnerProgress): string {
  if (!progress.grade) return progress.distanceClass.label
  return `${progress.distanceClass.label} · ${progress.grade.label}`
}

// ── 레벨업 감지 + 코인 보상 (#277) ─────────────────────────────────────────────────
// 무결성: 코인은 참여 보상이며 등급(실력)에 영향을 주지 않는다.

export const COIN_REWARD = { classUp: 200, gradeUp: 50, weeklyRoutine: 30, maintenance: 20 } as const

export type LevelUpEvent = { kind: 'class' | 'grade'; toKey: string; toLabel: string; coins: number }

function classIndexOf(key: string): number {
  return DISTANCE_CLASSES.findIndex((item) => item.key === key)
}
function gradeIndexOf(key: string): number {
  return GRADE_BANDS.findIndex((item) => item.key === key)
}

/**
 * 현재 클래스/등급을 acknowledged 와 비교해 레벨업 이벤트를 만든다.
 * - acknowledged_class 가 null 이면 baseline(첫 감지) → 이벤트 없이 현재 값을 acknowledge 만 한다(소급 축하 방지).
 * - 이후 클래스/등급이 acknowledged 보다 높아진 경우만 이벤트로 본다.
 */
export function detectLevelUps(
  currentClassKey: string,
  currentGradeKey: string | null,
  acknowledgedClassKey: string | null,
  acknowledgedGradeKey: string | null
): { baseline: boolean; events: LevelUpEvent[] } {
  if (acknowledgedClassKey === null) return { baseline: true, events: [] }

  const events: LevelUpEvent[] = []
  if (classIndexOf(currentClassKey) > classIndexOf(acknowledgedClassKey)) {
    const cls = DISTANCE_CLASSES.find((item) => item.key === currentClassKey)
    if (cls) events.push({ kind: 'class', toKey: cls.key, toLabel: cls.label, coins: COIN_REWARD.classUp })
  }
  if (currentGradeKey && (acknowledgedGradeKey === null || gradeIndexOf(currentGradeKey) > gradeIndexOf(acknowledgedGradeKey))) {
    const grade = GRADE_BANDS.find((item) => item.key === currentGradeKey)
    if (grade) events.push({ kind: 'grade', toKey: grade.key, toLabel: grade.label, coins: COIN_REWARD.gradeUp })
  }
  return { baseline: false, events }
}

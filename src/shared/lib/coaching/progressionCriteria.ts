import type { RunLog } from '@/entities/run/model'
import {
  defaultProgressionCriteria,
  getActiveInjuryItem,
  type ProgressionCriterion,
  type TrainingMemory,
  type TrainingPhaseName
} from '@/entities/training-memory/model'
import type { AdaptiveMetric } from '@/entities/training-memory/adaptivePersistence'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import { gradeTempoRun, summarizeTempoCoaching } from '@/shared/lib/coaching/tempoAdaptation'
import { dayIndex } from '@/shared/lib/coaching/adaptationShared'
import { lateRunDriftPercent } from '@/shared/lib/coaching/longRunDriftAdaptation'
import { summarizeAdaptiveModels } from '@/shared/lib/coaching/adaptiveModelsSummary'

/**
 * ProgressionCriteria 자동 평가 (#336).
 *
 * defaultProgressionCriteria 4기준의 status(ready/watch/blocked)를 Phase B 적응값(#333~#335) +
 * Tempo 적응(#301) + 부상 + 최근 수행 윈도우로 결정적으로 산출한다.
 * 결과는 phase 자동 전환(#337)과 coach-run(#338)의 1차 입력이다.
 */

export type CriterionStatus = ProgressionCriterion['status']

export type EvaluatedProgressionCriteria = {
  criteria: ProgressionCriterion[]
  readyCount: number
  /** id → status. */
  statusMap: Record<string, CriterionStatus>
  /** 적용되는 기준이 모두 ready인가. */
  allReady: boolean
}

const RECENT_DAYS = 14
const LONG_RUN_DAYS = 28

function anchorDate(runs: RunLog[]): string | null {
  if (!runs.length) return null
  return runs.reduce((max, run) => (run.date > max ? run.date : max), runs[0].date)
}

function recentWithin(runs: RunLog[], days: number): RunLog[] {
  const anchor = anchorDate(runs)
  const anchorIdx = anchor ? dayIndex(anchor) : null
  if (anchorIdx === null) return []
  return runs.filter((run) => {
    const idx = dayIndex(run.date)
    return idx !== null && anchorIdx - idx <= days
  })
}

function findTemplate(id: string): ProgressionCriterion {
  return (
    defaultProgressionCriteria.find((criterion) => criterion.id === id) ?? {
      id,
      label: id,
      status: 'watch',
      evidence: '',
      action: ''
    }
  )
}

function evaluateEasyStability(runs: RunLog[], effectiveCeiling: number | null): { status: CriterionStatus; evidence: string } {
  if (effectiveCeiling === null) return { status: 'watch', evidence: '이지 심박 상한이 아직 없어요 — 정해지면 봐요.' }
  const easy = recentWithin(runs, RECENT_DAYS).filter(
    (run) => (run.type === 'Easy' || run.type === 'Easy + Strides') && run.avgHeartRate !== null
  )
  if (easy.length < 2) return { status: 'watch', evidence: `최근 2주 이지런 심박 기록이 ${easy.length}번뿐이라 아직 판단 전이에요.` }
  const over = easy.filter((run) => (run.avgHeartRate ?? 0) > effectiveCeiling)
  if (over.length === 0) return { status: 'ready', evidence: `최근 이지런 ${easy.length}번 모두 상한 ${effectiveCeiling}bpm 아래였어요.` }
  if (over.length / easy.length >= 0.5) {
    return { status: 'blocked', evidence: `최근 이지런 ${easy.length}번 중 ${over.length}번 상한 ${effectiveCeiling}bpm 을 넘었어요 — 더 천천히 뛰어요.` }
  }
  return { status: 'watch', evidence: `최근 이지런 ${easy.length}번 중 ${over.length}번 상한 ${effectiveCeiling}bpm 을 넘었어요.` }
}

function evaluateTempoQuality(runs: RunLog[], effectiveCeiling: number | null): { status: CriterionStatus; evidence: string } {
  const tempo = recentWithin(runs, RECENT_DAYS).filter((run) => run.type === 'Tempo')
  if (tempo.length < 2) return { status: 'watch', evidence: `최근 2주 템포 기록이 ${tempo.length}번뿐이라 아직 판단 전이에요.` }
  const grades = tempo.map((run) => gradeTempoRun(run, effectiveCeiling, evaluateLapDrift(run).level))
  const cCount = grades.filter((grade) => grade.grade === 'C').length
  const aOrB = grades.filter((grade) => grade.grade === 'A' || grade.grade === 'B').length
  if (cCount === 0 && aOrB >= 2) return { status: 'ready', evidence: `최근 템포 ${tempo.length}번 모두 심박 상한을 지켰어요.` }
  if (cCount / tempo.length >= 0.5) return { status: 'blocked', evidence: `최근 템포 ${tempo.length}번 중 ${cCount}번 상한을 크게 넘었어요 — 짧게, 상한부터 지켜요.` }
  return {
    status: 'watch',
    evidence: cCount > 0
      ? `최근 템포 ${tempo.length}번 중 ${cCount}번 상한을 넘었어요.`
      : `최근 템포 ${tempo.length}번 중 강도가 덜 올라간 날이 있었어요.`
  }
}

function evaluateLongRunDurability(runs: RunLog[], tolerancePercent: number): { status: CriterionStatus; evidence: string } {
  const longRuns = recentWithin(runs, LONG_RUN_DAYS).filter(
    (run) => run.type === 'LSD' || run.type === 'Steady Long' || run.distanceKm >= 10
  )
  const drifts = longRuns
    .map((run) => lateRunDriftPercent(run))
    .filter((value): value is number => value !== null)
  if (drifts.length < 2) return { status: 'watch', evidence: `최근 4주 롱런 기록이 ${drifts.length}번뿐이라 아직 판단 전이에요.` }
  const over = drifts.filter((drift) => drift > tolerancePercent)
  if (over.length === 0) return { status: 'ready', evidence: `최근 롱런 ${drifts.length}번 모두 후반에도 페이스를 지켰어요.` }
  if (over.length / drifts.length >= 0.5) {
    return { status: 'blocked', evidence: `최근 롱런 ${drifts.length}번 중 ${over.length}번 후반에 페이스가 ${tolerancePercent}% 넘게 처졌어요 — 초반을 더 천천히.` }
  }
  return { status: 'watch', evidence: `최근 롱런 ${drifts.length}번 중 ${over.length}번 후반에 페이스가 처졌어요.` }
}

function evaluateInjuryRecoveryGate(
  injuryActive: boolean,
  recovery: { status: string; poorRecoveryCount: number; effectiveRestDays: number }
): { status: CriterionStatus; evidence: string } {
  if (injuryActive) return { status: 'blocked', evidence: '부상을 관리하는 중이라 회복을 먼저 챙겨요.' }
  if (recovery.status === 'watch' || recovery.poorRecoveryCount > 0) {
    return { status: 'watch', evidence: `최근 강한 훈련 뒤 회복이 더뎠어요 — 그 뒤엔 ${recovery.effectiveRestDays}일 쉬어 가요.` }
  }
  return { status: 'ready', evidence: '부상 없고 회복도 좋아요.' }
}

/** Tempo 세션이 처방되는 단계(주기화 weeklySessionTypes 기준). Base·Recovery엔 Tempo가 없어 Tempo 기준은 N/A. */
const TEMPO_PHASES: ReadonlySet<TrainingPhaseName> = new Set(['Build', 'Threshold', 'Race Specific', 'Taper'])
/** 롱런이 처방되는 단계 — Taper(템포만 남김)·Recovery 엔 롱런이 없다(#887). */
const LONG_RUN_PHASES: ReadonlySet<TrainingPhaseName> = new Set(['Base', 'Build', 'Threshold', 'Race Specific'])

/** 현재 단계에 해당 기준이 적용되는가. 미적용이면 'n/a'로 표시·집계 제외(#402). */
function criterionApplies(id: string, phase: TrainingPhaseName | null): boolean {
  if (id === 'tempo-ceiling-quality') return phase === null || TEMPO_PHASES.has(phase)
  if (id === 'long-run-durability') return phase === null || LONG_RUN_PHASES.has(phase)
  return true
}

export function evaluateProgressionCriteria(
  runs: RunLog[],
  memory: TrainingMemory,
  adoptedMetrics: AdaptiveMetric[] = [],
  /** 현재 단계 — 그 단계에 처방되지 않는 세션의 기준은 N/A로 둔다(없으면 모든 기준 평가). */
  currentPhase: TrainingPhaseName | null = null
): EvaluatedProgressionCriteria {
  const injuryActive = Boolean(getActiveInjuryItem(memory))
  const tempo = summarizeTempoCoaching(runs, memory)
  const phaseB = summarizeAdaptiveModels(runs, memory, adoptedMetrics)

  const evaluations: Record<string, { status: CriterionStatus; evidence: string }> = {
    'easy-hr-stability': evaluateEasyStability(runs, phaseB.easyCeiling.effectiveCeilingBpm),
    'tempo-ceiling-quality': evaluateTempoQuality(runs, tempo.effectiveCeilingBpm),
    'long-run-durability': evaluateLongRunDurability(runs, phaseB.longRunDrift.effectiveTolerancePercent),
    'injury-recovery-gate': evaluateInjuryRecoveryGate(injuryActive, phaseB.recoveryCycle)
  }

  const criteria: ProgressionCriterion[] = defaultProgressionCriteria.map((template) => {
    if (!criterionApplies(template.id, currentPhase)) {
      return { ...template, status: 'n/a' as CriterionStatus, evidence: '이 단계엔 이 세션이 없어 보지 않아요.' }
    }
    const evaluated = evaluations[template.id] ?? { status: template.status, evidence: template.evidence }
    return { ...template, status: evaluated.status, evidence: evaluated.evidence }
  })

  const statusMap: Record<string, CriterionStatus> = {}
  for (const criterion of criteria) statusMap[criterion.id] = criterion.status
  // 집계·게이트는 현재 단계에 적용되는 기준만 본다(N/A 제외).
  const applicable = criteria.filter((criterion) => criterion.status !== 'n/a')
  const readyCount = applicable.filter((criterion) => criterion.status === 'ready').length

  return { criteria, readyCount, statusMap, allReady: applicable.length > 0 && readyCount === applicable.length }
}

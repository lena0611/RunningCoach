import type { RunLog } from '@/entities/run/model'
import {
  getActiveInjuryItem,
  type TrainingMemory,
  type TrainingPhaseName
} from '@/entities/training-memory/model'
import type { AdaptiveMetric } from '@/entities/training-memory/adaptivePersistence'
import { evaluateProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'
import { evaluatePhaseTransition } from '@/shared/lib/coaching/phaseTransition'
import { summarizeAdaptiveModels } from '@/shared/lib/coaching/adaptiveModelsSummary'

/**
 * coach-run 주입용 적응·진행 요약 (#338, client-summary 패턴).
 * 웹이 ProgressionCriteria 평가(#336) + phase 전환 제안(#337) + Phase B 적응값(#333~335)을 묶어
 * coach-run에 전달한다. 서버는 이 요약으로 phase 전환·루틴 진화를 reasoning하고 report에 반영한다.
 */

export type CoachAdaptiveProgressSummary = {
  currentPhase: TrainingPhaseName
  criteria: Array<{ id: string; label: string; status: 'ready' | 'watch' | 'blocked' | 'n/a'; evidence: string }>
  readyCount: number
  allReady: boolean
  phaseProposal: {
    shouldTransition: boolean
    toPhase: TrainingPhaseName | null
    reason: string
    blockers: string[]
  }
  adapted: {
    easyCeilingBpm: number | null
    longRunDriftTolerancePercent: number
    recoveryRestDays: number
  }
}

const MS_PER_WEEK = 7 * 86400000

function weeksUntil(dateText: string | null | undefined): number | null {
  if (!dateText) return null
  const t = Date.parse(`${dateText.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  const diff = t - Date.now()
  return Math.round(diff / MS_PER_WEEK)
}

export function buildCoachAdaptiveProgress(
  runs: RunLog[],
  memory: TrainingMemory,
  adoptedMetrics: AdaptiveMetric[] = []
): CoachAdaptiveProgressSummary {
  const currentPhase = memory.adaptiveTrainingProfile.trainingPhase.currentPhase
  const evaluated = evaluateProgressionCriteria(runs, memory, adoptedMetrics, currentPhase)
  const models = summarizeAdaptiveModels(runs, memory, adoptedMetrics)
  const injuryActive = Boolean(getActiveInjuryItem(memory))

  const activeGoal = memory.goals.find((goal) => goal.id === memory.activeGoalId) ?? memory.goals[0] ?? null
  const weeksToRace = weeksUntil(activeGoal?.targetDate ?? null)
  // 최근 90일 내 Race(5km 근처) 수행을 5km TT 성공 근거로 본다.
  const hadRecent5kTT = runs.some(
    (run) => run.type === 'Race' && run.distanceKm >= 4.5 && run.distanceKm <= 6
  )

  const phaseProposal = evaluatePhaseTransition(currentPhase, evaluated, {
    injuryActive,
    weeksToRace,
    hadRecent5kTT
  })

  return {
    currentPhase,
    criteria: evaluated.criteria.map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      status: criterion.status,
      evidence: criterion.evidence
    })),
    readyCount: evaluated.readyCount,
    allReady: evaluated.allReady,
    phaseProposal: {
      shouldTransition: phaseProposal.shouldTransition,
      toPhase: phaseProposal.toPhase,
      reason: phaseProposal.reason,
      blockers: phaseProposal.blockers
    },
    adapted: {
      easyCeilingBpm: models.easyCeiling.effectiveCeilingBpm,
      longRunDriftTolerancePercent: models.longRunDrift.effectiveTolerancePercent,
      recoveryRestDays: models.recoveryCycle.effectiveRestDays
    }
  }
}

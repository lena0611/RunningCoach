import type { RunLog } from '@/entities/run/model'
import type { TrainingMemory, TrainingPhaseName } from '@/entities/training-memory/model'
import type { AdaptiveMetric } from '@/entities/training-memory/adaptivePersistence'
import { evaluateProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'
import { summarizeAdaptiveModels } from '@/shared/lib/coaching/adaptiveModelsSummary'

/**
 * coach-run 주입용 적응·진행 요약 (#338, client-summary 패턴).
 * 웹이 ProgressionCriteria 평가(#336) + Phase B 적응값(#333~335)을 묶어 coach-run 에 전달한다.
 *
 * 단계는 **플랜의 이번 주 단계**를 받는다(#887). 예전엔 기억에 저장한 단계와 전환 제안(phaseProposal)을
 * 실었는데, 플랜은 날짜대로 단계를 넘기므로 둘이 어긋났다. 이제 단계 전환은 제안하지 않는다 —
 * 기준은 "이번 단계에서 보는 것"이고, 덜 된 부분은 브리핑·코치가 그 단계 안에서 챙긴다.
 */

export type CoachAdaptiveProgressSummary = {
  currentPhase: TrainingPhaseName
  criteria: Array<{ id: string; label: string; status: 'ready' | 'watch' | 'blocked' | 'n/a'; evidence: string }>
  readyCount: number
  allReady: boolean
  adapted: {
    easyCeilingBpm: number | null
    longRunDriftTolerancePercent: number
    recoveryRestDays: number
  }
}

export function buildCoachAdaptiveProgress(
  runs: RunLog[],
  memory: TrainingMemory,
  /** 플랜의 이번 주 단계(currentPlanPhase). 플랜이 없으면 'Base' — 비주기화 리듬도 세션에 'Base' 를 단다. */
  currentPhase: TrainingPhaseName,
  adoptedMetrics: AdaptiveMetric[] = []
): CoachAdaptiveProgressSummary {
  const evaluated = evaluateProgressionCriteria(runs, memory, adoptedMetrics, currentPhase)
  const models = summarizeAdaptiveModels(runs, memory, adoptedMetrics)

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
    adapted: {
      easyCeilingBpm: models.easyCeiling.effectiveCeilingBpm,
      longRunDriftTolerancePercent: models.longRunDrift.effectiveTolerancePercent,
      recoveryRestDays: models.recoveryCycle.effectiveRestDays
    }
  }
}

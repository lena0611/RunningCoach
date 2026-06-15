import type { RunLog } from '@/entities/run/model'
import { getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import type { AdaptiveMetric, AdaptiveMetricType } from '@/entities/training-memory/adaptivePersistence'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { computeEasyCeilingAdaptation, type EasyCeilingAdaptation } from '@/shared/lib/coaching/easyAdaptation'
import {
  computeLongRunDriftAdaptation,
  type LongRunDriftAdaptation
} from '@/shared/lib/coaching/longRunDriftAdaptation'
import {
  computeRecoveryCycleAdaptation,
  type RecoveryCycleAdaptation
} from '@/shared/lib/coaching/recoveryCycleAdaptation'

/**
 * Phase B 적응 모델 통합 요약 (#333~#335).
 * 웹이 runs + memory + adaptive_training_metrics(채택값, #328)로 Easy/Long Run drift/Recovery를 계산한다.
 * client-summary 패턴: 결과를 coach-run/대시보드/ProgressionCriteria(#336)에 주입한다.
 */

export type AdaptiveModelsSummary = {
  easyCeiling: EasyCeilingAdaptation
  longRunDrift: LongRunDriftAdaptation
  recoveryCycle: RecoveryCycleAdaptation
}

function adoptedValueOf(metrics: AdaptiveMetric[], type: AdaptiveMetricType): number | null {
  const metric = metrics.find((item) => item.metricType === type)
  return metric?.adoptedValue ?? null
}

export function summarizeAdaptiveModels(
  runs: RunLog[],
  memory: TrainingMemory,
  adoptedMetrics: AdaptiveMetric[] = []
): AdaptiveModelsSummary {
  const injuryActive = Boolean(getActiveInjuryItem(memory))
  const observed = deriveObservedMaxHr(runs.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  const hr = deriveHeartRateModel(memory.athleteProfile, new Date().getFullYear(), observed)

  return {
    easyCeiling: computeEasyCeilingAdaptation(runs, hr.easyCeilingBpm, {
      injuryActive,
      adoptedCeilingBpm: adoptedValueOf(adoptedMetrics, 'easy_ceiling')
    }),
    longRunDrift: computeLongRunDriftAdaptation(runs, {
      injuryActive,
      adoptedTolerancePercent: adoptedValueOf(adoptedMetrics, 'long_run_drift')
    }),
    recoveryCycle: computeRecoveryCycleAdaptation(runs, {
      injuryActive,
      adoptedRestDays: adoptedValueOf(adoptedMetrics, 'recovery_cycle')
    })
  }
}

/**
 * 요약에서 채택(adopted) 상태이고 채택값이 확정된 메트릭만 영속 레코드로 변환한다.
 * adaptive_training_metrics upsert(#328)에 그대로 넣는다. 채택 아닌 건 영속하지 않는다(estimated는 base 추정).
 */
export function toAdoptedAdaptiveMetrics(summary: AdaptiveModelsSummary): AdaptiveMetric[] {
  const records: AdaptiveMetric[] = []

  if (summary.easyCeiling.status === 'adopted' && summary.easyCeiling.proposedAdoptedCeilingBpm !== null) {
    records.push({
      metricType: 'easy_ceiling',
      baseValue: summary.easyCeiling.baseCeilingBpm,
      adoptedValue: summary.easyCeiling.proposedAdoptedCeilingBpm,
      unit: 'bpm',
      evidenceRunIds: [],
      status: 'adopted',
      adoptedAt: new Date().toISOString()
    })
  }
  if (summary.longRunDrift.status === 'adopted' && summary.longRunDrift.adoptedTolerancePercent !== null) {
    records.push({
      metricType: 'long_run_drift',
      baseValue: summary.longRunDrift.baseTolerancePercent,
      adoptedValue: summary.longRunDrift.adoptedTolerancePercent,
      unit: 'percent',
      evidenceRunIds: [],
      status: 'adopted',
      adoptedAt: new Date().toISOString()
    })
  }
  if (summary.recoveryCycle.status === 'adopted' && summary.recoveryCycle.adoptedRestDays !== null) {
    records.push({
      metricType: 'recovery_cycle',
      baseValue: summary.recoveryCycle.baseRestDays,
      adoptedValue: summary.recoveryCycle.adoptedRestDays,
      unit: 'days',
      evidenceRunIds: [],
      status: 'adopted',
      adoptedAt: new Date().toISOString()
    })
  }
  return records
}

import type { RunLog } from '@/entities/run/model'
import type { TrainingGoal } from '@/entities/training-memory/model'

export type RaceProjectionSignal = {
  runId: string
  date: string
  type: string
  distanceKm: number
  durationSec: number
  projectedSec: number
  confidence: 'high' | 'medium' | 'low'
}

export type RaceProjection = {
  targetDistanceKm: number
  targetDurationSec: number | null
  current: RaceProjectionSignal
  previous: RaceProjectionSignal | null
  deltaSec: number | null
}

export function getRaceProjection(runs: RunLog[], activeGoal: TrainingGoal | null | undefined): RaceProjection | null {
  const targetDistanceKm = activeGoal?.distanceKm
  if (!targetDistanceKm || targetDistanceKm <= 0) return null

  const signals = runs
    .filter((run) => run.durationSec && run.distanceKm >= 3)
    .map((run) => toProjectionSignal(run, targetDistanceKm))
    .filter((signal): signal is RaceProjectionSignal => Boolean(signal))
    .filter((signal) => signal.confidence !== 'low')
    .sort((a, b) => b.date.localeCompare(a.date))

  if (!signals.length) return null

  const current = signals[0]
  const previous = signals.slice(1).find((signal) => signal.date < current.date) ?? null

  return {
    targetDistanceKm,
    targetDurationSec: activeGoal?.targetDurationSec ?? null,
    current,
    previous,
    deltaSec: previous ? current.projectedSec - previous.projectedSec : null
  }
}

function toProjectionSignal(run: RunLog, targetDistanceKm: number): RaceProjectionSignal | null {
  if (!run.durationSec || run.distanceKm <= 0) return null

  const confidence = getProjectionConfidence(run)
  const projectedSec = Math.round(run.durationSec * (targetDistanceKm / run.distanceKm) ** 1.06)
  if (!Number.isFinite(projectedSec) || projectedSec <= 0) return null

  return {
    runId: run.id,
    date: run.date,
    type: run.type,
    distanceKm: run.distanceKm,
    durationSec: run.durationSec,
    projectedSec,
    confidence
  }
}

function getProjectionConfidence(run: RunLog): RaceProjectionSignal['confidence'] {
  if (run.type === 'Race') return 'high'
  if (run.type === 'Tempo' && run.distanceKm >= 4) return 'medium'
  if (run.type === 'Steady Long' && run.distanceKm >= 8) return 'medium'
  if (run.rpe !== null && run.rpe >= 7 && run.distanceKm >= 4) return 'medium'
  return 'low'
}

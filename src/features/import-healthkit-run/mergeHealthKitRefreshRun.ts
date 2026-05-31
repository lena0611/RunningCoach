import type { ExtractedRunData, RunLog } from '@/entities/run/model'

export function mergeHealthKitRefreshRun(target: RunLog, extracted: ExtractedRunData): RunLog {
  return {
    ...target,
    externalId: extracted.externalId ?? target.externalId,
    date: extracted.date,
    startAt: extracted.startAt ?? target.startAt,
    endAt: extracted.endAt ?? target.endAt,
    type: shouldApplyInferredType(target, extracted) ? extracted.type : target.type,
    distanceKm: extracted.distanceKm,
    durationSec: extracted.durationSec,
    avgPaceSec: extracted.avgPaceSec,
    avgHeartRate: extracted.avgHeartRate,
    maxHeartRate: extracted.maxHeartRate,
    cadence: extracted.cadence,
    activeEnergyKcal: extracted.activeEnergyKcal,
    temperature: extracted.temperature,
    humidity: extracted.humidity,
    windMps: extracted.windMps,
    elevationGainM: extracted.elevationGainM,
    elevationLossM: extracted.elevationLossM,
    courseType: extracted.courseType === 'Unknown' ? target.courseType : extracted.courseType,
    rpe: extracted.rpe ?? target.rpe,
    memo: mergeHealthKitMemo(target.memo, extracted.memo),
    laps: extracted.laps,
    fastSegments: extracted.fastSegments ?? [],
    metricSamples: extracted.metricSamples ?? [],
    routePoints: extracted.routePoints ?? [],
    tags: mergeTypeTags(target.tags ?? []),
    source: 'healthkit'
  }
}

function mergeTypeTags(tags: string[]) {
  if (tags.includes('type:user')) {
    return Array.from(new Set([...tags.filter((tag) => tag !== 'type:auto'), 'healthkit']))
  }
  return Array.from(new Set([...tags.filter((tag) => tag !== 'type:user'), 'healthkit', 'type:auto']))
}

function shouldApplyInferredType(target: RunLog, extracted: ExtractedRunData) {
  if (extracted.type === 'Unknown') return false
  if (target.tags.includes('type:user')) return false
  return true
}

function mergeHealthKitMemo(currentMemo: string, healthKitMemo: string) {
  if (!currentMemo.trim()) return healthKitMemo
  if (/HealthKit 러닝 기록/.test(currentMemo)) return healthKitMemo
  return currentMemo
}

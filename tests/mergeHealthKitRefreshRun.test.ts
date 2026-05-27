import { describe, expect, it } from 'vitest'
import type { ExtractedRunData, RunLog } from '@/entities/run/model'
import { mergeHealthKitRefreshRun } from '@/features/import-healthkit-run/mergeHealthKitRefreshRun'

const baseRun: RunLog = {
  id: 'run-1',
  userId: 'user-1',
  externalId: 'hk-1',
  sessionTitle: '화요일 밤 러닝',
  date: '2026-05-26',
  type: 'Easy + Strides',
  distanceKm: 5.37,
  durationSec: 2460,
  avgPaceSec: 458,
  avgHeartRate: 136,
  maxHeartRate: 156,
  cadence: 164,
  activeEnergyKcal: null,
  temperature: null,
  humidity: null,
  windMps: null,
  elevationGainM: null,
  elevationLossM: null,
  courseType: 'Flat',
  rpe: 2,
  workoutFeeling: '편함',
  painNote: '',
  sleepQuality: null,
  conditionScore: null,
  stressLevel: null,
  companion: '',
  memo: '사용자 확인 완료',
  laps: [],
  fastSegments: [],
  metricSamples: [],
  routePoints: [],
  tags: ['healthkit'],
  source: 'healthkit',
  createdAt: '2026-05-26T12:00:00.000Z',
  updatedAt: '2026-05-26T12:00:00.000Z'
}

const healthKitExtracted: ExtractedRunData = {
  externalId: 'hk-1',
  sessionTitle: '화요일 밤 러닝',
  date: '2026-05-26',
  type: 'Easy',
  distanceKm: 5.38,
  durationSec: 2465,
  avgPaceSec: 459,
  avgHeartRate: 135,
  maxHeartRate: 148,
  cadence: 178,
  activeEnergyKcal: 354,
  temperature: null,
  humidity: null,
  windMps: null,
  elevationGainM: 8,
  elevationLossM: 7,
  courseType: 'Mixed',
  rpe: null,
  workoutFeeling: '',
  painNote: '',
  sleepQuality: null,
  conditionScore: null,
  stressLevel: null,
  companion: '',
  memo: 'HealthKit 러닝 기록 기반 후보. 저장 전 실제 값을 확인하세요.',
  laps: [
    { index: 1, distanceKm: 1, paceSec: 488, avgHeartRate: 122, cadence: 160 }
  ],
  fastSegments: [],
  metricSamples: [
    { offsetSec: 60, heartRate: 122, paceSec: 488, cadence: 160 }
  ],
  routePoints: [],
  tags: ['healthkit']
}

describe('mergeHealthKitRefreshRun', () => {
  it('updates an auto-inferred run type when HealthKit refresh infers a different candidate type', () => {
    const merged = mergeHealthKitRefreshRun(baseRun, healthKitExtracted)

    expect(merged.type).toBe('Easy')
    expect(merged.distanceKm).toBe(5.38)
    expect(merged.avgHeartRate).toBe(135)
    expect(merged.cadence).toBe(178)
    expect(merged.laps).toHaveLength(1)
    expect(merged.metricSamples).toHaveLength(1)
  })

  it('preserves a user-confirmed run type during HealthKit refresh', () => {
    const merged = mergeHealthKitRefreshRun({ ...baseRun, tags: ['healthkit', 'type:user'] }, healthKitExtracted)

    expect(merged.type).toBe('Easy + Strides')
  })

  it('does not overwrite an existing run type with Unknown candidate type', () => {
    const merged = mergeHealthKitRefreshRun(baseRun, { ...healthKitExtracted, type: 'Unknown' })

    expect(merged.type).toBe('Easy + Strides')
  })

  it('keeps user-authored editable fields during HealthKit refresh', () => {
    const merged = mergeHealthKitRefreshRun(baseRun, healthKitExtracted)

    expect(merged.sessionTitle).toBe('화요일 밤 러닝')
    expect(merged.rpe).toBe(2)
    expect(merged.workoutFeeling).toBe('편함')
    expect(merged.memo).toBe('사용자 확인 완료')
  })
})

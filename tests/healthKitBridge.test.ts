import { describe, expect, it } from 'vitest'
import { toExtractedRunData, type HealthKitRunCandidate } from '@/features/import-healthkit-run/healthKitBridge'
import { SELF_RACE_TAG } from '@/entities/competition/model'

function createCandidate(overrides: Partial<HealthKitRunCandidate> = {}): HealthKitRunCandidate {
  return {
    externalId: 'hk-run',
    sourceName: 'Apple Watch',
    date: '2026-05-30',
    startAt: '2026-05-30T06:00:00.000Z',
    endAt: '2026-05-30T06:40:00.000Z',
    durationSec: 2400,
    distanceKm: 5,
    avgPaceSec: 480,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    rpe: null,
    routeAvailable: false,
    laps: [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    rawAvailability: { workout: true, heartRate: false, route: false, cadence: false, runningDynamics: false },
    isSelfRace: false,
    ...overrides
  }
}

describe('toExtractedRunData self-race tagging (#235 후속 G1)', () => {
  it('isSelfRace 후보는 self-race 태그를 단다', () => {
    const data = toExtractedRunData(createCandidate({ isSelfRace: true }))
    expect(data.tags).toContain(SELF_RACE_TAG)
    expect(data.tags).toEqual(expect.arrayContaining(['healthkit', 'type:auto', SELF_RACE_TAG]))
  })

  it('일반 후보는 self-race 태그가 없다', () => {
    const data = toExtractedRunData(createCandidate({ isSelfRace: false }))
    expect(data.tags).not.toContain(SELF_RACE_TAG)
    expect(data.tags).toEqual(['healthkit', 'type:auto'])
  })
})

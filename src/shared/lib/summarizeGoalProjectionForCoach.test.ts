import { describe, expect, it } from 'vitest'
import { summarizeGoalProjectionForCoach, type RaceProjection } from '@/shared/lib/performanceProjection'

function projection(overrides: Partial<RaceProjection> = {}): RaceProjection {
  return {
    targetDistanceKm: 10,
    targetDurationSec: 3540,
    current: { runId: 'r1', date: '2026-06-15', type: 'Tempo', distanceKm: 6, durationSec: 1800, projectedSec: 3840, confidence: 'medium' },
    previous: { runId: 'r0', date: '2026-06-01', type: 'Tempo', distanceKm: 6, durationSec: 1860, projectedSec: 3960, confidence: 'medium' },
    deltaSec: -120,
    readinessScore: 72,
    readinessLevel: '보통',
    readinessSummary: '',
    factors: [],
    projectedRangeSec: [3700, 3980],
    ...overrides
  }
}

describe('summarizeGoalProjectionForCoach', () => {
  it('대시보드 projection 의 핵심 수치를 그대로 요약(통일 보장)', () => {
    const s = summarizeGoalProjectionForCoach(projection())
    expect(s).toEqual({ projectedSec: 3840, projectedRangeSec: [3700, 3980], readinessScore: 72, readinessLevel: '보통', deltaSec: -120 })
  })

  it('projection 이 없으면 null', () => {
    expect(summarizeGoalProjectionForCoach(null)).toBeNull()
  })
})

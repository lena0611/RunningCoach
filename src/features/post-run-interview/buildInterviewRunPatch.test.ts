import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { buildInterviewRunPatch, type PostRunInterviewResult } from '@/features/post-run-interview/buildInterviewRunPatch'

function run(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'r1',
    userId: 'u1',
    externalId: null,
    sessionTitle: '',
    date: '2026-06-15',
    startAt: null,
    endAt: null,
    type: 'Easy',
    distanceKm: 6,
    durationSec: 1800,
    avgPaceSec: 300,
    avgHeartRate: 150,
    maxHeartRate: 165,
    cadence: null,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: 'Unknown',
    rpe: null,
    workoutFeeling: '기존 느낌',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: [],
    source: 'healthkit',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides
  }
}

function result(overrides: Partial<PostRunInterviewResult> = {}): PostRunInterviewResult {
  return { painSeverity: 'none', areaPainLevels: [], rpe: null, conditionScore: null, ...overrides }
}

describe('buildInterviewRunPatch', () => {
  it('통증 없음: painNote 비우고 RPE·컨디션 반영', () => {
    const patch = buildInterviewRunPatch(run(), result({ painSeverity: 'none', rpe: 6, conditionScore: 8 }))
    expect(patch.painNote).toBe('')
    expect(patch.rpe).toBe(6)
    expect(patch.conditionScore).toBe(8)
  })

  it('통증 보통 + 부위: painNote 에 정도와 부위/레벨 요약', () => {
    const patch = buildInterviewRunPatch(
      run(),
      result({ painSeverity: 'moderate', areaPainLevels: [{ areaId: 'foot-sole-plantar', painLevel: 3 }] })
    )
    expect(patch.painNote).toContain('통증 보통')
    expect(patch.painNote).toContain('3/5')
  })

  it('rpe 미입력이면 기존 run.rpe 유지', () => {
    const patch = buildInterviewRunPatch(run({ rpe: 4 }), result({ rpe: null }))
    expect(patch.rpe).toBe(4)
  })

  it('컨디션 미입력이면 기존 run.conditionScore 유지', () => {
    const patch = buildInterviewRunPatch(run({ conditionScore: 7 }), result({ conditionScore: null }))
    expect(patch.conditionScore).toBe(7)
  })

  it('인터뷰는 자유메모를 더 이상 받지 않는다(자유 표현은 세션 코치 대화로)', () => {
    const patch = buildInterviewRunPatch(run({ workoutFeeling: '기존 느낌' }), result({}))
    expect(patch.workoutFeeling).toBe('기존 느낌') // 인터뷰가 덮어쓰지 않음
  })
})

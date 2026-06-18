import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { evaluateEasyRecovery, buildCoachSessionEvidence } from '@/shared/lib/coaching/sessionQuality'

// evaluateEasyRecovery는 avg/max 심박과 rpe만 사용하므로 최소 객체로 검증한다.
function run(overrides: Partial<RunLog>): RunLog {
  return { avgHeartRate: null, maxHeartRate: null, rpe: null, type: 'Easy', ...overrides } as RunLog
}

describe('evaluateEasyRecovery — Easy + Strides는 평균심박으로 판정(스트라이드 가속 비처벌)', () => {
  // 본런 Easy는 잘 유지(평균 128 < 상한 139)했지만 스트라이드에서 최고심박이 168까지 튄 케이스.
  const strideRun = run({ avgHeartRate: 128, maxHeartRate: 168, rpe: 2 })

  it('일반 Easy(최고심박 기준)면 강도 초과로 본다', () => {
    const e = evaluateEasyRecovery(strideRun, { ceilingBpm: 139, isRecovery: false })
    expect(e.intentHeld).toBe(false) // 168 - 139 = 29 초과
  })

  it('Easy + Strides(hasStrides)면 평균심박으로 봐 강도 유지로 인정', () => {
    const e = evaluateEasyRecovery(strideRun, { ceilingBpm: 139, isRecovery: false, hasStrides: true })
    expect(e.intentHeld).toBe(true) // 평균 128 ≤ 139 → 유지
    expect(e.reasons[0]).toContain('스트라이드')
  })

  it('buildCoachSessionEvidence가 Easy + Strides를 다루고 스트라이드 HR 면제 컨텍스트를 준다', () => {
    const ev = buildCoachSessionEvidence(run({ type: 'Easy + Strides', avgHeartRate: 128, maxHeartRate: 168, rpe: 2 }), {
      easyCeilingBpm: 139
    })
    expect(ev.easyRecovery?.intentHeld).toBe(true)
    expect(ev.reasons.join(' ')).toContain('심박 상한과 무관')
  })
})

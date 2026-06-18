import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { evaluateEasyRecovery, buildCoachSessionEvidence } from '@/shared/lib/coaching/sessionQuality'

// evaluateEasyRecovery는 avg/max 심박과 rpe만 사용하므로 최소 객체로 검증한다.
function run(overrides: Partial<RunLog>): RunLog {
  return { avgHeartRate: null, maxHeartRate: null, rpe: null, type: 'Easy', ...overrides } as RunLog
}

describe('evaluateEasyRecovery — 평균심박 판정(#402): 최고심박 단발 스파이크 비처벌', () => {
  // 본런은 잘 유지(평균 128 < 상한 139)했지만 최고심박이 168까지 튄 케이스(언덕/신호/스트라이드).
  const spikeRun = run({ avgHeartRate: 128, maxHeartRate: 168, rpe: null })

  it('순수 Easy도 평균심박으로 판정 — 최고심박 스파이크는 강도 초과로 안 본다', () => {
    const e = evaluateEasyRecovery(spikeRun, { ceilingBpm: 139, isRecovery: false })
    expect(e.intentHeld).toBe(true) // 평균 128 ≤ 139 → 유지 (RPE 미입력이어도)
  })

  it('평균심박이 상한+마진(5)을 넘으면 강도 초과로 잡는다', () => {
    const e = evaluateEasyRecovery(run({ avgHeartRate: 150, maxHeartRate: 165, rpe: null }), { ceilingBpm: 139, isRecovery: false })
    expect(e.intentHeld).toBe(false) // 평균 150 > 139+5 → 초과
  })

  it('Easy + Strides면 스트라이드 HR 면제 문구를 단다', () => {
    const e = evaluateEasyRecovery(spikeRun, { ceilingBpm: 139, isRecovery: false, hasStrides: true })
    expect(e.intentHeld).toBe(true)
    expect(e.reasons[0]).toContain('스트라이드')
  })

  it('Recovery는 margin 덕분에 1~2bpm 초과를 강도 초과로 단정하지 않는다', () => {
    // Z1 상한 120, 평균 122 (margin 4 이내) → 유지
    const e = evaluateEasyRecovery(run({ type: 'Recovery', avgHeartRate: 122, maxHeartRate: 140, rpe: null }), { ceilingBpm: 120, isRecovery: true })
    expect(e.intentHeld).toBe(true)
  })

  it('buildCoachSessionEvidence가 Easy + Strides를 다루고 스트라이드 HR 면제 컨텍스트를 준다', () => {
    const ev = buildCoachSessionEvidence(run({ type: 'Easy + Strides', avgHeartRate: 128, maxHeartRate: 168, rpe: 2 }), {
      easyCeilingBpm: 139
    })
    expect(ev.easyRecovery?.intentHeld).toBe(true)
    expect(ev.reasons.join(' ')).toContain('심박 상한과 무관')
  })
})

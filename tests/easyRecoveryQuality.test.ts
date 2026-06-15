import { describe, expect, it } from 'vitest'
import { evaluateEasyRecovery } from '@/shared/lib/coaching/sessionQuality'
import { makeRun } from './factories'

describe('evaluateEasyRecovery (#354 §2)', () => {
  it('상한 이내면 유지(intentHeld)', () => {
    const r = evaluateEasyRecovery(makeRun({ type: 'Recovery', avgHeartRate: 135 }), { ceilingBpm: 139, isRecovery: true })
    expect(r.intentHeld).toBe(true)
    expect(r.rpeOverride).toBe(false)
  })

  it('Recovery: 심박 소폭 초과해도 RPE 낮으면 유지 (RPE 우선)', () => {
    // 예시: ceiling 139, avg 141(+2), RPE 2 → 유지
    const r = evaluateEasyRecovery(makeRun({ type: 'Recovery', avgHeartRate: 141, rpe: 2 }), {
      ceilingBpm: 139,
      isRecovery: true
    })
    expect(r.intentHeld).toBe(true)
    expect(r.rpeOverride).toBe(true)
    expect(r.overByBpm).toBe(2)
  })

  it('심박 초과 + RPE 높으면 유지 아님', () => {
    const r = evaluateEasyRecovery(makeRun({ type: 'Recovery', avgHeartRate: 148, rpe: 6 }), {
      ceilingBpm: 139,
      isRecovery: true
    })
    expect(r.intentHeld).toBe(false)
  })

  it('RPE 낮아도 초과 폭이 과하면(>15bpm) override 안 함', () => {
    const r = evaluateEasyRecovery(makeRun({ type: 'Recovery', avgHeartRate: 160, rpe: 2 }), {
      ceilingBpm: 139,
      isRecovery: true
    })
    expect(r.intentHeld).toBe(false)
  })

  it('Easy는 +5 마진 허용', () => {
    const r = evaluateEasyRecovery(makeRun({ type: 'Easy', avgHeartRate: 148, maxHeartRate: 149 }), {
      ceilingBpm: 145,
      isRecovery: false
    })
    expect(r.intentHeld).toBe(true) // 149 vs 145+5=150 이내
  })

  it('RPE 미입력 + 초과면 유지 아님(보수적)', () => {
    const r = evaluateEasyRecovery(makeRun({ type: 'Easy', avgHeartRate: 158, maxHeartRate: 160, rpe: null }), {
      ceilingBpm: 145,
      isRecovery: false
    })
    expect(r.intentHeld).toBe(false)
  })
})

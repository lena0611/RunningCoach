import { describe, expect, it } from 'vitest'
import type { Lap, RunLog } from '@/entities/run/model'
import { evaluateLsd } from '@/shared/lib/coaching/sessionQuality'
import { makeRun } from './factories'

function lap(paceSec: number, avgHeartRate: number): Lap {
  return { distanceKm: 1, paceSec, avgHeartRate, maxHeartRate: avgHeartRate + 4 } as Lap
}
function lsd(laps: Lap[], over: Partial<RunLog> = {}): RunLog {
  return makeRun({ type: 'LSD', distanceKm: laps.length, durationSec: laps.length * 360, laps, ...over })
}

describe('evaluateLsd (#354 §5)', () => {
  it('후반 페이스업이 크면 progressive', () => {
    const r = evaluateLsd(lsd([lap(390, 138), lap(390, 139), lap(378, 143), lap(378, 144)]))
    expect(r.kind).toBe('progressive')
  })

  it('RPE 낮으면 recovery LSD', () => {
    const r = evaluateLsd(lsd([lap(400, 130), lap(401, 131), lap(402, 133), lap(403, 134)], { rpe: 2 }))
    expect(r.kind).toBe('recovery')
  })

  it('평균심박이 recovery ceiling 이하면 recovery', () => {
    const r = evaluateLsd(lsd([lap(400, 120), lap(401, 121), lap(402, 122), lap(403, 123)]), {
      recoveryCeilingBpm: 130
    })
    expect(r.kind).toBe('recovery')
  })

  it('보통 강도·완만한 드리프트면 standard + stable', () => {
    const r = evaluateLsd(lsd([lap(390, 140), lap(391, 142), lap(392, 145), lap(393, 146)]))
    expect(r.kind).toBe('standard')
    expect(r.stable).toBe(true)
  })

  it('후반 심박 급상승이면 unstable로 표시', () => {
    const r = evaluateLsd(lsd([lap(390, 135), lap(390, 136), lap(391, 150), lap(391, 151)]))
    expect(r.stable).toBe(false)
    expect(r.hrDriftBpm!).toBeGreaterThanOrEqual(12)
  })

  it('지속시간(durationMin)을 산출한다', () => {
    const r = evaluateLsd(lsd([lap(390, 140), lap(391, 141)], { durationSec: 3600 }))
    expect(r.durationMin).toBe(60)
  })
})

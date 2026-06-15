import { describe, expect, it } from 'vitest'
import type { Lap, RunLog } from '@/entities/run/model'
import { evaluateSteadyLong } from '@/shared/lib/coaching/sessionQuality'
import { makeRun } from './factories'

function lap(paceSec: number, avgHeartRate: number): Lap {
  return { distanceKm: 1, paceSec, avgHeartRate, maxHeartRate: avgHeartRate + 4 } as Lap
}
function steady(laps: Lap[]): RunLog {
  return makeRun({ type: 'Steady Long', distanceKm: laps.length, laps })
}

describe('evaluateSteadyLong (#354 §6)', () => {
  it('랩 부족이면 insufficient', () => {
    expect(evaluateSteadyLong(makeRun({ type: 'Steady Long', laps: [] })).grade).toBe('insufficient')
  })

  it('네거티브 스플릿은 보정 드리프트가 raw보다 작다', () => {
    // 후반 12s/km 빨라지고 심박 8bpm 상승 → raw 8, adjusted = 8 - 12*0.4 ≈ 3
    const r = evaluateSteadyLong(steady([lap(360, 140), lap(360, 141), lap(348, 148), lap(348, 149)]))
    expect(r.paceGainSec).toBeGreaterThan(0)
    expect(r.adjustedHrDrift!).toBeLessThan(r.rawHrDrift!)
  })

  it('안정적 후반 유지 → quality', () => {
    const r = evaluateSteadyLong(steady([lap(360, 140), lap(361, 141), lap(362, 144), lap(363, 145)]))
    expect(r.grade).toBe('quality')
  })

  it('강한 네거티브 스플릿 + 약간의 부담 → aggressive', () => {
    // 후반 14s/km 가속, 심박 13bpm 상승 → adjusted = 13 - 14*0.4 ≈ 7 (>=6), paceGain 14(>=10)
    const r = evaluateSteadyLong(steady([lap(370, 138), lap(370, 139), lap(356, 151), lap(356, 152)]))
    expect(r.grade).toBe('aggressive')
  })

  it('느려지지 않았는데 심박 급상승 → strained', () => {
    // 페이스 거의 유지, 심박 14bpm 상승 → adjusted ~14 (>=12)
    const r = evaluateSteadyLong(steady([lap(360, 135), lap(360, 136), lap(361, 149), lap(361, 150)]))
    expect(r.grade).toBe('strained')
  })

  it('후반 급락 + 심박 상승 → failed', () => {
    // 후반 25s/km 느려지고 심박 12bpm 상승
    const r = evaluateSteadyLong(steady([lap(355, 140), lap(356, 141), lap(381, 152), lap(382, 153)]))
    expect(r.grade).toBe('failed')
  })

  it('efficiencyScore는 0~100 범위', () => {
    const r = evaluateSteadyLong(steady([lap(360, 140), lap(360, 141), lap(348, 148), lap(348, 149)]))
    expect(r.efficiencyScore!).toBeGreaterThanOrEqual(0)
    expect(r.efficiencyScore!).toBeLessThanOrEqual(100)
  })
})

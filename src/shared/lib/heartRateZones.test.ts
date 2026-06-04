import { describe, expect, it } from 'vitest'
import {
  buildHeartRateZones,
  defaultHeartRateZones,
  deriveHeartRateModel,
  tanakaMaxHr
} from './heartRateZones'

describe('tanakaMaxHr', () => {
  it('208 − 0.7 × 나이로 계산한다', () => {
    expect(tanakaMaxHr(1990, 2026)).toBe(183) // age 36 → 208 - 25.2 = 182.8 → 183
    expect(tanakaMaxHr(1976, 2026)).toBe(173) // age 50 → 208 - 35 = 173
  })

  it('birthYear가 없거나 비현실적이면 null', () => {
    expect(tanakaMaxHr(null, 2026)).toBeNull()
    expect(tanakaMaxHr(undefined, 2026)).toBeNull()
    expect(tanakaMaxHr(1850, 2026)).toBeNull()
  })
})

describe('buildHeartRateZones', () => {
  it('anchor=165면 기존 기본 상수 경계와 정확히 일치한다(회귀 0)', () => {
    const zones = buildHeartRateZones(165)
    expect(zones.map((z) => [z.zone, z.minBpm, z.maxBpm])).toEqual(
      defaultHeartRateZones.map((z) => [z.zone, z.minBpm, z.maxBpm])
    )
  })

  it('경계는 항상 단조 증가한다', () => {
    const zones = buildHeartRateZones(150)
    const tops = zones.map((z) => z.maxBpm).filter((v): v is number => v !== null)
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1])
    }
  })
})

describe('deriveHeartRateModel', () => {
  it('개인값 미입력 시 기본 상수(템포 165 / 이지 145 / 회복 130)를 그대로 쓴다', () => {
    const model = deriveHeartRateModel(null, 2026)
    expect(model.source).toBe('default')
    expect(model.tempoCeilingBpm).toBe(165)
    expect(model.easyCeilingBpm).toBe(145)
    expect(model.recoveryCeilingBpm).toBe(130)
  })

  it('LTHR이 있으면 LTHR을 anchor로 쓰고 1순위로 본다', () => {
    const model = deriveHeartRateModel({ lactateThresholdHr: 170, maxHeartRate: 190, birthYear: 1990 }, 2026)
    expect(model.source).toBe('lthr')
    expect(model.anchorBpm).toBe(170)
    expect(model.tempoCeilingBpm).toBe(170)
    expect(model.easyCeilingBpm).toBe(Math.round((145 / 165) * 170)) // 149
    expect(model.recoveryCeilingBpm).toBe(Math.round((130 / 165) * 170)) // 134
  })

  it('LTHR이 없고 측정 최대심박이 있으면 %HRmax로 환산한다', () => {
    const model = deriveHeartRateModel({ maxHeartRate: 190, birthYear: 1990 }, 2026)
    expect(model.source).toBe('measured_max')
    expect(model.tempoCeilingBpm).toBe(Math.round(190 * 0.9)) // 171
    expect(model.estimatedMaxHr).toBe(190)
  })

  it('LTHR/측정값이 없으면 Tanaka(나이) 추정으로 환산하고 추정 플래그를 켠다', () => {
    const model = deriveHeartRateModel({ birthYear: 1976 }, 2026) // age 50 → Tanaka 173
    expect(model.source).toBe('age_estimated')
    expect(model.isEstimated).toBe(true)
    expect(model.estimatedMaxHr).toBe(173)
    expect(model.tempoCeilingBpm).toBe(Math.round(173 * 0.9)) // 156
  })

  it('비현실적 입력값은 무시하고 다음 우선순위로 넘어간다', () => {
    const model = deriveHeartRateModel({ lactateThresholdHr: 9, maxHeartRate: 500 }, 2026)
    expect(model.source).toBe('default')
    expect(model.tempoCeilingBpm).toBe(165)
  })
})

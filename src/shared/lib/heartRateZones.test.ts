import { describe, expect, it } from 'vitest'
import {
  buildHeartRateZones,
  deriveHeartRateModel,
  deriveObservedMaxHr,
  deriveRecommendedHeartRateModel,
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
  it('anchor가 null이면 빈 배열(존 미설정)', () => {
    expect(buildHeartRateZones(null)).toEqual([])
  })

  it('경계는 항상 단조 증가하고 Z4 상단은 anchor와 같다', () => {
    const zones = buildHeartRateZones(170)
    const tops = zones.map((z) => z.maxBpm).filter((v): v is number => v !== null)
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1])
    }
    expect(zones.find((z) => z.zone === 'Z4')?.maxBpm).toBe(170)
  })

  it('존 라벨/의미에 특정 bpm 상수(165 등)를 박지 않는다', () => {
    const text = buildHeartRateZones(165).map((z) => z.trainingMeaning).join(' ')
    expect(text).not.toMatch(/165|145|130/)
  })
})

describe('deriveObservedMaxHr', () => {
  const day = (n: number) => new Date(2026, 0, 1 + n).toISOString().slice(0, 10)
  it('표본 3개 미만이면 null', () => {
    const runs = [{ maxHeartRate: 180, date: day(1) }, { maxHeartRate: 178, date: day(2) }]
    expect(deriveObservedMaxHr(runs, new Date('2026-03-01')).observedMaxHr).toBeNull()
  })

  it('표본 4개 이상이면 최고값 1개는 센서 튐으로 보고 2번째 최고값을 쓴다', () => {
    const runs = [
      { maxHeartRate: 205, date: day(1) }, // 이상치
      { maxHeartRate: 184, date: day(2) },
      { maxHeartRate: 180, date: day(3) },
      { maxHeartRate: 175, date: day(4) }
    ]
    expect(deriveObservedMaxHr(runs, new Date('2026-03-01')).observedMaxHr).toBe(184)
  })
})

describe('deriveRecommendedHeartRateModel', () => {
  it('나이만 있으면 Tanaka 추정으로 환산한다', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: 1976 }, 2026) // age 50 → 173
    expect(model.source).toBe('age_estimated')
    expect(model.estimatedMaxHr).toBe(173)
    expect(model.tempoCeilingBpm).toBe(Math.round(173 * 0.9)) // 156
  })

  it('관측 최대심박이 나이 추정보다 높으면 상향 보정한다', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: 1976 }, 2026, { observedMaxHr: 188, sampleCount: 5 })
    expect(model.source).toBe('age_data_corrected')
    expect(model.estimatedMaxHr).toBe(188)
    expect(model.tempoCeilingBpm).toBe(Math.round(188 * 0.9)) // 169
  })

  it('관측값이 나이 추정보다 낮으면 나이 추정을 유지한다(내리지 않음)', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: 1976 }, 2026, { observedMaxHr: 160, sampleCount: 5 })
    expect(model.estimatedMaxHr).toBe(173)
    expect(model.source).toBe('age_estimated')
  })

  it('나이가 없고 관측만 있으면 데이터 추정', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: null }, 2026, { observedMaxHr: 185, sampleCount: 6 })
    expect(model.source).toBe('observed_data')
    expect(model.tempoCeilingBpm).toBe(Math.round(185 * 0.9))
  })

  it('나이도 관측도 없으면 상한 미설정(null, 165 같은 상수 fallback 없음)', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: null }, 2026, null)
    expect(model.source).toBe('insufficient')
    expect(model.tempoCeilingBpm).toBeNull()
    expect(model.easyCeilingBpm).toBeNull()
    expect(model.zones).toEqual([])
  })

  it('안정심박이 있으면 Karvonen(HRR)으로 역치를 환산한다', () => {
    // age 50 → Tanaka 173, rest 50 → 0.85×(173-50)+50 = 154.55 → 155
    const model = deriveRecommendedHeartRateModel({ birthYear: 1976, restingHeartRate: 50 }, 2026)
    expect(model.tempoCeilingBpm).toBe(Math.round(0.85 * (173 - 50) + 50)) // 155
  })

  it('안정심박이 없으면 %HRmax(0.9)로 환산한다(현행 유지)', () => {
    const model = deriveRecommendedHeartRateModel({ birthYear: 1976 }, 2026)
    expect(model.tempoCeilingBpm).toBe(Math.round(173 * 0.9)) // 156
  })
})

describe('Karvonen(HRR) — 직접입력/우선순위', () => {
  it('manual 측정 HRmax + 안정심박이면 Karvonen으로 환산', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'manual', maxHeartRate: 190, restingHeartRate: 50 }, 2026)
    expect(model.source).toBe('measured_max')
    expect(model.tempoCeilingBpm).toBe(Math.round(0.85 * (190 - 50) + 50)) // 169
  })

  it('LTHR이 있으면 안정심박과 무관하게 LTHR을 직접 anchor로 쓴다', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'manual', lactateThresholdHr: 168, restingHeartRate: 50 }, 2026)
    expect(model.source).toBe('lthr')
    expect(model.tempoCeilingBpm).toBe(168)
  })
})

describe('deriveHeartRateModel (auto/manual 토글)', () => {
  it('manual이고 LTHR이 있으면 LTHR을 anchor로 직접 쓴다', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'manual', lactateThresholdHr: 170, birthYear: 1990 }, 2026)
    expect(model.source).toBe('lthr')
    expect(model.isUserOverride).toBe(true)
    expect(model.tempoCeilingBpm).toBe(170)
  })

  it('manual이고 측정 HRmax만 있으면 %HRmax로 환산한다', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'manual', maxHeartRate: 190 }, 2026)
    expect(model.source).toBe('measured_max')
    expect(model.tempoCeilingBpm).toBe(Math.round(190 * 0.9)) // 171
  })

  it('auto면 직접입력값이 있어도 추천(나이+데이터)을 쓴다', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'auto', lactateThresholdHr: 170, birthYear: 1976 }, 2026)
    expect(model.isUserOverride).toBe(false)
    expect(model.source).toBe('age_estimated')
  })

  it('어디에도 165 상수 fallback이 없다 — 데이터 전무면 null', () => {
    const model = deriveHeartRateModel({ heartRateMode: 'auto' }, 2026, null)
    expect(model.tempoCeilingBpm).toBeNull()
  })
})

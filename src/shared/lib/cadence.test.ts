import { describe, expect, it } from 'vitest'
import { sanitizeCadence } from './cadence'

describe('sanitizeCadence', () => {
  it('정상 범위(120~230) 값은 반올림만 한다', () => {
    expect(sanitizeCadence(168)).toBe(168)
    expect(sanitizeCadence(120)).toBe(120)
    expect(sanitizeCadence(230)).toBe(230)
    expect(sanitizeCadence(171.4)).toBe(171)
  })

  it('한쪽 다리로 보이는 낮은 값은 ×2로 양발 총합 보정한다', () => {
    expect(sanitizeCadence(85)).toBe(170)
    expect(sanitizeCadence(90)).toBe(180)
  })

  it('이중 계산으로 보이는 높은 값은 ÷2로 보정한다 (284 → 142)', () => {
    expect(sanitizeCadence(284)).toBe(142)
    expect(sanitizeCadence(360)).toBe(180)
  })

  it('단위 오류로 설명되지 않는 자릿수 이상값은 null 처리한다', () => {
    // 차트에서 본 per-lap 걸음 수 추정값들
    expect(sanitizeCadence(871)).toBeNull()
    expect(sanitizeCadence(1002)).toBeNull()
    expect(sanitizeCadence(2375)).toBeNull()
    // ×2 해도 정상 범위에 못 드는 너무 낮은 값
    expect(sanitizeCadence(52)).toBeNull()
  })

  it('null/0/음수/NaN은 null을 반환한다', () => {
    expect(sanitizeCadence(null)).toBeNull()
    expect(sanitizeCadence(undefined)).toBeNull()
    expect(sanitizeCadence(0)).toBeNull()
    expect(sanitizeCadence(-10)).toBeNull()
    expect(sanitizeCadence(Number.NaN)).toBeNull()
  })
})

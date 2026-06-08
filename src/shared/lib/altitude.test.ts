import { describe, it, expect } from 'vitest'
import { sanitizeAltitudeSeries } from './altitude'

const p = (offsetSec: number, altitude: number | null) => ({ offsetSec, altitude })

describe('sanitizeAltitudeSeries', () => {
  it('단일 스파이크를 중앙값으로 교정하고 이웃은 오염시키지 않는다', () => {
    const out = sanitizeAltitudeSeries([p(0, 17), p(10, 18), p(20, -27), p(30, 18), p(40, 17)])
    expect(out.map((o) => o.altitude)).toEqual([17, 18, 18, 18, 17])
  })

  it('완만한 상승은 보존한다', () => {
    const out = sanitizeAltitudeSeries([p(0, 10), p(10, 14), p(20, 18), p(30, 22), p(40, 26)])
    expect(out.map((o) => o.altitude)).toEqual([10, 14, 18, 22, 26])
  })

  it('첫/끝 샘플은 보정하지 않는다', () => {
    const out = sanitizeAltitudeSeries([p(0, -50), p(10, 18), p(20, 18), p(30, 18), p(40, 99)])
    expect(out[0].altitude).toBe(-50)
    expect(out[4].altitude).toBe(99)
  })

  it('null 고도는 그대로 둔다', () => {
    const out = sanitizeAltitudeSeries([p(0, 17), p(10, null), p(20, 18)])
    expect(out[1].altitude).toBeNull()
  })

  it('3개 미만은 원본을 그대로 반환한다', () => {
    const input = [p(0, 17), p(10, -99)]
    expect(sanitizeAltitudeSeries(input)).toBe(input)
  })

  it('임계 이내 노이즈(±12m 이하)는 교정하지 않는다', () => {
    const out = sanitizeAltitudeSeries([p(0, 20), p(10, 30), p(20, 20)])
    expect(out[1].altitude).toBe(30)
  })
})

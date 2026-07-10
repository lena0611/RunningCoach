import { describe, expect, it } from 'vitest'
import type { Lap, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { areLapsUniformKm, computeKmSplits } from './lapSplits'

function lap(distanceKm: number | null, index = 1): Lap {
  return { index, distanceKm, paceSec: 360, avgHeartRate: 140, cadence: 170 }
}

describe('areLapsUniformKm', () => {
  it('1km 균등 오토랩(+부분 마지막)은 균등', () => {
    expect(areLapsUniformKm([lap(1.0), lap(1.01), lap(0.98), lap(0.4)])).toBe(true)
  })

  it('인터벌(서브-km 랩)은 비균등', () => {
    expect(areLapsUniformKm([lap(1.12), lap(0.06), lap(0.24), lap(0.05)])).toBe(false)
  })

  it('마일 오토랩(1.61km 균등)은 비균등 — 랩 탭으로 따로 보여준다', () => {
    expect(areLapsUniformKm([lap(1.61), lap(1.61), lap(0.8)])).toBe(false)
  })

  it('마지막 랩이 1.05km 초과(긴 쿨다운)면 비균등', () => {
    expect(areLapsUniformKm([lap(1.0), lap(1.0), lap(1.86)])).toBe(false)
  })

  it('랩 0~1개는 균등 취급(탭 없음)', () => {
    expect(areLapsUniformKm([])).toBe(true)
    expect(areLapsUniformKm([lap(5.2)])).toBe(true)
  })

  it('본문 랩 거리 미상(null)이면 판정 불가 → 균등 취급', () => {
    expect(areLapsUniformKm([lap(null), lap(1.0), lap(0.4)])).toBe(true)
  })
})

function straightRoute(totalMeters: number, speedMps: number, stepSec: number): RunRoutePoint[] {
  // 적도에서 경도 1도 ≈ 111,320m — 동쪽 직선 이동으로 정확한 거리를 만든다.
  const points: RunRoutePoint[] = []
  const totalSec = totalMeters / speedMps
  for (let t = 0; t <= totalSec; t += stepSec) {
    points.push({ offsetSec: t, latitude: 0, longitude: (speedMps * t) / 111320, altitude: null })
  }
  return points
}

describe('computeKmSplits', () => {
  it('경로 기반: 2.5km 등속 주행 → 1km 2개 + 0.5km 부분 스플릿', () => {
    const route = straightRoute(2500, 5, 10) // 5m/s, 500초
    const splits = computeKmSplits({ routePoints: route })
    expect(splits.length).toBe(3)
    expect(splits[0].distanceKm).toBeGreaterThanOrEqual(1.0)
    expect(splits[0].distanceKm).toBeLessThan(1.06)
    // 5m/s = 200초/km
    expect(splits[0].paceSec).toBeGreaterThan(190)
    expect(splits[0].paceSec).toBeLessThan(210)
    expect(splits[2].distanceKm as number).toBeLessThan(0.6)
  })

  it('경로 기반: 마지막 부분 구간 100m 미만이면 버린다', () => {
    const route = straightRoute(2050, 5, 10)
    const splits = computeKmSplits({ routePoints: route })
    expect(splits.length).toBe(2)
  })

  it('샘플 페이스 기반 fallback: 300초/km 등속 20분 → 4km 스플릿 4개', () => {
    const samples: RunMetricSample[] = []
    for (let t = 0; t <= 1200; t += 10) {
      samples.push({ offsetSec: t, heartRate: 150, paceSec: 300, cadence: 172 })
    }
    const splits = computeKmSplits({ metricSamples: samples })
    expect(splits.length).toBe(4)
    expect(splits[1].paceSec).toBeGreaterThan(290)
    expect(splits[1].paceSec).toBeLessThan(310)
    expect(splits[1].avgHeartRate).toBe(150)
    expect(splits[1].cadence).toBe(172)
  })

  it('경로도 페이스 샘플도 없으면 빈 배열(호출부는 랩 단일 뷰)', () => {
    expect(computeKmSplits({})).toEqual([])
    expect(computeKmSplits({ metricSamples: [{ offsetSec: 0, heartRate: 140, paceSec: null, cadence: null }] })).toEqual([])
  })

  it('스플릿 심박은 해당 시간 구간 샘플 평균', () => {
    const route = straightRoute(2000, 5, 10) // 1km당 200초
    const samples: RunMetricSample[] = []
    for (let t = 0; t <= 400; t += 10) {
      samples.push({ offsetSec: t, heartRate: t <= 200 ? 130 : 160, paceSec: null, cadence: null })
    }
    const splits = computeKmSplits({ routePoints: route, metricSamples: samples })
    // 경도→미터 근사 오차로 경계가 샘플 1개(10초) 밀릴 수 있어 정확값 대신 밴드로 본다.
    expect(splits[0].avgHeartRate).toBeGreaterThanOrEqual(129)
    expect(splits[0].avgHeartRate).toBeLessThanOrEqual(133)
    expect(splits[1].avgHeartRate).toBeGreaterThan(155)
  })
})

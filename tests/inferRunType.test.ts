import { describe, expect, it } from 'vitest'
import { inferRunType } from '@/features/infer-run-type/inferRunType'
import type { FastSegment, Lap, RunRoutePoint } from '@/entities/run/model'

describe('inferRunType', () => {
  it('treats low-heart-rate running as Easy before pace-based Tempo', () => {
    const laps: Lap[] = [
      { index: 1, distanceKm: 1, paceSec: 382, avgHeartRate: 132, cadence: 166 },
      { index: 2, distanceKm: 1, paceSec: 376, avgHeartRate: 136, cadence: 167 },
      { index: 3, distanceKm: 1, paceSec: 371, avgHeartRate: 139, cadence: 168 },
      { index: 4, distanceKm: 1, paceSec: 384, avgHeartRate: 137, cadence: 166 }
    ]

    expect(inferRunType({
      date: '2026-05-19',
      distanceKm: 4,
      avgPaceSec: 378,
      avgHeartRate: 136,
      laps,
      fastSegments: []
    })).toBe('Easy')
  })

  it('keeps the 2026-05-26 representative Easy + Strides pattern from Tuesday routine and repeated short accelerations', () => {
    const fastSegments: FastSegment[] = Array.from({ length: 8 }, (_, index) => ({
      index: index + 1,
      startSec: 520 + index * (95 + (index % 3) * 22),
      durationSec: 12 + (index % 4) * 7,
      distanceKm: 0.05 + (index % 3) * 0.01,
      avgPaceSec: 265 + (index % 3) * 18,
      bestPaceSec: 240 + (index % 4) * 12
    }))

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 6.2,
      avgPaceSec: 455,
      avgHeartRate: 136,
      laps: [
        { index: 1, distanceKm: 1, paceSec: 480, avgHeartRate: 124, cadence: 162 },
        { index: 2, distanceKm: 1, paceSec: 455, avgHeartRate: 132, cadence: 164 },
        { index: 3, distanceKm: 1, paceSec: 430, avgHeartRate: 140, cadence: 170 },
        { index: 4, distanceKm: 1, paceSec: 470, avgHeartRate: 136, cadence: 164 },
        { index: 5, distanceKm: 1, paceSec: 475, avgHeartRate: 134, cadence: 164 },
        { index: 6, distanceKm: 1.2, paceSec: 485, avgHeartRate: 130, cadence: 162 }
      ],
      fastSegments,
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo', '토요일: LSD 또는 Steady Long']
    })).toBe('Easy + Strides')
  })

  it('accepts Korean stride schedule labels when fast segment timing is noisy', () => {
    const fastSegments: FastSegment[] = [
      { index: 1, startSec: 470, durationSec: 9, distanceKm: 0.03, avgPaceSec: 338, bestPaceSec: 318 },
      { index: 2, startSec: 585, durationSec: 41, distanceKm: 0.12, avgPaceSec: 342, bestPaceSec: 300 },
      { index: 3, startSec: 755, durationSec: 18, distanceKm: 0.06, avgPaceSec: 310, bestPaceSec: 288 },
      { index: 4, startSec: 830, durationSec: 29, distanceKm: 0.08, avgPaceSec: 320, bestPaceSec: 292 }
    ]

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.8,
      avgPaceSec: 470,
      avgHeartRate: 134,
      laps: [
        { index: 1, distanceKm: 1, paceSec: 500, avgHeartRate: 122, cadence: 162 },
        { index: 2, distanceKm: 1, paceSec: 450, avgHeartRate: 135, cadence: 166 },
        { index: 3, distanceKm: 1, paceSec: 455, avgHeartRate: 138, cadence: 168 },
        { index: 4, distanceKm: 1, paceSec: 485, avgHeartRate: 132, cadence: 163 }
      ],
      fastSegments,
      weeklyPattern: ['화요일: Easy + 스트라이드', '목요일: Tempo']
    })).toBe('Easy + Strides')
  })

  it('infers Easy + Strides from HealthKit route fast segments even when laps are 1km splits', () => {
    const fastSegments: FastSegment[] = [
      { index: 1, startSec: 610, durationSec: 18, distanceKm: 0.07, avgPaceSec: 257, bestPaceSec: 240 },
      { index: 2, startSec: 728, durationSec: 21, distanceKm: 0.08, avgPaceSec: 263, bestPaceSec: 238 },
      { index: 3, startSec: 850, durationSec: 20, distanceKm: 0.08, avgPaceSec: 250, bestPaceSec: 232 },
      { index: 4, startSec: 970, durationSec: 19, distanceKm: 0.07, avgPaceSec: 271, bestPaceSec: 246 },
      { index: 5, startSec: 1090, durationSec: 22, distanceKm: 0.08, avgPaceSec: 275, bestPaceSec: 248 },
      { index: 6, startSec: 1215, durationSec: 18, distanceKm: 0.07, avgPaceSec: 257, bestPaceSec: 236 }
    ]

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.2,
      avgPaceSec: 470,
      avgHeartRate: 136,
      laps: [
        { index: 1, distanceKm: 1, paceSec: 500, avgHeartRate: 124, cadence: 162 },
        { index: 2, distanceKm: 1, paceSec: 455, avgHeartRate: 136, cadence: 166 },
        { index: 3, distanceKm: 1, paceSec: 448, avgHeartRate: 141, cadence: 168 },
        { index: 4, distanceKm: 1, paceSec: 482, avgHeartRate: 135, cadence: 163 },
        { index: 5, distanceKm: 1.2, paceSec: 492, avgHeartRate: 131, cadence: 162 }
      ],
      fastSegments,
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo', '토요일: LSD 또는 Steady Long']
    })).toBe('Easy + Strides')
  })

  it('does not force Easy + Strides from HealthKit 1km splits when route fast segments are missing', () => {
    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.2,
      avgPaceSec: 470,
      avgHeartRate: 136,
      laps: [
        { index: 1, distanceKm: 1, paceSec: 500, avgHeartRate: 124, cadence: 162 },
        { index: 2, distanceKm: 1, paceSec: 455, avgHeartRate: 136, cadence: 166 },
        { index: 3, distanceKm: 1, paceSec: 448, avgHeartRate: 141, cadence: 168 },
        { index: 4, distanceKm: 1, paceSec: 482, avgHeartRate: 135, cadence: 163 },
        { index: 5, distanceKm: 1.2, paceSec: 492, avgHeartRate: 131, cadence: 162 }
      ],
      fastSegments: [],
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo', '토요일: LSD 또는 Steady Long']
    })).toBe('Easy')
  })

  it('detects 2026-05-26 style Easy + Strides from workout split laps even when route fast segments are missing', () => {
    const laps: Lap[] = [
      { index: 1, distanceKm: 1.25, paceSec: 480, avgHeartRate: 126, cadence: 162 },
      { index: 2, distanceKm: 0.07, paceSec: 265, avgHeartRate: 138, cadence: 184 },
      { index: 3, distanceKm: 0.2, paceSec: 515, avgHeartRate: 134, cadence: 160 },
      { index: 4, distanceKm: 0.08, paceSec: 255, avgHeartRate: 140, cadence: 186 },
      { index: 5, distanceKm: 0.19, paceSec: 525, avgHeartRate: 135, cadence: 159 },
      { index: 6, distanceKm: 0.08, paceSec: 270, avgHeartRate: 141, cadence: 184 },
      { index: 7, distanceKm: 0.21, paceSec: 505, avgHeartRate: 136, cadence: 160 },
      { index: 8, distanceKm: 0.07, paceSec: 275, avgHeartRate: 142, cadence: 183 },
      { index: 9, distanceKm: 0.2, paceSec: 520, avgHeartRate: 135, cadence: 159 },
      { index: 10, distanceKm: 0.08, paceSec: 260, avgHeartRate: 143, cadence: 185 },
      { index: 11, distanceKm: 0.19, paceSec: 530, avgHeartRate: 136, cadence: 158 },
      { index: 12, distanceKm: 0.07, paceSec: 280, avgHeartRate: 142, cadence: 182 },
      { index: 13, distanceKm: 0.2, paceSec: 510, avgHeartRate: 135, cadence: 160 },
      { index: 14, distanceKm: 0.08, paceSec: 265, avgHeartRate: 143, cadence: 184 },
      { index: 15, distanceKm: 0.2, paceSec: 520, avgHeartRate: 136, cadence: 159 },
      { index: 16, distanceKm: 0.07, paceSec: 275, avgHeartRate: 142, cadence: 183 },
      { index: 17, distanceKm: 1.95, paceSec: 490, avgHeartRate: 132, cadence: 162 }
    ]

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.19,
      avgPaceSec: 470,
      avgHeartRate: 136,
      laps,
      fastSegments: [],
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo', '토요일: LSD 또는 Steady Long']
    })).toBe('Easy + Strides')
  })

  it('detects 2026-05-26 style Easy + Strides from route points when HealthKit does not provide fastSegments', () => {
    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.37,
      avgPaceSec: 460,
      avgHeartRate: 135,
      laps: [
        { index: 1, distanceKm: 1, paceSec: 500, avgHeartRate: 124, cadence: 162 },
        { index: 2, distanceKm: 1, paceSec: 455, avgHeartRate: 136, cadence: 166 },
        { index: 3, distanceKm: 1, paceSec: 448, avgHeartRate: 141, cadence: 168 },
        { index: 4, distanceKm: 1, paceSec: 482, avgHeartRate: 135, cadence: 163 },
        { index: 5, distanceKm: 1.37, paceSec: 492, avgHeartRate: 131, cadence: 162 }
      ],
      fastSegments: [],
      routePoints: buildRoutePointsWithStrides(),
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo', '토요일: LSD 또는 Steady Long']
    })).toBe('Easy + Strides')
  })

  it('keeps steady route point data as Easy when repeated route accelerations are missing', () => {
    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.3,
      avgPaceSec: 470,
      avgHeartRate: 136,
      laps: [],
      fastSegments: [],
      routePoints: buildSteadyRoutePoints(),
      weeklyPattern: ['화요일: Easy + Strides', '목요일: Tempo']
    })).toBe('Easy')
  })
})

function buildRoutePointsWithStrides(): RunRoutePoint[] {
  return buildRoutePoints((offsetSec) => {
    const strideStarts = [660, 780, 900, 1020, 1140, 1260, 1380, 1500]
    const inStride = strideStarts.some((start) => offsetSec >= start && offsetSec < start + 20)
    return inStride ? 305 : 475 + (offsetSec % 80)
  })
}

function buildSteadyRoutePoints(): RunRoutePoint[] {
  return buildRoutePoints((offsetSec) => 462 + (offsetSec % 70))
}

function buildRoutePoints(paceAt: (offsetSec: number) => number): RunRoutePoint[] {
  const points: RunRoutePoint[] = []
  let latitude = 37.45
  const longitude = 126.88
  points.push({ offsetSec: 0, latitude, longitude, altitude: null })

  for (let offsetSec = 10; offsetSec <= 2460; offsetSec += 10) {
    const paceSec = paceAt(offsetSec - 10)
    const distanceM = (10 / paceSec) * 1000
    latitude += distanceM / 111111
    points.push({ offsetSec, latitude, longitude, altitude: null })
  }

  return points
}

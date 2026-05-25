import { describe, expect, it } from 'vitest'
import { inferRunType } from '@/features/infer-run-type/inferRunType'
import type { FastSegment, Lap } from '@/entities/run/model'

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

  it('detects Easy + Strides from Tuesday routine and repeated short accelerations', () => {
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
})

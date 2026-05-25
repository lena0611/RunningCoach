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
      startSec: 600 + index * 120,
      durationSec: 20,
      distanceKm: 0.08,
      avgPaceSec: 250,
      bestPaceSec: 235
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
})

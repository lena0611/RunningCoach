import { describe, expect, it } from 'vitest'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { getEasyRatio, getNextSessionRecommendation } from '@/shared/lib/runStats'
import { makeRun } from './factories'

describe('runStats', () => {
  it('calculates Easy ratio from lap pace rather than saved run type', () => {
    const runs = [
      makeRun({
        type: 'Tempo',
        avgPaceSec: 360,
        distanceKm: 4,
        laps: [
          { index: 1, distanceKm: 1, paceSec: 430, avgHeartRate: 120, cadence: 162 },
          { index: 2, distanceKm: 1, paceSec: 420, avgHeartRate: 122, cadence: 163 },
          { index: 3, distanceKm: 1, paceSec: 360, avgHeartRate: 155, cadence: 170 },
          { index: 4, distanceKm: 1, paceSec: 350, avgHeartRate: 160, cadence: 172 }
        ]
      })
    ]

    expect(getEasyRatio(runs)).toBe(50)
  })

  it('recommends recovery after a previous-day long run before weekly routine', () => {
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [
        makeRun({
          date: '2026-05-23',
          type: 'LSD',
          distanceKm: 12.88,
          durationSec: 5581,
          avgPaceSec: 433
        })
      ],
      new Date('2026-05-24T09:00:00+09:00')
    )

    expect(recommendation.title).toBe('Recovery 또는 완전 휴식')
    expect(recommendation.reason).toContain('2026-05-23(토)')
    expect(recommendation.intensity).toContain('7:13')
  })

  it('alternates the next long run type from the latest Saturday 10km+ run', () => {
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [
        makeRun({
          date: '2026-05-16',
          type: 'Steady Long',
          distanceKm: 12,
          avgPaceSec: 405
        })
      ],
      new Date('2026-05-22T09:00:00+09:00')
    )

    expect(recommendation.title).toBe('토요일 LSD')
    expect(recommendation.intensity).toContain('7:05~7:30/km')
  })

  it('keeps today weekly routine when yesterday was an extra easy run', () => {
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [
        makeRun({
          date: '2026-05-25',
          type: 'Easy',
          sessionTitle: '추가 이지런',
          distanceKm: 5,
          avgPaceSec: 470,
          avgHeartRate: 128
        })
      ],
      new Date('2026-05-26T09:00:00+09:00')
    )

    expect(recommendation.title).toBe('Easy + Strides')
    expect(recommendation.reason).toContain('화요일: Easy + Strides')
    expect(recommendation.intensity).toContain('무리하지 않는 기본 강도')
  })
})

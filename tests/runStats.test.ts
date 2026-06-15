import { describe, expect, it } from 'vitest'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { getEasyRatio, getNextSessionRecommendation, getTrainingDayView } from '@/shared/lib/runStats'
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

  it('keeps weekly routine after a previous-day long run', () => {
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

    expect(recommendation.title).toBe('Easy + Strides')
    expect(recommendation.plannedDate).toBe('2026-05-26')
    expect(recommendation.reason).toContain('2026-05-23(토)')
    expect(recommendation.intensity).toContain('주간 훈련 스케줄')
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
    expect(recommendation.plannedDate).toBe('2026-05-26')
    expect(recommendation.reason).toContain('화요일: Easy + Strides')
    expect(recommendation.reason).toContain('추가런')
    expect(recommendation.intensity).toContain('주간 훈련 스케줄')
  })

  it('advances to the next planned day when today’s session is already done (#352)', () => {
    // 오늘=2026-05-26(화, 예정 Easy+Strides). 오늘 이미 수행 → 다음 예정일(목)로 넘어가야 한다.
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [makeRun({ date: '2026-05-26', type: 'Easy', distanceKm: 6 })],
      new Date('2026-05-26T18:00:00+09:00')
    )
    expect(recommendation.plannedDate).not.toBe('2026-05-26')
    expect(recommendation.dayName).toBe('목요일')
  })

  it('keeps today when today is a planned day and not yet performed (#352)', () => {
    // 오늘=2026-05-26(화), 오늘 런 없음 → 오늘 세션을 그대로 추천.
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [makeRun({ date: '2026-05-24', type: 'Easy', distanceKm: 5 })],
      new Date('2026-05-26T09:00:00+09:00')
    )
    expect(recommendation.plannedDate).toBe('2026-05-26')
  })

  describe('getTrainingDayView (#352)', () => {
    it('오늘 예정·미수행이면 pending + 코칭 한마디 + 다음은 미래 예정일', () => {
      const view = getTrainingDayView(
        initialTrainingMemory,
        [makeRun({ date: '2026-05-24', type: 'Easy', distanceKm: 5 })],
        new Date('2026-05-26T09:00:00+09:00') // 화요일, 오늘 런 없음
      )
      expect(view.today.state).toBe('pending')
      expect(view.today.title).toBeTruthy()
      expect(view.next?.date).not.toBe('2026-05-26')
    })

    it('오늘 이미 수행했으면 done + 요약', () => {
      const view = getTrainingDayView(
        initialTrainingMemory,
        [makeRun({ date: '2026-05-26', type: 'Easy', distanceKm: 6.2, durationSec: 1930 })],
        new Date('2026-05-26T19:00:00+09:00')
      )
      expect(view.today.state).toBe('done')
      expect(view.today.doneSummary).toContain('km')
    })

    it('오늘 예정 세션이 없으면 rest', () => {
      const view = getTrainingDayView(
        initialTrainingMemory,
        [],
        new Date('2026-05-27T09:00:00+09:00') // 수요일 — 화/목/토 패턴에 없음
      )
      expect(view.today.state).toBe('rest')
    })
  })
})

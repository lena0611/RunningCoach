import { describe, expect, it } from 'vitest'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { getEasyRatio, getNextSessionRecommendation, getTrainingDayView } from '@/shared/lib/runStats'
import { makeRun } from './factories'

/*
  주간 루틴 메모(weeklyPattern)를 걷어냈다(2026-09-07) — 루틴의 정본은 목표로 생성되는
  주기화 플랜(training_schedule)이다. 메모로 "오늘/다음 예정 요일"을 만들던 케이스들은
  그 기능과 함께 제거했고, 여기 남은 것은 메모와 무관한 계산(Easy 비율·롱런 교대·수행/휴식 뷰)이다.
*/
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

  describe('getTrainingDayView (#352)', () => {
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

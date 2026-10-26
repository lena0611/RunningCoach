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

    // 기준 Easy 7:12/km → Easy 하한 6:29(0.90E). 430·420 랩만 Easy.
    expect(getEasyRatio(runs, 432)).toBe(50)
  })

  // #878 A5: 같은 런이라도 러너마다 Easy 기준이 다르다 — 개발자 페이스(6:30)로 모두를 재지 않는다.
  it('Easy 비율은 그 사람의 Easy 페이스 기준이다', () => {
    const run = makeRun({
      distanceKm: 4,
      laps: [1, 2, 3, 4].map((index) => ({ index, distanceKm: 1, paceSec: 300, avgHeartRate: null, cadence: null }))
    })
    expect(getEasyRatio([run], 300)).toBe(100) // 5:00 가 평소인 러너에겐 Easy
    expect(getEasyRatio([run], 432)).toBe(0) // 7:12 가 평소인 러너에겐 Easy 아님
    expect(getEasyRatio([run], null)).toBeNull() // 기준이 없으면 모른다
    expect(getEasyRatio([], 432)).toBeNull() // 기록이 없어도 모른다 — "0%" 아님
  })

  // #878 A4: 플랜이 없으면 무엇을 할지 지어내지 않는다 — 예전엔 매일 "토요일 LSD"를 오늘로 냈다.
  it('플랜이 없으면 오늘 편한 Easy 만 권한다(롱런 요일·토요일 10km 기준 없음)', () => {
    const recommendation = getNextSessionRecommendation(
      initialTrainingMemory,
      [makeRun({ date: '2026-05-16', type: 'Steady Long', distanceKm: 12, avgPaceSec: 405 })],
      new Date('2026-05-22T09:00:00+09:00')
    )

    expect(recommendation.title).toBe('Easy')
    expect(recommendation.plannedDate).toBe('2026-05-22')
    expect(`${recommendation.reason} ${recommendation.intensity}`).not.toMatch(/토요일|LSD|10km/)
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

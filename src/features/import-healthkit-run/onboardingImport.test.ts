import { describe, expect, it } from 'vitest'
import type { HealthKitRunCandidate } from './healthKitBridge'
import {
  answerBelowRecord,
  distanceKeyFromLongestKm,
  filterFromImportDate,
  summarizeHealthKitPreview,
  weeklyDaysFromPreview
} from './onboardingImport'

const run = (date: string, distanceKm: number) => ({ date, distanceKm }) as HealthKitRunCandidate
const today = '2026-10-26'

describe('온보딩 기록 가져오기 판정 (#870)', () => {
  it('미리보기 요약 — 개수·기간·최장·최근 4주 평균·마지막 러닝', () => {
    const s = summarizeHealthKitPreview(
      [run('2026-08-12', 3), run('2026-09-28', 7.2), run('2026-10-05', 4), run('2026-10-08', 4), run('2026-10-11', 4)],
      today
    )
    expect(s).toMatchObject({ count: 5, firstDate: '2026-08-12', lastDate: '2026-10-11', longestKm: 7.2, longestDate: '2026-09-28', daysSinceLast: 15 })
    // 최근 28일(9/29~10/26): 10/05·10/08·10/11 = 12km · 3회 → 주 3km · 0.8회
    expect(s.recentKmPerWeek).toBe(3)
    expect(s.recentRunsPerWeek).toBe(0.8)
  })

  it('기록이 없으면 0·null', () => {
    expect(summarizeHealthKitPreview([], today)).toMatchObject({ count: 0, lastDate: null, longestKm: 0, daysSinceLast: null })
  })

  it('기록상 완주 거리는 레벨 거리 클래스와 같은 기준', () => {
    expect(distanceKeyFromLongestKm(4.9)).toBe('pre')
    expect(distanceKeyFromLongestKm(7.2)).toBe('5k')
    expect(distanceKeyFromLongestKm(21.2)).toBe('half')
  })

  it('고른 답이 기록보다 낮을 때만 어긋남', () => {
    expect(answerBelowRecord('pre', '5k')).toBe(true)
    expect(answerBelowRecord('10k', '5k')).toBe(false)
    expect(answerBelowRecord('5k', '5k')).toBe(false)
  })

  it('주간 횟수 미리 채우기 — 최근 4주 평균 반올림(하한 3), 기록 없으면 null', () => {
    expect(weeklyDaysFromPreview(summarizeHealthKitPreview([run('2026-10-20', 3), run('2026-10-22', 3), run('2026-10-15', 3), run('2026-10-13', 3), run('2026-10-08', 3), run('2026-10-06', 3), run('2026-10-01', 3), run('2026-09-30', 3), run('2026-09-29', 3), run('2026-10-24', 3)], today))).toBe(3)
    expect(weeklyDaysFromPreview(summarizeHealthKitPreview([run('2026-08-01', 5)], today))).toBeNull()
    // 주 1회 남짓이어도 목표는 플랜 하한 3회부터
    expect(weeklyDaysFromPreview(summarizeHealthKitPreview([run('2026-10-05', 4), run('2026-10-12', 4), run('2026-10-19', 4)], today))).toBe(3)
  })

  it('"오늘부터만" 기준일 이전 후보는 뺀다', () => {
    const list = [run('2026-10-25', 3), run('2026-10-26', 3), run('2026-10-27', 3)]
    expect(filterFromImportDate(list, '2026-10-26').map((c) => c.date)).toEqual(['2026-10-26', '2026-10-27'])
    expect(filterFromImportDate(list, null)).toHaveLength(3)
  })
})

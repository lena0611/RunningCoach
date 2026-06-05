import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { buildVisibleRunGroups, groupRunsByMonth, summarizeMonthRuns } from './runLogSummary'

function run(date: string, distanceKm: number, durationSec: number | null = 3000, activeEnergyKcal: number | null = 300): RunLog {
  return {
    id: `run-${date}-${distanceKm}`, userId: 'u', externalId: null, sessionTitle: '', date,
    startAt: null, endAt: null, type: 'Easy', distanceKm, durationSec, avgPaceSec: null,
    avgHeartRate: null, maxHeartRate: null, cadence: null, activeEnergyKcal, temperature: null,
    humidity: null, windMps: null, elevationGainM: null, elevationLossM: null, courseType: 'Unknown',
    rpe: null, workoutFeeling: '', painNote: '', sleepQuality: null, conditionScore: null,
    stressLevel: null, companion: '', memo: '', laps: [], fastSegments: [], metricSamples: [],
    routePoints: [], tags: [], source: 'manual', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`
  }
}

// 한 달 안에 day=01..n 세션을 만든다 (최신순 정렬 입력을 흉내내려 day 역순).
function monthRuns(month: string, count: number, distanceKm = 10): RunLog[] {
  return Array.from({ length: count }, (_, i) =>
    run(`${month}-${String(count - i).padStart(2, '0')}`, distanceKm)
  )
}

describe('summarizeMonthRuns', () => {
  it('전체 합계와 평균, 평균 페이스를 계산한다', () => {
    const runs = [run('2026-05-03', 10, 3000, 400), run('2026-05-02', 5, 1500, 200)]
    const summary = summarizeMonthRuns(runs)
    expect(summary.runCount).toBe(2)
    expect(summary.totalDistanceKm).toBe(15)
    expect(summary.avgDistanceKm).toBe(7.5)
    expect(summary.totalDurationSec).toBe(4500)
    expect(summary.totalCalories).toBe(600)
    // 평균 페이스 = 총시간/총거리 = 4500/15 = 300 s/km
    expect(summary.avgPaceSec).toBe(300)
  })

  it('유효하지 않은 시간/칼로리는 제외하고 거리는 0 처리한다', () => {
    const runs = [run('2026-05-02', 8, null, null), run('2026-05-01', 0, 0, null)]
    const summary = summarizeMonthRuns(runs)
    expect(summary.totalDurationSec).toBeNull()
    expect(summary.totalCalories).toBeNull()
    expect(summary.avgPaceSec).toBeNull()
    expect(summary.totalDistanceKm).toBe(8)
  })
})

describe('groupRunsByMonth', () => {
  it('YYYY-MM 단위로 묶고 각 그룹 요약을 그 달 전체로 계산한다', () => {
    const groups = groupRunsByMonth([...monthRuns('2026-05', 3), ...monthRuns('2026-04', 2)])
    expect(groups.map((g) => g.key)).toEqual(['2026-05', '2026-04'])
    expect(groups[0].summary.runCount).toBe(3)
    expect(groups[1].summary.runCount).toBe(2)
    expect(groups[1].summary.totalDistanceKm).toBe(20)
  })
})

describe('buildVisibleRunGroups (회귀 방지: 부분 표시에서도 요약은 전체 월 기준)', () => {
  // 5월 9개 + 4월 5개. limit=10이면 5월 9개 + 4월 1개만 표시되어 두 달이 보인다.
  const all = [...monthRuns('2026-05', 9), ...monthRuns('2026-04', 5)]
  const groups = groupRunsByMonth(all)

  it('표시할 세션 행은 limit까지만 자른다', () => {
    const visible = buildVisibleRunGroups(groups, 10)
    expect(visible.map((g) => g.key)).toEqual(['2026-05', '2026-04'])
    expect(visible[0].runs).toHaveLength(9)
    expect(visible[1].runs).toHaveLength(1) // 4월은 1개만 로드/표시
    const totalShown = visible.reduce((sum, g) => sum + g.runs.length, 0)
    expect(totalShown).toBe(10)
  })

  it('부분 표시된 달의 요약은 로드된 일부가 아니라 그 달 전체로 계산된다', () => {
    const visible = buildVisibleRunGroups(groups, 10)
    const april = visible[1]
    // 버그였다면 표시된 1개만 집계해 runCount=1, totalDistanceKm=10 이 됐다.
    expect(april.summary.runCount).toBe(5)
    expect(april.summary.totalDistanceKm).toBe(50)
    expect(april.summary.avgDistanceKm).toBe(10)
  })

  it('limit이 0 이하면 빈 배열', () => {
    expect(buildVisibleRunGroups(groups, 0)).toEqual([])
  })

  it('limit이 전체보다 크면 모든 그룹과 모든 세션을 표시한다', () => {
    const visible = buildVisibleRunGroups(groups, 100)
    expect(visible[0].runs).toHaveLength(9)
    expect(visible[1].runs).toHaveLength(5)
  })
})

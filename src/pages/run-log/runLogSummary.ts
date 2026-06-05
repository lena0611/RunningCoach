import type { RunLog } from '@/entities/run/model'

export type RunMonthSummary = {
  runCount: number
  totalDurationSec: number | null
  avgDurationSec: number | null
  totalCalories: number | null
  avgCalories: number | null
  totalDistanceKm: number
  avgDistanceKm: number
  avgPaceSec: number | null
}

export type RunMonthGroup = {
  key: string
  title: string
  runs: RunLog[]
  summary: RunMonthSummary
}

export function createEmptyMonthSummary(): RunMonthSummary {
  return {
    runCount: 0,
    totalDurationSec: null,
    avgDurationSec: null,
    totalCalories: null,
    avgCalories: null,
    totalDistanceKm: 0,
    avgDistanceKm: 0,
    avgPaceSec: null
  }
}

export function formatMonthHeading(monthKey: string) {
  const [year, month] = monthKey.split('-')
  return `${year}년 ${Number(month)}월`
}

export function summarizeMonthRuns(runs: RunLog[]): RunMonthSummary {
  const runCount = runs.length
  const durationValues = runs
    .map((run) => run.durationSec)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  const calorieValues = runs
    .map((run) => run.activeEnergyKcal)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const totalDurationSec = durationValues.length ? durationValues.reduce((sum, value) => sum + value, 0) : null
  const totalCalories = calorieValues.length ? calorieValues.reduce((sum, value) => sum + value, 0) : null
  const totalDistanceKm = runs.reduce((sum, run) => sum + (Number.isFinite(run.distanceKm) ? run.distanceKm : 0), 0)

  return {
    runCount,
    totalDurationSec,
    avgDurationSec: totalDurationSec === null || !durationValues.length ? null : totalDurationSec / durationValues.length,
    totalCalories,
    avgCalories: totalCalories === null || !calorieValues.length ? null : totalCalories / calorieValues.length,
    totalDistanceKm,
    avgDistanceKm: runCount ? totalDistanceKm / runCount : 0,
    avgPaceSec: totalDurationSec !== null && totalDistanceKm > 0 ? totalDurationSec / totalDistanceKm : null
  }
}

export function groupRunsByMonth(runs: RunLog[]): RunMonthGroup[] {
  const groups: RunMonthGroup[] = []
  for (const run of runs) {
    const key = run.date.slice(0, 7)
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { key, title: formatMonthHeading(key), runs: [], summary: createEmptyMonthSummary() }
      groups.push(group)
    }
    group.runs.push(run)
  }
  return groups.map((group) => ({
    ...group,
    summary: summarizeMonthRuns(group.runs)
  }))
}

// 무한스크롤 점진 렌더링용 헬퍼.
// 월별 요약(`summary`)은 입력 `groups`에서 그 달 전체 세션 기준으로 이미 계산돼 있으므로 그대로 유지하고,
// 화면에 그릴 세션 행 개수만 `limit`까지 누적 제한한다.
// 이렇게 분리해야 두 달 경계에서 아래쪽 달이 부분 로드돼도 요약값이 전체 월 기준으로 정확하다.
export function buildVisibleRunGroups(groups: RunMonthGroup[], limit: number): RunMonthGroup[] {
  if (limit <= 0) return []
  const result: RunMonthGroup[] = []
  let shown = 0
  for (const group of groups) {
    if (shown >= limit) break
    const remaining = limit - shown
    const runsToShow = remaining >= group.runs.length ? group.runs : group.runs.slice(0, remaining)
    result.push({ ...group, runs: runsToShow })
    shown += runsToShow.length
  }
  return result
}

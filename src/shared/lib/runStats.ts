import type { Lap, RunLog, RunType } from '@/entities/run/model'

const dayMs = 24 * 60 * 60 * 1000
const easyPaceThresholdSec = 390

export function getRunsWithinDays(runs: RunLog[], days: number, today = new Date()): RunLog[] {
  const start = new Date(today.getTime() - (days - 1) * dayMs)
  start.setHours(0, 0, 0, 0)
  return runs.filter((run) => new Date(run.date) >= start)
}

export function sumDistance(runs: RunLog[]): number {
  return round(runs.reduce((sum, run) => sum + run.distanceKm, 0))
}

export function getThisWeekRuns(runs: RunLog[], today = new Date()): RunLog[] {
  const start = new Date(today)
  const day = start.getDay()
  const diff = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return runs.filter((run) => new Date(run.date) >= start)
}

export function getThisMonthRuns(runs: RunLog[], today = new Date()): RunLog[] {
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return runs.filter((run) => new Date(run.date) >= start)
}

export function getEasyRatio(runs: RunLog[]): number {
  const segments = runs.flatMap(getPaceSegments)
  const total = round(segments.reduce((sum, segment) => sum + segment.distanceKm, 0))
  if (!total) return 0
  const easy = round(segments.filter((segment) => segment.paceSec >= easyPaceThresholdSec).reduce((sum, segment) => sum + segment.distanceKm, 0))
  return Math.round((easy / total) * 100)
}

export function distanceByType(runs: RunLog[]): Record<RunType, number> {
  return runs.reduce(
    (acc, run) => {
      acc[run.type] = round(acc[run.type] + run.distanceKm)
      return acc
    },
    {
      Easy: 0,
      Recovery: 0,
      'Easy + Strides': 0,
      Tempo: 0,
      LSD: 0,
      'Steady Long': 0,
      Race: 0,
      Unknown: 0
    } satisfies Record<RunType, number>
  )
}

export function averagePace(runs: RunLog[]): number | null {
  const withDuration = runs.filter((run) => run.durationSec && run.distanceKm > 0)
  const distance = sumDistance(withDuration)
  if (!distance) return null
  const duration = withDuration.reduce((sum, run) => sum + (run.durationSec ?? 0), 0)
  return Math.round(duration / distance)
}

export function estimateHeartRateDrift(run: RunLog): string {
  const laps = run.laps.filter((lap) => lap.avgHeartRate && lap.paceSec)
  if (laps.length < 2) return '랩 데이터 부족'
  const first = laps[0]
  const last = laps[laps.length - 1]
  const hrDiff = (last.avgHeartRate ?? 0) - (first.avgHeartRate ?? 0)
  const paceDiff = (last.paceSec ?? 0) - (first.paceSec ?? 0)
  if (hrDiff > 8 && paceDiff > 15) return '후반 심박 드리프트 가능'
  if (hrDiff <= 5) return '안정적'
  return '경미한 상승'
}

export function getVolumeWarning(runs: RunLog[]): string {
  const last7 = sumDistance(getRunsWithinDays(runs, 7))
  const prev7 = sumDistance(getRunsWithinDays(runs, 14).filter((run) => !getRunsWithinDays(runs, 7).some((recent) => recent.id === run.id)))
  if (last7 >= 20 && prev7 > 0 && last7 / prev7 >= 1.35) return '최근 7일 볼륨이 이전 7일 대비 35% 이상 증가했습니다.'
  if (last7 >= 35) return '최근 7일 볼륨이 높습니다. 회복 주간을 고려하세요.'
  return '급격한 볼륨 증가는 보이지 않습니다.'
}

export function getLatestByTypes(runs: RunLog[], types: RunType[]): RunLog | null {
  return [...runs].sort((a, b) => b.date.localeCompare(a.date)).find((run) => types.includes(run.type)) ?? null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function getPaceSegments(run: RunLog): Array<{ distanceKm: number; paceSec: number }> {
  const lapSegments = run.laps
    .map((lap) => toPaceSegment(lap))
    .filter((segment): segment is { distanceKm: number; paceSec: number } => Boolean(segment))

  if (lapSegments.length) return lapSegments
  if (run.distanceKm > 0 && run.avgPaceSec) return [{ distanceKm: run.distanceKm, paceSec: run.avgPaceSec }]
  return []
}

function toPaceSegment(lap: Lap): { distanceKm: number; paceSec: number } | null {
  if (!lap.distanceKm || lap.distanceKm <= 0 || !lap.paceSec) return null
  return {
    distanceKm: lap.distanceKm,
    paceSec: lap.paceSec
  }
}

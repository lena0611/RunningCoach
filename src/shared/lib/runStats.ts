import type { Lap, RunLog, RunType } from '@/entities/run/model'
import type { TrainingMemory } from '@/entities/training-memory/model'

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

export type NextSessionRecommendation = {
  title: string
  reason: string
  intensity: string
}

export function getNextSessionRecommendation(memory: TrainingMemory, runs: RunLog[], today = new Date()): NextSessionRecommendation {
  const sorted = [...runs].sort((a, b) => b.date.localeCompare(a.date))
  const upcoming = getNextPlannedWorkout(memory, today)
  const lastRun = sorted[0] ?? null
  const lastRunDaysAgo = lastRun ? daysSinceRun(lastRun, today) : null

  if (lastRun && lastRunDaysAgo !== null && lastRunDaysAgo <= 1 && isLongRunStress(lastRun)) {
    return {
      title: 'Recovery 또는 완전 휴식',
      reason: [
        `최근 저장 기록은 ${lastRun.date} ${lastRun.sessionTitle || lastRun.type} ${lastRun.distanceKm}km입니다.`,
        '전날 또는 직전 롱런 뒤에는 다음 주 계획보다 회복 반응 확인이 먼저입니다.',
        upcoming.pattern ? `다음 주간 루틴은 ${upcoming.pattern}이지만, 오늘은 회복 우선으로 둡니다.` : ''
      ]
        .filter(Boolean)
        .join(' '),
      intensity: describeRecoveryAfterLongRun(lastRun)
    }
  }

  if (upcoming.dayName === memory.athleteProfile.preferredLongRunDay || upcoming.pattern.includes('LSD') || upcoming.pattern.includes('Long')) {
    const recentLong = getRecentSaturdayLongRun(sorted)
    const longType = chooseNextLongRunType(recentLong)
    return {
      title: `${upcoming.dayName} ${longType}`,
      reason: [
        `주간 루틴의 다음 주요 세션은 ${upcoming.pattern || `${upcoming.dayName} 롱런`}입니다.`,
        lastRun ? `최근 저장 기록은 ${lastRun.date} ${lastRun.sessionTitle || lastRun.type}입니다.` : '최근 저장 기록이 아직 없습니다.',
        recentLong ? `최근 토요일 10km+ 기록은 ${recentLong.date} ${recentLong.distanceKm}km입니다.` : '최근 토요일 10km+ 기준 기록은 아직 부족합니다.'
      ].join(' '),
      intensity: describeLongRunIntensity(longType, recentLong)
    }
  }

  const recent = getRunsWithinDays(runs, 3, today)
  const hasHard = recent.some((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type) || isLongRunStress(run))
  return {
    title: hasHard ? 'Recovery 또는 5km Easy' : upcoming.workout || 'Easy + Strides',
    reason: upcoming.pattern ? `주간 루틴상 다음 세션은 ${upcoming.pattern}입니다.` : '최근 강훈련 여부와 주간 루틴을 함께 본 추천입니다.',
    intensity: hasHard ? '최근 3일 안에 강한 세션이 있어 회복 우선입니다.' : '무리하지 않는 기본 강도로 진행합니다.'
  }
}

function daysSinceRun(run: RunLog, today: Date): number {
  const todayStart = new Date(today)
  todayStart.setHours(0, 0, 0, 0)
  const runDate = new Date(`${run.date}T00:00:00`)
  runDate.setHours(0, 0, 0, 0)
  return Math.round((todayStart.getTime() - runDate.getTime()) / dayMs)
}

function isLongRunStress(run: RunLog): boolean {
  return ['LSD', 'Steady Long'].includes(run.type) || run.distanceKm >= 10
}

function describeRecoveryAfterLongRun(run: RunLog): string {
  const basePace = run.avgPaceSec ? `직전 롱런 평균 페이스 ${formatPaceText(run.avgPaceSec)}/km 기준, ` : ''
  return `${basePace}오늘은 20~40분 아주 편한 조깅이나 휴식이 맞습니다. 뛰더라도 대화 가능한 강도와 다리 피로 확인을 우선하세요.`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function getNextPlannedWorkout(memory: TrainingMemory, today: Date): { dayName: string; workout: string; pattern: string } {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const todayIndex = today.getDay()
  const patterns = memory.weeklyPattern
    .map((pattern) => {
      const [rawDay, ...rest] = pattern.split(':')
      const dayName = rawDay.trim()
      const dayIndex = days.indexOf(dayName)
      return {
        dayName,
        dayIndex,
        workout: rest.join(':').trim(),
        pattern
      }
    })
    .filter((item) => item.dayIndex >= 0)

  const next = patterns
    .map((item) => ({
      ...item,
      offset: (item.dayIndex - todayIndex + 7) % 7 || 7
    }))
    .sort((a, b) => a.offset - b.offset)[0]

  if (next) return next
  return {
    dayName: memory.athleteProfile.preferredLongRunDay || '토요일',
    workout: 'LSD 또는 Steady Long',
    pattern: `${memory.athleteProfile.preferredLongRunDay || '토요일'}: LSD 또는 Steady Long`
  }
}

function getRecentSaturdayLongRun(runs: RunLog[]): RunLog | null {
  return (
    runs.find((run) => {
      const date = new Date(`${run.date}T00:00:00`)
      return date.getDay() === 6 && run.distanceKm >= 10
    }) ?? null
  )
}

function chooseNextLongRunType(recentLong: RunLog | null): 'LSD' | 'Steady Long' {
  if (!recentLong) return 'LSD'
  if (recentLong.type === 'Steady Long') return 'LSD'
  if (recentLong.type === 'LSD') return 'Steady Long'
  if (recentLong.avgPaceSec && recentLong.avgPaceSec <= 390) return 'LSD'
  return 'Steady Long'
}

function describeLongRunIntensity(type: 'LSD' | 'Steady Long', recentLong: RunLog | null): string {
  if (!recentLong?.avgPaceSec) {
    return type === 'LSD'
      ? '최근 토요일 10km+ 페이스 기준이 부족하므로 대화 가능 강도, 심박 안정 우선으로 진행합니다.'
      : '최근 토요일 10km+ 페이스 기준이 부족하므로 후반 자연 가속만 허용합니다.'
  }

  if (type === 'LSD') {
    return `최근 토요일 10km+ 평균 페이스 ${formatPaceText(recentLong.avgPaceSec)} 기준, LSD는 ${formatPaceText(recentLong.avgPaceSec + 20)}~${formatPaceText(recentLong.avgPaceSec + 45)}/km 정도로 낮추고 심박 안정 우선입니다.`
  }

  return `최근 토요일 10km+ 평균 페이스 ${formatPaceText(recentLong.avgPaceSec)} 기준, Steady Long은 ${formatPaceText(Math.max(recentLong.avgPaceSec - 10, 0))}~${formatPaceText(recentLong.avgPaceSec + 15)}/km 범위에서 후반 자연 가속만 허용합니다.`
}

function formatPaceText(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = String(Math.round(seconds % 60)).padStart(2, '0')
  return `${min}:${sec}`
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

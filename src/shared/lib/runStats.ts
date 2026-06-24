import type { Lap, RunLog, RunType } from '@/entities/run/model'
import type { RecentInjuryHistory, TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import { getActiveGoal, getActiveInjuryItem, getRecentInjuryHistory, isFullMarathonGoal } from '@/entities/training-memory/model'
import { formatDateWithWeekday } from '@/shared/lib/format'

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

/** 직전 N일 최장 런 거리(km). 복귀 램프 세션 상한 입력(#473 — 직전30일 최장+10%). 런 없으면 0. */
export function getLongestRunKmWithinDays(runs: RunLog[], days: number, today = new Date()): number {
  return getRunsWithinDays(runs, days, today).reduce((max, run) => Math.max(max, run.distanceKm), 0)
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

export function getVolumeWarning(runs: RunLog[], today = new Date()): string {
  const recent7Runs = getRunsWithinDays(runs, 7, today)
  const last7 = sumDistance(recent7Runs)
  const prev7 = sumDistance(getRunsWithinDays(runs, 14, today).filter((run) => !recent7Runs.some((recent) => recent.id === run.id)))
  if (last7 >= 20 && prev7 > 0 && last7 / prev7 >= 1.35) return '최근 7일 볼륨이 이전 7일 대비 35% 이상 증가했습니다.'
  if (last7 >= 35) return '최근 7일 볼륨이 높습니다. 회복 주간을 고려하세요.'
  return '급격한 볼륨 증가는 보이지 않습니다.'
}

export type ChronicLoadStatus = 'spike' | 'rising' | 'stable' | 'unknown'

export type ChronicLoadTrend = {
  status: ChronicLoadStatus
  increasePct: number | null
  last30Km: number
  prev30Km: number
  spikeThreshold: number
  risingThreshold: number
}

const chronicLoadMinBaselineKm = 15

// birthYear로 나이대 가중치를 만든다. 0(<40) / 1(40대) / 2(50대) / 3(60+). 미입력/비현실 값은 0.
export function getAgeLoadWeight(birthYear: number | null | undefined, today = new Date()): number {
  if (typeof birthYear !== 'number' || !Number.isFinite(birthYear)) return 0
  const age = today.getFullYear() - birthYear
  if (age < 18 || age > 100) return 0
  if (age < 40) return 0
  if (age < 50) return 1
  if (age < 60) return 2
  return 3
}

// 최근 30일 누적과 직전 30일(31~60일) 누적을 비교한 중장기 부하 추세.
// 나이대가 높을수록 경고 임계값을 낮춰 더 보수적으로 본다.
export function getChronicLoadTrend(runs: RunLog[], today = new Date(), ageWeight = 0): ChronicLoadTrend {
  const last30Runs = getRunsWithinDays(runs, 30, today)
  const last30Km = round(sumDistance(last30Runs))
  const prev30Km = round(
    sumDistance(getRunsWithinDays(runs, 60, today).filter((run) => !last30Runs.some((recent) => recent.id === run.id)))
  )
  const spikeThreshold = 50 - ageWeight * 5
  const risingThreshold = 30 - ageWeight * 3

  if (prev30Km < chronicLoadMinBaselineKm) {
    return { status: 'unknown', increasePct: null, last30Km, prev30Km, spikeThreshold, risingThreshold }
  }

  const increasePct = Math.round(((last30Km - prev30Km) / prev30Km) * 100)
  const status: ChronicLoadStatus = increasePct >= spikeThreshold ? 'spike' : increasePct >= risingThreshold ? 'rising' : 'stable'
  return { status, increasePct, last30Km, prev30Km, spikeThreshold, risingThreshold }
}

/**
 * 급성:만성 작업부하 비율(ACWR) = 최근 7일 볼륨 ÷ (최근 28일 볼륨 / 4).
 * >1.5 면 부하 스파이크(건병증·피로골절 위험 가중 — running-injury-knowledge.md §부상위험 ACWR).
 * 만성 기반이 빈약하면(주 평균 < chronicLoadMinBaselineKm/4) 신뢰할 수 없어 null.
 * getChronicLoadTrend(30일 절대 추세)와 병행한다 — ACWR 는 최근 급성 램프(부하 압축, 예: 같은 날 더블)에 더 민감하다.
 */
export function getAcwr(runs: RunLog[], today = new Date()): number | null {
  const acute7 = sumDistance(getRunsWithinDays(runs, 7, today))
  const chronicWeekly = sumDistance(getRunsWithinDays(runs, 28, today)) / 4
  if (chronicWeekly < chronicLoadMinBaselineKm / 4) return null
  return Math.round((acute7 / chronicWeekly) * 100) / 100
}

// 7일 급성 경고와 30일 중장기 경고를 합쳐 요약 피로 카드용 한 줄을 만든다.
export function getFatigueWarning(runs: RunLog[], today = new Date(), ageWeight = 0): { caution: boolean; message: string } {
  const chronic = getChronicLoadTrend(runs, today, ageWeight)
  const acute = getVolumeWarning(runs, today)
  const acuteCaution = !acute.startsWith('급격한 볼륨 증가는 보이지 않습니다')
  if (chronic.status === 'spike') {
    return { caution: true, message: `최근 30일 누적 ${chronic.last30Km}km로 이전 30일(${chronic.prev30Km}km) 대비 ${chronic.increasePct}% 증가했습니다. 회복 주간을 고려하세요.` }
  }
  if (acuteCaution) return { caution: true, message: acute }
  if (chronic.status === 'rising') {
    return { caution: true, message: `최근 30일 누적이 이전 30일 대비 ${chronic.increasePct}% 늘고 있습니다. 증가 속도를 관찰하세요.` }
  }
  return { caution: false, message: '급격한 볼륨 증가는 보이지 않습니다.' }
}

export function getLatestByTypes(runs: RunLog[], types: RunType[]): RunLog | null {
  return [...runs].sort((a, b) => b.date.localeCompare(a.date)).find((run) => types.includes(run.type)) ?? null
}

export type NextSessionRecommendation = {
  title: string
  reason: string
  intensity: string
  plannedDate: string
  dayName: string
  injuryAdjusted: boolean
  injuryNote: string
  loadCaution: boolean
  loadNote: string
}

const qualitySessionKeywords = ['Tempo', 'Interval', 'LSD', 'Steady Long', 'Race', 'Strides', 'Threshold', 'Repetition']

export function getNextSessionRecommendation(memory: TrainingMemory, runs: RunLog[], today = new Date()): NextSessionRecommendation {
  const sorted = [...runs].sort((a, b) => b.date.localeCompare(a.date))
  // 오늘 이미 수행한 런이 있으면(#352) 오늘 슬롯을 건너뛰고 다음 예정일을 추천한다.
  const ranToday = runs.some((run) => run.date === formatDateOnly(today))
  const upcoming = getNextPlannedWorkout(memory, today, { excludeToday: ranToday })
  const lastRun = sorted[0] ?? null
  const lastRunSchedule = lastRun ? getPlannedWorkoutOnDate(memory, lastRun.date) : null

  let base: NextSessionRecommendation
  if (upcoming.dayName === memory.athleteProfile.preferredLongRunDay || upcoming.pattern.includes('LSD') || upcoming.pattern.includes('Long')) {
    const recentLong = getRecentSaturdayLongRun(sorted)
    const longType = chooseNextLongRunType(recentLong)
    base = {
      title: `${upcoming.dayName} ${longType}`,
      plannedDate: upcoming.date,
      dayName: upcoming.dayName,
      reason: [
        `주간 루틴의 다음 주요 세션은 ${upcoming.pattern || `${upcoming.dayName} 롱런`}입니다.`,
        getLastRunContextText(lastRun, lastRunSchedule),
        recentLong ? `최근 토요일 10km+ 기록은 ${formatDateWithWeekday(recentLong.date)} ${recentLong.distanceKm}km입니다.` : '최근 토요일 10km+ 기준 기록은 아직 부족합니다.'
      ].join(' '),
      intensity: describeLongRunIntensity(longType, recentLong),
      injuryAdjusted: false,
      injuryNote: '',
      loadCaution: false,
      loadNote: ''
    }
  } else {
    base = {
      title: upcoming.workout || 'Easy + Strides',
      plannedDate: upcoming.date,
      dayName: upcoming.dayName,
      reason: [
        upcoming.pattern ? `주간 루틴상 다음 세션은 ${upcoming.pattern}입니다.` : '주간 루틴 기준 다음 세션입니다.',
        getLastRunContextText(lastRun, lastRunSchedule)
      ].join(' '),
      intensity: '추천 세션 자체는 주간 훈련 스케줄을 기준으로 안내합니다. 컨디션과 통증 신호가 있으면 강도만 조절하세요.',
      injuryAdjusted: false,
      injuryNote: '',
      loadCaution: false,
      loadNote: ''
    }
  }

  const injury = getActiveInjuryItem(memory)
  const hasActiveInjury = !!injury && (injury.status === 'active' || injury.status === 'monitoring')
  const ageWeight = getAgeLoadWeight(memory.athleteProfile.birthYear, today)
  const chronic = getChronicLoadTrend(runs, today, ageWeight)
  const history = getRecentInjuryHistory(memory, today)
  const isMarathonGoal = isFullMarathonGoal(getActiveGoal(memory))
  return applyPreviousInjuryRisk(
    applyChronicLoad(applyInjuryGate(base, injury), chronic, injury, ageWeight),
    history,
    isMarathonGoal,
    hasActiveInjury
  )
}

export type TrainingDayView = {
  today: {
    /** pending=오늘 예정 미수행 / rest=오늘 예정 없음(휴식) / done=오늘 이미 수행 */
    state: 'pending' | 'rest' | 'done'
    /** 오늘 예정 훈련명(pending). rest/done이면 null 가능. */
    title: string | null
    /** pending일 때 "어떻게 뛰라"는 코칭 한마디(처방 강도 가이드, 결정론). */
    coachLine: string
    /** done일 때 오늘 수행 요약(예: "Easy 6.2km · 32:10"). */
    doneSummary: string | null
  }
  /** 다음 예정 세션(오늘 제외). 패턴이 없으면 null. */
  next: { date: string; dayName: string; title: string } | null
}

function formatDurationMmSs(durationSec: number | null): string {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) return ''
  const total = Math.round(durationSec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function summarizeRunShort(run: RunLog): string {
  const distance = Number.isFinite(run.distanceKm) ? `${Math.round(run.distanceKm * 10) / 10}km` : ''
  const duration = formatDurationMmSs(run.durationSec)
  return [run.type, distance, duration].filter(Boolean).join(' · ')
}

/**
 * 대시보드 "오늘 / 다음 훈련" 카드용 뷰 (#352).
 * 오늘 상태(미수행/휴식/완료)와 다음 예정 세션(날짜·요일·훈련명)을 결정론으로 산출한다. AI 호출 없음.
 */
export function getTrainingDayView(memory: TrainingMemory, runs: RunLog[], today: Date = new Date()): TrainingDayView {
  const todayStr = formatDateOnly(today)
  const planned = getPlannedWorkoutOnDate(memory, todayStr)
  const todayRun = runs
    .filter((run) => run.date === todayStr)
    .sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0] ?? null
  const upcoming = getNextPlannedWorkout(memory, today, { excludeToday: true })

  let todayView: TrainingDayView['today']
  if (todayRun) {
    todayView = { state: 'done', title: planned?.workout || null, coachLine: '', doneSummary: summarizeRunShort(todayRun) }
  } else if (planned) {
    // 오늘 예정·미수행 → 오늘이 추천 대상이므로 recommendation의 강도 가이드를 코칭 한마디로 쓴다.
    const rec = getNextSessionRecommendation(memory, runs, today)
    todayView = { state: 'pending', title: planned.workout || rec.title, coachLine: rec.intensity, doneSummary: null }
  } else {
    todayView = { state: 'rest', title: null, coachLine: '', doneSummary: null }
  }

  return {
    today: todayView,
    next: upcoming ? { date: upcoming.date, dayName: upcoming.dayName, title: upcoming.workout || `${upcoming.dayName} 세션` } : null
  }
}

function applyChronicLoad(
  rec: NextSessionRecommendation,
  chronic: ChronicLoadTrend,
  injury: TrainingInjuryItem | null,
  ageWeight: number
): NextSessionRecommendation {
  if (chronic.status !== 'spike' && chronic.status !== 'rising') return rec
  const agePrefix = ageWeight >= 2 ? '나이대를 고려해 더 보수적으로 봅니다. ' : ''
  const trendText = `최근 30일 누적 ${chronic.last30Km}km로 이전 30일(${chronic.prev30Km}km) 대비 ${chronic.increasePct}% ${chronic.status === 'spike' ? '급증' : '증가'}했습니다.`

  if (chronic.status === 'rising') {
    return {
      ...rec,
      loadCaution: true,
      loadNote: `${agePrefix}${trendText} 부상 예측은 아니지만 증가 속도를 관찰하며 강도 상향은 천천히 가져가세요.`
    }
  }

  // spike: 부하 급증은 보수적 경고로만 쓴다. 강도 강제 하향은 부상 게이트(통증)가 담당하고,
  // 여기서는 통증과 겹칠 때 문구만 강화한다.
  const severity = injury && (injury.status === 'active' || injury.status === 'monitoring') ? injury.severity ?? 0 : 0
  const note = severity >= 2
    ? `${agePrefix}${trendText} 활성 통증 ${severity}/5와 겹쳐 다음 한 주기는 회복과 강도 유지를 우선하세요.`
    : `${agePrefix}${trendText} 부상 예측은 아니지만 회복주를 넣거나 다음 주기 거리 증가를 멈추는 편이 안전합니다.`

  return { ...rec, loadCaution: true, loadNote: note }
}

/**
 * 부위 무관 전역 재부상 위험창(3.1) + 저볼륨≠안전 겸손 가드(3.3) + 마라톤 가중(3.2).
 * 근거: .harness/project/research/rri-risk-factors-evidence.md. 통증이 없고 주행거리가 낮아도 "안전" 단정을 막고
 * 강도 상향을 한 단계씩 보수화한다. 현재 통증 게이트(applyInjuryGate)가 이미 작동 중이면(hasActiveInjury) 중복 메시지를 피해 생략.
 * 통증 기반 강도 하향과 별개의 보조 카우션이므로 기존 loadNote 표시 경로에 합쳐 노출한다.
 */
function applyPreviousInjuryRisk(
  rec: NextSessionRecommendation,
  history: RecentInjuryHistory,
  isMarathonGoal: boolean,
  hasActiveInjury: boolean
): NextSessionRecommendation {
  if (hasActiveInjury || !history.hasRecentInjury) return rec
  const months = Math.max(1, Math.round((history.mostRecentDaysAgo ?? 0) / 30))
  const marathonText = isMarathonGoal
    ? ' 특히 풀마라톤 목표와 겹치면 위험이 더 커지니 주기화를 더 천천히 가져가고 이상 신호를 빨리 점검하세요.'
    : ''
  const note = `최근 ${months}개월 내 부상 이력이 있어, 통증이 없고 주행거리가 낮아도 '안전'으로 단정하지 마세요. 재부상은 같은 부위만이 아니라 다른 부위로도 잘 오니, 강도 상향은 한 단계씩 보수적으로 가져가세요.${marathonText}`
  return { ...rec, loadCaution: true, loadNote: rec.loadNote ? `${rec.loadNote} ${note}` : note }
}

function applyInjuryGate(base: NextSessionRecommendation, injury: TrainingInjuryItem | null): NextSessionRecommendation {
  if (!injury || (injury.status !== 'active' && injury.status !== 'monitoring')) return base
  const severity = injury.severity ?? 0
  const area = injury.area || '관리 부위'
  if (severity <= 1) return base

  if (severity >= 4) {
    return {
      ...base,
      title: 'Recovery 또는 휴식',
      injuryAdjusted: true,
      injuryNote: `${area} 통증 ${severity}/5로 강한 신호입니다. 예정 세션보다 회복주나 휴식을 우선하고, 달리며 악화되면 휴식과 전문가 상담을 먼저 고려하세요.`,
      reason: `${base.reason} 활성 부상 ${severity}/5로 예정 강도를 보류하고 회복을 우선 추천합니다.`,
      intensity: `${area} ${severity}/5는 러닝 강도 하향 또는 중단 검토가 필요한 신호입니다. 통증이 가라앉기 전에는 강훈련/롱런을 미루세요.`
    }
  }

  if (severity >= 3 && isQualitySessionTitle(base.title)) {
    return {
      ...base,
      title: 'Easy 또는 Recovery',
      injuryAdjusted: true,
      injuryNote: `${area} 통증 ${severity}/5로 Tempo·Strides·Steady Long 같은 상위 세션은 보류합니다. 통증이 0~2/5로 가라앉으면 예정 세션으로 복귀하세요.`,
      reason: `${base.reason} 활성 부상 ${severity}/5라 예정 품질 세션 대신 Easy/Recovery로 낮춰 추천합니다.`,
      intensity: '심박 안정 위주의 낮은 강도로 진행하고, 통증이 커지면 중단하세요.'
    }
  }

  if (severity >= 3) {
    return {
      ...base,
      injuryAdjusted: true,
      injuryNote: `${area} 통증 ${severity}/5라 강도 상향은 보류합니다. 예정 세션은 유지하되 통증 신호를 보며 보수적으로 진행하세요.`,
      reason: `${base.reason} 활성 부상 ${severity}/5라 강도 상향은 보류합니다.`
    }
  }

  return {
    ...base,
    injuryAdjusted: true,
    injuryNote: `${area} 통증 ${severity}/5입니다. 강훈련 전 체크포인트로 통증 변화를 먼저 확인하고, 악화되면 강도를 낮추세요.`,
    reason: `${base.reason} 활성 부상 ${severity}/5라 강훈련 전 체크포인트를 권합니다.`
  }
}

function isQualitySessionTitle(title: string): boolean {
  return qualitySessionKeywords.some((keyword) => title.includes(keyword))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function getNextPlannedWorkout(
  memory: TrainingMemory,
  today: Date,
  opts: { excludeToday?: boolean } = {}
): { dayName: string; workout: string; pattern: string; date: string } {
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
    .map((item) => {
      const rawOffset = (item.dayIndex - todayIndex + 7) % 7
      // 오늘 이미 수행했으면 오늘 슬롯(offset 0)을 다음 주기로 밀어 다음 예정일을 고른다.
      const offset = opts.excludeToday && rawOffset === 0 ? 7 : rawOffset
      return { ...item, offset }
    })
    .sort((a, b) => a.offset - b.offset)[0]

  if (next) return { ...next, date: formatDateOnly(addDays(today, next.offset)) }
  return {
    dayName: memory.athleteProfile.preferredLongRunDay || '토요일',
    workout: 'LSD 또는 Steady Long',
    pattern: `${memory.athleteProfile.preferredLongRunDay || '토요일'}: LSD 또는 Steady Long`,
    date: formatDateOnly(today)
  }
}

function getPlannedWorkoutOnDate(memory: TrainingMemory, dateText: string): { dayName: string; workout: string; pattern: string } | null {
  const date = new Date(`${dateText}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return null
  const dayName = getDayName(date)
  const pattern = memory.weeklyPattern.find((item) => item.trim().startsWith(dayName))
  if (!pattern) return null
  const [, ...rest] = pattern.split(':')
  return {
    dayName,
    workout: rest.join(':').trim(),
    pattern
  }
}

function getLastRunContextText(lastRun: RunLog | null, schedule: { pattern: string } | null): string {
  if (!lastRun) return '최근 저장 기록은 아직 없습니다.'
  if (!schedule) {
    return `최근 저장 기록 ${formatDateWithWeekday(lastRun.date)} ${lastRun.sessionTitle || lastRun.type}은 주간 루틴 외 추가런으로 보고 다음 세션 추천에서는 제외합니다.`
  }
  return `최근 저장 기록은 ${formatDateWithWeekday(lastRun.date)} ${lastRun.sessionTitle || lastRun.type}입니다.`
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateOnly(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-')
}

function getDayName(value: Date): string {
  return ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][value.getDay()]
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

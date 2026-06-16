/**
 * 주기화 골격 생성기 (#364, 에픽 #362). 목표(거리·목표시간·D-day)를 받아
 * **오늘부터 D-day 까지 날짜별 ScheduledSession 골격을 결정론으로 생성**한다. AI 호출 없음.
 *
 * 방법론(decision-log 2026-06-16, running-coaching-standards "훈련 스케줄 모델"):
 *   - work-backward: 레이스 날짜 고정 → Taper←Race Specific←Build←Base 로 거꾸로 기간 배분.
 *   - Daniels VDOT 페이스 앵커(vdotPaces.resolvePaceModel) 재사용.
 *   - Seiler 80/20: 주간 quality 세션을 제한해 저강도 비중을 지킨다(고정비율 아닌 가드레일).
 *   - 점진적 부하: 주간 볼륨 증가율 cap + 4주마다 회복주(down week).
 *
 * 살아있는 골격: 이 출력은 A1 재정렬이 누적 이탈 시 목표일 고정 채 다시 생성한다.
 */

import type { RunType } from '@/entities/run/model'
import type { AthleteProfile, TrainingGoal } from '@/entities/training-memory/model'
import type {
  ScheduledSessionDraft,
  ScheduledSessionPrescription,
  TrainingPhaseName
} from '@/entities/training-schedule/model'
import { formatPaceSec, resolvePaceModel, type PaceModel } from '@/shared/lib/vdotPaces'

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** quality(고강도 자극) 세션 타입 — 80/20 가드레일·키세션 판정의 기준. */
const QUALITY_TYPES: ReadonlySet<RunType> = new Set(['Tempo', 'LSD', 'Steady Long', 'Race'])

export type PeriodizationInput = {
  goal: TrainingGoal
  profile: AthleteProfile
  today: Date
}

/** 주차별 Phase 배분 결과(0번째 주가 가장 이른 주). */
export function allocatePhases(totalWeeks: number, goalDistanceKm: number): TrainingPhaseName[] {
  if (totalWeeks <= 0) return []
  // 목표 거리별 테이퍼·레이스기 길이(주). 길수록 길다.
  const taperWeeks = goalDistanceKm > 25 ? 3 : goalDistanceKm > 12 ? 2 : 1
  const raceSpecificWeeks = goalDistanceKm > 25 ? 3 : 2

  // 짧은 창이면 우선순위(taper→raceSpecific→build→base)로 압축.
  if (totalWeeks <= 2) return Array(totalWeeks).fill('Taper')

  const taper = Math.min(taperWeeks, Math.max(1, Math.floor(totalWeeks * 0.2)))
  let remaining = totalWeeks - taper
  const raceSpecific = Math.min(raceSpecificWeeks, Math.max(0, Math.floor(remaining * 0.35)))
  remaining -= raceSpecific
  // 남는 주를 base(약간 더)·build 로 분배.
  const base = Math.ceil(remaining * 0.55)
  const build = remaining - base

  return [
    ...Array(base).fill('Base'),
    ...Array(build).fill('Build'),
    ...Array(raceSpecific).fill('Race Specific'),
    ...Array(taper).fill('Taper')
  ] as TrainingPhaseName[]
}

/** Phase 별 주간 세션 구성(요일 슬롯에 채울 타입 순서). 첫 항목이 키 롱런/키 세션 우선. */
function weeklySessionTypes(phase: TrainingPhaseName, runDays: number): RunType[] {
  const longType: RunType = phase === 'Base' ? 'LSD' : 'Steady Long'
  // 키 세션(롱런 + quality) 우선 배치, 나머지는 Easy 계열로 채운다.
  const quality: RunType[] = (() => {
    switch (phase) {
      case 'Base':
        return [longType] // 베이스는 강자극 최소(롱런만)
      case 'Build':
        return [longType, 'Tempo']
      case 'Threshold':
      case 'Race Specific':
        return [longType, 'Tempo', 'Tempo']
      case 'Taper':
        return ['Tempo'] // 볼륨↓, 짧은 자극 유지
      case 'Recovery':
        return []
      default:
        return [longType]
    }
  })()

  const easyFillers: RunType[] = phase === 'Taper' || phase === 'Recovery'
    ? ['Recovery', 'Easy', 'Easy + Strides', 'Easy', 'Recovery']
    : ['Easy + Strides', 'Easy', 'Easy', 'Easy + Strides', 'Recovery']

  const types = [...quality]
  let i = 0
  while (types.length < runDays && i < easyFillers.length * 2) {
    types.push(easyFillers[i % easyFillers.length])
    i++
  }
  return types.slice(0, Math.max(runDays, quality.length))
}

/** 키세션(롱런/quality)이 연속되지 않도록 hard/easy 교대로 요일 슬롯에 배치. */
function placeOnDays(types: RunType[], runDays: number, longRunDayIndex: number): Map<number, RunType> {
  const placement = new Map<number, RunType>()
  // 주 7일 중 균등 분산할 요일 인덱스 선정(롱런 요일 포함).
  const slots = pickDaySlots(runDays, longRunDayIndex)
  const longType = types.find((t) => t === 'LSD' || t === 'Steady Long') ?? null
  const quality = types.filter((t) => QUALITY_TYPES.has(t))
  const easy = types.filter((t) => !QUALITY_TYPES.has(t))

  // 롱런을 롱런 요일에.
  const ordered: RunType[] = []
  const longRunSlotPos = slots.indexOf(longRunDayIndex)
  // hard/easy 교대 시퀀스 구성: 롱런 외 quality 를 easy 사이에 끼워넣는다.
  const nonLongQuality = quality.filter((t) => t !== longType)
  const sequence: RunType[] = []
  const easyQueue = [...easy]
  const qualityQueue = [...nonLongQuality]
  // easy 먼저 깔고 quality 를 간격 두고 삽입.
  while (easyQueue.length || qualityQueue.length) {
    if (easyQueue.length) sequence.push(easyQueue.shift() as RunType)
    if (qualityQueue.length) {
      sequence.push(qualityQueue.shift() as RunType)
      if (easyQueue.length) sequence.push(easyQueue.shift() as RunType) // quality 뒤 easy 보장
    }
  }

  let seqIdx = 0
  for (let pos = 0; pos < slots.length; pos++) {
    const dayIdx = slots[pos]
    if (longType && pos === longRunSlotPos) {
      placement.set(dayIdx, longType)
      continue
    }
    placement.set(dayIdx, sequence[seqIdx % Math.max(sequence.length, 1)] ?? 'Easy')
    seqIdx++
  }
  void ordered
  return placement
}

/** runDays 개의 요일 인덱스를 주 전체에 균등 분산(롱런 요일 포함). */
function pickDaySlots(runDays: number, longRunDayIndex: number): number[] {
  const days = Math.min(Math.max(runDays, 1), 7)
  const chosen = new Set<number>([longRunDayIndex])
  // 롱런 요일에서 균등 간격으로 나머지 요일 선택.
  const step = 7 / days
  for (let i = 1; chosen.size < days && i < 14; i++) {
    chosen.add((longRunDayIndex + Math.round(i * step)) % 7)
  }
  return [...chosen].sort((a, b) => a - b)
}

/** 주간 목표 볼륨(km). base→peak 점진 증가, 4주마다 회복주, 테이퍼 감량. */
function weeklyVolumeKm(
  weekIndex: number,
  phase: TrainingPhaseName,
  baseVolumeKm: number,
  peakVolumeKm: number,
  totalWeeks: number
): number {
  if (phase === 'Taper') {
    // 테이퍼: 피크에서 점진 감량(주차 진행할수록 더 줄임).
    return Math.round(peakVolumeKm * 0.6)
  }
  if (phase === 'Recovery') return Math.round(baseVolumeKm * 0.6)
  // base→peak 선형 증가에 4주마다 회복주(-20%).
  const progress = totalWeeks > 1 ? weekIndex / (totalWeeks - 1) : 1
  let volume = baseVolumeKm + (peakVolumeKm - baseVolumeKm) * progress
  if ((weekIndex + 1) % 4 === 0) volume *= 0.8 // 회복주
  return Math.round(volume)
}

/** 세션 타입별 주간 볼륨 배분 가중치(롱런이 가장 큼). */
function sessionDistance(type: RunType, weeklyVolume: number, sessionCount: number): number {
  const longShare = 0.35
  if (type === 'LSD' || type === 'Steady Long') return round1(weeklyVolume * longShare)
  // 나머지를 균등 분배.
  const rest = weeklyVolume * (1 - longShare)
  const restCount = Math.max(sessionCount - 1, 1)
  const per = rest / restCount
  if (type === 'Tempo') return round1(per * 1.1)
  if (type === 'Recovery') return round1(per * 0.7)
  return round1(per)
}

export function prescriptionFor(
  type: RunType,
  distanceKm: number,
  pace: PaceModel
): ScheduledSessionPrescription {
  const paceRange = paceRangeFor(type, pace)
  const note = noteFor(type)
  const durationMin = estimateDurationMin(type, distanceKm, pace)
  return { distanceKm: distanceKm > 0 ? distanceKm : null, durationMin, paceRange, note }
}

function paceRangeFor(type: RunType, pace: PaceModel): string {
  if (pace.confidence === 'none') return ''
  switch (type) {
    case 'Tempo':
      return pace.thresholdPaceSec ? `${formatPaceSec(pace.thresholdPaceSec)} 내외(역치)` : ''
    case 'LSD':
    case 'Steady Long':
      return pace.easyPaceRangeSec
        ? `${formatPaceSec(pace.easyPaceRangeSec[0])}~${formatPaceSec(pace.easyPaceRangeSec[1])}`
        : ''
    case 'Race':
      return pace.marathonPaceSec ? `${formatPaceSec(pace.marathonPaceSec)}(레이스)` : ''
    case 'Recovery':
      return pace.easyPaceRangeSec ? `${formatPaceSec(pace.easyPaceRangeSec[0])} 이상(느리게)` : ''
    default: // Easy, Easy + Strides
      return pace.easyPaceRangeSec
        ? `${formatPaceSec(pace.easyPaceRangeSec[0])}~${formatPaceSec(pace.easyPaceRangeSec[1])}`
        : ''
  }
}

function noteFor(type: RunType): string {
  switch (type) {
    case 'Easy + Strides':
      return '편한 대화 페이스 후 마지막에 100m 스트라이드 4~6회(완전 회복)'
    case 'Tempo':
      return '편하게 힘든 강도 지속, 심박 상한 준수. 무너지면 중단'
    case 'LSD':
      return '대화 가능 강도, 심박 안정 우선. 후반 급락 금지'
    case 'Steady Long':
      return '후반 자연 가속만 허용, 심박 드리프트 관찰'
    case 'Recovery':
      return '아주 느리게, 회복이 목적'
    case 'Race':
      return '목표 레이스 페이스 점검'
    default:
      return '편한 대화 가능 페이스'
  }
}

function estimateDurationMin(type: RunType, distanceKm: number, pace: PaceModel): number | null {
  if (distanceKm <= 0) return null
  const paceSec =
    type === 'Tempo'
      ? pace.thresholdPaceSec
      : type === 'Recovery'
        ? pace.easyPaceRangeSec?.[0] ?? null
        : pace.easyPaceSec
  if (!paceSec) return null
  return Math.round((distanceKm * paceSec) / 60)
}

/**
 * 목표 → 오늘부터 D-day 까지 날짜별 ScheduledSessionDraft 골격.
 * targetDate/distanceKm 가 없으면 [] (주기화 불가).
 */
export function buildPeriodizedSchedule(input: PeriodizationInput): ScheduledSessionDraft[] {
  const { goal, profile, today } = input
  if (!goal.targetDate || !goal.distanceKm || goal.distanceKm <= 0) return []

  const start = startOfDay(today)
  const target = startOfDay(new Date(`${goal.targetDate}T00:00:00`))
  if (target <= start) return []

  const totalDays = Math.round((target.getTime() - start.getTime()) / MS_PER_DAY)
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7))
  const phases = allocatePhases(totalWeeks, goal.distanceKm)
  if (!phases.length) return []

  const runDays = clamp(profile.weeklyRunDaysTarget ?? 4, 3, 6)
  const longRunDayIndex = Math.max(0, DAY_NAMES.indexOf(profile.preferredLongRunDay || '토요일'))
  const pace = resolvePaceModel(profile)

  const baseVolumeKm = Math.max(goal.distanceKm * 2.5, 18)
  const peakVolumeKm = Math.max(goal.distanceKm * 4, 30)

  const drafts: ScheduledSessionDraft[] = []
  for (let week = 0; week < phases.length; week++) {
    const phase = phases[week]
    const types = weeklySessionTypes(phase, runDays)
    const placement = placeOnDays(types, runDays, longRunDayIndex)
    const weeklyVol = weeklyVolumeKm(week, phase, baseVolumeKm, peakVolumeKm, totalWeeks)
    const placedTypes = [...placement.values()]

    for (const [dayIdx, type] of placement) {
      const date = dateForWeekDay(start, week, dayIdx, longRunDayIndex)
      if (date < start || date > target) continue
      const distance = sessionDistance(type, weeklyVol, placedTypes.length)
      drafts.push({
        goalId: goal.id ?? null,
        date: formatDateOnly(date),
        phase,
        sessionType: type,
        keySession: QUALITY_TYPES.has(type),
        prescription: prescriptionFor(type, distance, pace),
        source: 'generator'
      })
    }
  }

  // 날짜 오름차순 + 중복 날짜 제거(키세션 우선 보존).
  return dedupeByDate(drafts)
}

function dedupeByDate(drafts: ScheduledSessionDraft[]): ScheduledSessionDraft[] {
  const byDate = new Map<string, ScheduledSessionDraft>()
  for (const d of drafts) {
    const existing = byDate.get(d.date)
    if (!existing || (d.keySession && !existing.keySession)) byDate.set(d.date, d)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** 주차(week) + 요일 인덱스 → 실제 날짜. 0주차는 start 가 속한 주. */
function dateForWeekDay(start: Date, week: number, dayIndex: number, longRunDayIndex: number): Date {
  void longRunDayIndex
  // start 가 속한 주의 일요일(요일 인덱스 0)을 기준점으로.
  const startDow = start.getDay()
  const weekStart = new Date(start.getTime() - startDow * MS_PER_DAY)
  return new Date(weekStart.getTime() + (week * 7 + dayIndex) * MS_PER_DAY)
}

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

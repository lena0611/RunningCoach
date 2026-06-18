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
  ScheduledSession,
  ScheduledSessionDraft,
  ScheduledSessionPrescription,
  TrainingPhaseName
} from '@/entities/training-schedule/model'
import { formatPaceSec, resolvePaceModel, type PaceModel } from '@/shared/lib/vdotPaces'

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** quality(고강도 자극) 세션 타입 — 80/20 가드레일·키세션 판정의 기준. */
const QUALITY_TYPES: ReadonlySet<RunType> = new Set(['Tempo', 'LSD', 'Steady Long', 'Race'])

/** 한계 시험(타임트라이얼, 'Race')을 끼우는 단계 — 블록 끝에서 재측정(#411). Taper/Recovery/RaceSpecific 제외. */
const TIME_TRIAL_PHASES: ReadonlySet<TrainingPhaseName> = new Set(['Base', 'Build', 'Threshold'])

/**
 * 단계 블록 마지막 주에 한계 시험(TT='Race')을 키세션으로 끼운다 — VDOT 재측정·단계 게이트용(#411).
 * 롱런은 보존하고 Tempo 한 개를 TT로 대체(없으면 Easy 계열 하나를 대체). 이미 있으면 그대로.
 */
function injectTimeTrial(types: RunType[]): RunType[] {
  if (types.includes('Race')) return types
  const out = [...types]
  const tempoIdx = out.indexOf('Tempo')
  if (tempoIdx >= 0) {
    out[tempoIdx] = 'Race'
    return out
  }
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] !== 'LSD' && out[i] !== 'Steady Long') {
      out[i] = 'Race'
      return out
    }
  }
  return out
}

export type PeriodizationInput = {
  goal: TrainingGoal
  profile: AthleteProfile
  today: Date
  /**
   * 현재 주간 주행량(최근 30일 평균, km) — 시작 볼륨 앵커(#395).
   * 목표거리 역산 대신 "지금 내가 뛰는 만큼"에서 시작한다. null/0이면 보수적 기본값(콜드스타트).
   */
  currentWeeklyKm?: number | null
  /**
   * 관측 Easy 페이스(#405, A안) — 실제 Easy 심박 이하에서 뛴 페이스. 있으면 VDOT 추정 대신 이걸로
   * Easy 계열(Easy/Recovery/LSD) 페이스를 처방해 심박과 충돌하지 않게 한다. null이면 VDOT 추정.
   */
  observedEasyPace?: { easyPaceSec: number; easyPaceRangeSec: [number, number] } | null
}

/** 안전하다고 보는 주간 볼륨 증가율(소프트). running-coaching-standards "시작점 앵커링"(~10%, 30%+ 급증 회피). */
export const SAFE_WEEKLY_GROWTH = 0.1

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
  const raceSpecific = Math.min(raceSpecificWeeks, Math.max(0, Math.floor(remaining * 0.3)))
  remaining -= raceSpecific
  // Threshold(역치 집중) 블록 — Daniels 진행 Base→Build→Threshold→Race Specific.
  const threshold = remaining >= 3 ? Math.max(1, Math.floor(remaining * 0.25)) : 0
  remaining -= threshold
  // 남는 주를 base(약간 더)·build 로 분배.
  const base = Math.ceil(remaining * 0.55)
  const build = remaining - base

  return [
    ...Array(base).fill('Base'),
    ...Array(build).fill('Build'),
    ...Array(threshold).fill('Threshold'),
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

  // 주간 polarization(80/20) 보호: quality 세션을 runDays-1 이하로 캡(최소 1 easy 보장).
  // 단 롱런은 반드시 보존하므로 캡이 1 미만이 되지 않게 한다.
  const maxQuality = Math.max(1, runDays - 1)
  const cappedQuality = quality.slice(0, maxQuality)

  const types = [...cappedQuality]
  let i = 0
  while (types.length < runDays && i < easyFillers.length * 2) {
    types.push(easyFillers[i % easyFillers.length])
    i++
  }
  return types.slice(0, Math.max(runDays, cappedQuality.length))
}

/** 요일 인덱스 간 순환(주) 거리. 일~토를 원형으로 보고 최소 거리. */
function circularDayDistance(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

/**
 * 회복 인식형 배치: 키/하드 세션(롱런·Tempo 등)이 서로 붙지 않게 **최대 간격**으로 배치하고
 * 나머지 훈련일을 easy 로 채운다. 안 뛰는 날은 휴식 → 하드 다음날은 자연히 easy/휴식이 된다.
 * (회복 기준: 하드 사이 최소 1일 회복 — running-coaching-standards "회복은 훈련의 일부".)
 */
function placeOnDays(types: RunType[], runDays: number, longRunDayIndex: number): Map<number, RunType> {
  const placement = new Map<number, RunType>()
  const longType = types.find((t) => t === 'LSD' || t === 'Steady Long') ?? null
  const nonLongQuality = types.filter((t) => QUALITY_TYPES.has(t) && t !== longType)
  const easyTypes = types.filter((t) => !QUALITY_TYPES.has(t))
  const targetDays = Math.min(Math.max(runDays, 1), 7)

  const used = new Set<number>()
  const hardDays: number[] = []

  // 가장 떨어진(미사용) 요일을 고른다. ref 가 비면 선호 요일을 기준으로.
  const pickFarthest = (ref: number[]): number => {
    let best = -1
    let bestScore = -1
    for (let d = 0; d < 7; d++) {
      if (used.has(d)) continue
      const score = ref.length ? Math.min(...ref.map((h) => circularDayDistance(d, h))) : circularDayDistance(d, longRunDayIndex)
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    return best
  }

  // 1) 롱런은 선호 요일에 고정(키세션).
  if (longType) {
    placement.set(longRunDayIndex, longType)
    used.add(longRunDayIndex)
    hardDays.push(longRunDayIndex)
  }
  // 2) 나머지 quality 를 7요일 전체에서 하드끼리 최대 분리되게 배치(슬롯 군집 회피 → 하드 사이 회복 보장).
  for (const q of nonLongQuality) {
    if (used.size >= 7) break
    const d = pickFarthest(hardDays)
    if (d < 0) break
    placement.set(d, q)
    used.add(d)
    hardDays.push(d)
  }
  // 3) 남은 훈련일은 easy 로 — 이미 배치된 날들과 떨어지게 분산. 안 뽑힌 요일은 휴식.
  let ei = 0
  while (placement.size < targetDays && used.size < 7) {
    const d = pickFarthest([...used])
    if (d < 0) break
    placement.set(d, easyTypes.length ? easyTypes[ei++ % easyTypes.length] : 'Easy')
    used.add(d)
  }
  return placement
}

/**
 * 주간 목표 볼륨(km). base→peak 점진 증가, 4주마다 회복주(바닥은 base 이상), 테이퍼는 주차별 점진 감량.
 * taperPos: 테이퍼 내 위치(0=첫 테이퍼주), taperLen: 테이퍼 총 주수. 테이퍼가 아니면 둘 다 0.
 */
function weeklyVolumeKm(
  weekIndex: number,
  phase: TrainingPhaseName,
  baseVolumeKm: number,
  peakVolumeKm: number,
  totalWeeks: number,
  taperPos: number,
  taperLen: number
): number {
  if (phase === 'Taper') {
    // 테이퍼: 0.75 → 0.45 로 주차 진행할수록 더 감량(피크 대비).
    const frac = taperLen > 1 ? taperPos / (taperLen - 1) : 0
    const factor = 0.75 - 0.3 * frac
    return Math.round(peakVolumeKm * factor)
  }
  if (phase === 'Recovery') return Math.round(baseVolumeKm * 0.6)
  // base→peak 선형 증가에 4주마다 회복주(-20%, 단 base 미만으로는 안 내림).
  const progress = totalWeeks > 1 ? weekIndex / (totalWeeks - 1) : 1
  let volume = baseVolumeKm + (peakVolumeKm - baseVolumeKm) * progress
  if ((weekIndex + 1) % 4 === 0) volume = Math.max(baseVolumeKm, volume * 0.8) // 회복주(바닥 base)
  return Math.round(volume)
}

/** 세션 타입별 주간 볼륨 배분 가중치(롱런이 가장 큼). */
function sessionDistance(type: RunType, weeklyVolume: number, sessionCount: number): number {
  const longShare = 0.35
  if (type === 'LSD' || type === 'Steady Long') return round1(weeklyVolume * longShare)
  // 나머지를 균등 분배.
  // 한계 시험(TT)은 짧은 전력 측정 — 주간 볼륨 배분이 아니라 고정 단거리(2~5km).
  if (type === 'Race') return round1(Math.min(5, Math.max(2, weeklyVolume * 0.3)))
  const rest = weeklyVolume * (1 - longShare)
  const restCount = Math.max(sessionCount - 1, 1)
  const per = rest / restCount
  if (type === 'Tempo') return round1(per * 1.1)
  if (type === 'Recovery') return round1(per * 0.7)
  return round1(per)
}

/**
 * 관측 Easy 페이스(#405)를 PaceModel에 덮는다. 관측은 실측이므로 base confidence가 'none'이면
 * 'measured'로 올려 paceRangeFor early-return을 피한다(없으면 페이스가 빈 문자열로 떨어짐).
 */
export function withObservedEasy(
  base: PaceModel,
  observed: { easyPaceSec: number; easyPaceRangeSec: [number, number] } | null | undefined
): PaceModel {
  if (!observed) return base
  return {
    ...base,
    confidence: base.confidence === 'none' ? 'measured' : base.confidence,
    easyPaceSec: observed.easyPaceSec,
    easyPaceRangeSec: observed.easyPaceRangeSec
  }
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
      return '' // 한계 시험(TT)은 전력 측정 — 페이스 목표 없음(결과로 체력 갱신)
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
      return '한계 시험(타임트라이얼) — 전력으로 측정해 현재 체력을 갱신해요'
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
  const { goal, profile, today, currentWeeklyKm } = input
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
  // Easy 페이스는 관측값(있으면)으로 보정 — VDOT 추정이 심박과 싸우는 문제 해결(#405).
  const pace = withObservedEasy(resolvePaceModel(profile), input.observedEasyPace)

  // 시작 볼륨 앵커링(#395): 목표거리 역산(×2.5)이 아니라 현재 주간 주행량에서 시작한다.
  // 데이터 없으면(콜드스타트) 보수적 기본값. 이미 목표 피크 이상으로 뛰면 피크를 현재 이상으로
  // 올려 유지하고 base ≤ peak 불변식을 지킨다. (running-coaching-standards "시작점 앵커링")
  const goalPeakKm = Math.max(goal.distanceKm * 4, 30)
  const coldStartBaseKm = Math.min(goal.distanceKm * 2.5, 20)
  const anchorKm = currentWeeklyKm && currentWeeklyKm > 0 ? currentWeeklyKm : coldStartBaseKm
  const peakVolumeKm = Math.max(goalPeakKm, anchorKm)
  const baseVolumeKm = Math.min(anchorKm, peakVolumeKm)

  const firstTaperWeek = phases.indexOf('Taper')
  const taperLen = phases.filter((p) => p === 'Taper').length

  const drafts: ScheduledSessionDraft[] = []
  for (let week = 0; week < phases.length; week++) {
    const phase = phases[week]
    // 단계 블록 마지막 주면 한계 시험(TT) 삽입 — 다음 단계 진입 전 재측정(#411).
    const isPhaseEnd = week === phases.length - 1 || phases[week + 1] !== phase
    const baseTypes = weeklySessionTypes(phase, runDays)
    const types = isPhaseEnd && TIME_TRIAL_PHASES.has(phase) ? injectTimeTrial(baseTypes) : baseTypes
    const placement = placeOnDays(types, runDays, longRunDayIndex)
    const taperPos = phase === 'Taper' && firstTaperWeek >= 0 ? week - firstTaperWeek : 0
    const weeklyVol = weeklyVolumeKm(week, phase, baseVolumeKm, peakVolumeKm, totalWeeks, taperPos, taperLen)
    const placedTypes = [...placement.values()]

    for (const [dayIdx, type] of placement) {
      const date = dateForWeekDay(start, week, dayIdx)
      if (date > target) continue
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

// ── 목표 타입별 코칭 (#398) ────────────────────────────────────────────────
export type GoalArchetype = 'performance' | 'fat-loss' | 'wellbeing'

/** TrainingGoal.category → 코칭 아키타입. race=성과, fitness=체중·체형, 그 외=건강·습관. */
export function goalArchetype(category: TrainingGoal['category']): GoalArchetype {
  if (category === 'race') return 'performance'
  if (category === 'fitness') return 'fat-loss'
  return 'wellbeing'
}

/** 비성과 아키타입 주간 가이드(running-coaching-standards "목표 타입별 코칭"). */
const RHYTHM_SPEC: Record<'fat-loss' | 'wellbeing', { runDays: number; weeklyKmDefault: number }> = {
  // 지방연소: 존2 고볼륨(주 3~4회·1회 약간 길게). 체중감량 1차 동인은 에너지균형, 운동은 지속성.
  'fat-loss': { runDays: 4, weeklyKmDefault: 24 },
  // 건강·습관: WHO/ACSM 150~300분/주, 저부담·규칙성.
  wellbeing: { runDays: 3, weeklyKmDefault: 18 }
}

export type SteadyRhythmInput = {
  archetype: 'fat-loss' | 'wellbeing'
  profile: AthleteProfile
  today: Date
  /** 롤링 생성 주 수(기본 6). */
  weeks?: number
  /** 현재 주간 주행량 앵커(#395 재사용). 없으면 아키타입 기본값. */
  currentWeeklyKm?: number | null
  /** 관측 Easy 페이스(#405). */
  observedEasyPace?: { easyPaceSec: number; easyPaceRangeSec: [number, number] } | null
  goalId?: string | null
}

/**
 * 비성과(체중·체형/건강·습관) 목표용 **상시 주간 리듬** 생성(#398). 주기화(단계·피크·테이퍼) 없이
 * 존2 중심 Easy 리듬을 롤링으로 반복한다. 키세션·TT 없음. 같은 캐러셀이 소비.
 */
export function buildSteadyWeeklyRhythm(input: SteadyRhythmInput): ScheduledSessionDraft[] {
  const { archetype, profile, today, goalId = null } = input
  const weeks = input.weeks ?? 6
  const spec = RHYTHM_SPEC[archetype]
  const runDays = clamp(profile.weeklyRunDaysTarget ?? spec.runDays, 3, 5)
  const longRunDayIndex = Math.max(0, DAY_NAMES.indexOf(profile.preferredLongRunDay || '토요일'))
  const pace = withObservedEasy(resolvePaceModel(profile), input.observedEasyPace)
  const weeklyKm = input.currentWeeklyKm && input.currentWeeklyKm > 0 ? input.currentWeeklyKm : spec.weeklyKmDefault

  // 주간 타입: 대부분 Easy. 지방연소는 1회 긴 존2(LSD, easy 페이스)+회복 섞음. 건강·습관은 Easy/Recovery 저부담.
  const types: RunType[] = []
  for (let i = 0; i < runDays; i++) {
    if (archetype === 'fat-loss') types.push(i === 0 ? 'LSD' : i % 3 === 2 ? 'Recovery' : 'Easy')
    else types.push(i % 2 === 1 ? 'Recovery' : 'Easy')
  }

  const start = startOfDay(today)
  const drafts: ScheduledSessionDraft[] = []
  for (let week = 0; week < weeks; week++) {
    const placement = placeOnDays(types, runDays, longRunDayIndex)
    const placed = [...placement.values()]
    for (const [dayIdx, type] of placement) {
      const date = dateForWeekDay(start, week, dayIdx)
      const distance = sessionDistance(type, weeklyKm, placed.length)
      drafts.push({
        goalId,
        date: formatDateOnly(date),
        phase: 'Base', // 비주기화 — 유산소 유지(중립)
        sessionType: type,
        keySession: false, // 비성과: 키세션/TT 없음
        prescription: prescriptionFor(type, distance, pace),
        source: 'generator'
      })
    }
  }
  return dedupeByDate(drafts)
}

export type GoalFeasibility = {
  /** 안전한 진행으로 목표일까지 닿을 수 있는가. */
  feasible: boolean
  /** 목표 피크까지 필요한 평균 주간 증가율(복리, 0~). */
  requiredWeeklyGrowth: number
  /** 무리할 때 솔직한 경고 + 대안 메시지. 무리 아니면 null. */
  message: string | null
}

/**
 * 현재 주간 주행량에서 목표일까지 **안전한 진행으로 닿을 수 있는지** 평가한다(#395).
 * 필요한 평균 주간 증가율(복리)이 안전 상한을 크게 넘으면 솔직히 경고하고 대안을 제시한다.
 * (근거: running-coaching-standards "시작점 앵커링" — ~30%+ 급증은 부상 연관(Nielsen),
 *  점진적 부하로 만성 부하를 키워야 보호적(Gabbett).)
 */
export function assessGoalFeasibility(input: PeriodizationInput): GoalFeasibility {
  const { goal, today, currentWeeklyKm } = input
  if (!goal.targetDate || !goal.distanceKm || goal.distanceKm <= 0) {
    return { feasible: true, requiredWeeklyGrowth: 0, message: null }
  }
  const start = startOfDay(today)
  const target = startOfDay(new Date(`${goal.targetDate}T00:00:00`))
  const weeks = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / MS_PER_DAY / 7))
  const goalPeakKm = Math.max(goal.distanceKm * 4, 30)
  const current = currentWeeklyKm && currentWeeklyKm > 0 ? currentWeeklyKm : Math.min(goal.distanceKm * 2.5, 20)
  if (current >= goalPeakKm) return { feasible: true, requiredWeeklyGrowth: 0, message: null }
  // current * (1+g)^weeks = peak  →  g = (peak/current)^(1/weeks) - 1
  const growth = Math.pow(goalPeakKm / current, 1 / weeks) - 1
  // 평균 필요 증가율이 안전 상한의 1.5배(≈15%/주)를 넘으면 무리로 본다.
  if (growth <= SAFE_WEEKLY_GROWTH * 1.5) return { feasible: true, requiredWeeklyGrowth: growth, message: null }
  const pct = Math.round(growth * 100)
  return {
    feasible: false,
    requiredWeeklyGrowth: growth,
    message: `지금 주행량(약 ${Math.round(current)}km/주)에서 목표일까지 안전하게 끌어올리려면 매주 약 ${pct}%씩 늘려야 해요 — 부상 위험이 큽니다. 목표일을 조금 미루거나 목표 거리를 낮추는 걸 권해요.`
  }
}

function dedupeByDate(drafts: ScheduledSessionDraft[]): ScheduledSessionDraft[] {
  const byDate = new Map<string, ScheduledSessionDraft>()
  for (const d of drafts) {
    const existing = byDate.get(d.date)
    if (!existing || (d.keySession && !existing.keySession)) byDate.set(d.date, d)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 주차(week) + 요일 인덱스 → 실제 날짜. 주는 **오늘(start) 기준 7일 롤링 윈도우**다.
 * week 0 = [start..start+6] 이므로 시작일 이전 요일을 버려 첫 주가 비는 문제가 없다(B1 수정).
 * 요일 인덱스는 윈도우 안에서 다음 해당 요일로 매핑한다.
 */
function dateForWeekDay(start: Date, week: number, dayIndex: number): Date {
  const startDow = start.getDay()
  const offsetInWeek = (dayIndex - startDow + 7) % 7
  return new Date(start.getTime() + (week * 7 + offsetInWeek) * MS_PER_DAY)
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

const PHASE_LABEL_KO: Record<TrainingPhaseName, string> = {
  Base: '기초기',
  Build: '발전기',
  Threshold: '역치기',
  'Race Specific': '레이스 준비기',
  Taper: '테이퍼',
  Recovery: '회복기'
}
const PHASE_FOCUS_KO: Record<TrainingPhaseName, string> = {
  Base: '유산소 기반 다지기',
  Build: '역치·지속력 발전',
  Threshold: '역치 자극 집중',
  'Race Specific': '레이스 페이스 적응',
  Taper: '볼륨 감량·신선도 회복',
  Recovery: '회복 우선'
}

/** 이번 주 위크 요약 — 단계·포커스·핵심세션 수·주간 볼륨·D-day(매크로 위치). */
export type WeekSummary = {
  phase: TrainingPhaseName
  phaseLabel: string
  focusLine: string
  keyCount: number
  weekKm: number
  /** "D-45" 형식. 목표일 없으면 ''. */
  dDayText: string
}

/**
 * 오늘이 속한 캘린더 주(일~토)의 스케줄을 요약한다. 트레이니에게 "이번 주가 통째로 뭘 위한 주인지"를 준다.
 */
export function buildWeekSummary(
  sessions: ScheduledSession[],
  today: Date,
  targetDate: string | null
): WeekSummary | null {
  const start = startOfDay(today)
  const weekStart = new Date(start.getTime() - start.getDay() * MS_PER_DAY)
  const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY)
  const startStr = formatDateOnly(weekStart)
  const endStr = formatDateOnly(weekEnd)

  const week = sessions.filter(
    (s) => s.date >= startStr && s.date <= endStr && s.status !== 'superseded'
  )
  if (!week.length) return null

  // 단계: 오늘 세션 우선, 없으면 이번 주 최빈 단계.
  const todayStr = formatDateOnly(start)
  const todaySession = week.find((s) => s.date === todayStr)
  const phase = todaySession?.phase ?? mostCommonPhase(week)
  const keyCount = week.filter((s) => s.keySession).length
  const weekKm = round1(week.reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0))

  let dDayText = ''
  if (targetDate) {
    const target = startOfDay(new Date(`${targetDate}T00:00:00`))
    const days = Math.round((target.getTime() - start.getTime()) / MS_PER_DAY)
    if (days >= 0) dDayText = `D-${days}`
  }

  return {
    phase,
    phaseLabel: PHASE_LABEL_KO[phase],
    focusLine: PHASE_FOCUS_KO[phase],
    keyCount,
    weekKm,
    dDayText
  }
}

function mostCommonPhase(sessions: ScheduledSession[]): TrainingPhaseName {
  const counts = new Map<TrainingPhaseName, number>()
  for (const s of sessions) counts.set(s.phase, (counts.get(s.phase) ?? 0) + 1)
  let best: TrainingPhaseName = sessions[0].phase
  let bestN = -1
  for (const [p, n] of counts) {
    if (n > bestN) {
      bestN = n
      best = p
    }
  }
  return best
}

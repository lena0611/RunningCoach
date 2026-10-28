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
import { formatPaceRangeSec, formatPaceSec, resolvePaceModel, type PaceModel } from '@/shared/lib/vdotPaces'
import { formatDuration } from '@/shared/lib/format'
import { deriveWeeklyVolumeAnchorKm } from './returnAnchor'

// 코칭 스케줄 타입 재노출 — 코칭 순수로직(reschedule/weeklyTriage 등)이 entities 를 직접 import 하지 않고
// 이 코칭 허브를 거쳐 쓰게 한다(#397 shared→entities 역방향 최소화, 아키텍처 래칫 정합).
export type { ScheduledSession, ScheduledSessionDraft }

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** quality(고강도 자극) 세션 타입 — 80/20 가드레일·키세션 판정의 단일 기준(SSOT). */
export const QUALITY_TYPES: ReadonlySet<RunType> = new Set(['Tempo', 'LSD', 'Steady Long', 'Race'])

/** 하드/quality(=키) 세션인가. 주간 하드부하 가드·트리아지가 이 단일 정의를 재사용한다. */
export function isHardType(type: RunType): boolean {
  return QUALITY_TYPES.has(type)
}

/** 한계 시험(타임트라이얼, 'Race')을 끼우는 단계 — 블록 끝에서 재측정(#411). Taper/Recovery/RaceSpecific 제외. */
const TIME_TRIAL_PHASES: ReadonlySet<TrainingPhaseName> = new Set(['Base', 'Build', 'Threshold'])

/**
 * 한계 시험 사이 최소 간격(주) — #411 의도("코치는 4~8주마다 TT로 재측정")와 Daniels 계열 VDOT 재측정 주기(4~6주).
 * 짧은 플랜은 단계가 1주씩이라 단계 끝마다 넣으면 TT 가 3주 연속 들어갔다(#861). 첫 TT 도 4주차부터다
 * (훈련 없이 첫 주에 잰 값은 플랜 시작 시점 체력 — 이미 앵커가 반영한다).
 */
const TIME_TRIAL_MIN_GAP_WEEKS = 4

/**
 * 세션 하나의 최소 거리(km). 주간 볼륨이 낮으면 횟수를 줄여 한 번을 길게 한다(#861) — 주 7km 를 4회로 쪼개
 * 회복런 1.0km · 스트라이드 1.5km 가 나왔다. 3km ≈ 초보 이지 20분(설계값; 참고 Higdon 10K Novice 첫 런 2.5mi).
 * 주 3회 아래로는 줄이지 않는다(초보 플랜 표준 주 3회).
 */
const MIN_SESSION_KM = 3
const MIN_RUN_DAYS = 3

/** 그 주의 훈련 횟수 — 목표 횟수(프로필) 안에서, 세션이 MIN_SESSION_KM 아래로 쪼개지지 않게. */
function runDaysForVolume(targetRunDays: number, weeklyVolumeKm: number): number {
  const byVolume = Math.floor(weeklyVolumeKm / MIN_SESSION_KM)
  return clamp(Math.min(targetRunDays, byVolume), Math.min(MIN_RUN_DAYS, targetRunDays), targetRunDays)
}

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
  /**
   * 복귀 램프(#473 Phase 2). 있으면 가장 이른 windowSessions 개 세션을 Easy 로 낮추고 거리를 capKm 로 캡한다
   * (SSOT §휴식과 복귀 — 복귀 초반 세션들 Easy + ≤직전30일최장+10%, 매 세션 규칙). 그 뒤 세션은
   * currentWeeklyKm 재앵커가 점진 복원을 맡는다. capKm·windowSessions 는 caller 가 휴식 길이로 계산해 넘긴다.
   */
  returnRamp?: { capKm: number; windowSessions: number } | null
  /**
   * 입문(5K 미완주 — `beginnerWalkRunStage` 가 null 이 아님, #876). SSOT §숙련도별 처방 입문 행: 주 3회, 품질 세션 0,
   * 롱런·스트라이드·템포·한계 시험 없음 — 전부 걷기·뛰기(Easy, 실행은 C25K 사다리가 정한다).
   * 레이스 목표라도 연속주 능력이 먼저다. 볼륨 곡선(단계)은 그대로 두고 세션 구성만 바꾼다.
   */
  entryLevel?: boolean
}

const ENTRY_RUN_DAYS = 3
const ENTRY_SESSION_TYPES: ReadonlySet<RunType> = new Set(['Easy', 'Recovery'])

/**
 * 지금 플랜이 입문 여부와 맞는가(#876) — 안 맞으면 다시 짓는다. 저장 필드 없이 플랜 자체로 판정한다.
 * - 입문인데 품질·스트라이드가 하나라도 있으면 어긋남(입문 전에 지었거나 옛 생성기).
 * - 입문이 아닌데 앞으로 일정(3개 이상)이 전부 Easy·Recovery 면 입문 때 지은 플랜이다(졸업 — 5K 완주·27회).
 *   일반 플랜은 매주 롱런·스트라이드가 있어 이렇게 될 수 없다. 3개 미만이면 끝물이라 다시 짓지 않는다.
 */
export function planMatchesEntryLevel(upcoming: Array<{ sessionType: RunType }>, entryLevel: boolean): boolean {
  const allEasy = upcoming.every((session) => ENTRY_SESSION_TYPES.has(session.sessionType))
  return entryLevel ? allEasy : !(allEasy && upcoming.length >= 3)
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
  // 4) 롱런 직후 슬롯은 "가장 약한" 세션으로 — 회복런(Recovery)이 정석, Easy+Strides 금지.
  //    지친 다리에 스트라이드(신경근 자극)를 붙이지 않고, 다음날을 흡수·회복에 쓴다.
  //    근거: SSOT §루틴 변경(Long Run 품질 게이트 "다음날 회복주 또는 휴식")·하드/이지 교대.
  //    휴식이면(슬롯 비어 있으면) 그대로 둔다 — 휴식도 회복이다.
  if (longType) {
    const postLongDay = (longRunDayIndex + 1) % 7
    const placed = placement.get(postLongDay)
    if (placed && !QUALITY_TYPES.has(placed)) {
      placement.set(postLongDay, 'Recovery')
    }
  }
  return placement
}

/**
 * 늘리는 주 하나에서 허용하는 최대 증가율. 판정(assessGoalFeasibility)과 같은 값을 쓴다 — 생성기가 이보다 빨리
 * 늘리면 "경고 없음"인데 플랜은 급증하고, 더 느리게 막으면 "닿을 수 있다"는데 플랜이 못 닿는다(#848).
 * 근거: Buist RCT(주 23.7% 증가군 부상 무증가) / Nielsen(주 30%+ 급증은 부상 연관) — SSOT §시작점 앵커링.
 */
const MAX_BUILD_WEEK_GROWTH = 0.25

/**
 * 주차별 목표 볼륨(km) — 늘리는 주마다 **같은 비율**로 base→peak (#848).
 *
 * 예전엔 km 를 선형으로 더했다. 낮은 시작점에선 같은 km 가 큰 비율이라 초반 주가 +30% 넘게 뛰었다
 * (실계정 10K: 18.6 → 25.4km, +37%). 비율 증가로 바꾸면 매주 상승 폭이 일정하고, 상한(25%)을 넘지 않는다.
 * 상한 때문에 peak 에 못 닿으면 닿은 데까지만 간다 — 무리한지는 판정 쪽이 솔직하게 말한다.
 *
 * - 4주마다 회복주: 직전 늘린 주의 80%(바닥 base). 회복주는 "늘리는 주"에서 빠진다.
 * - 테이퍼: 실제로 닿은 최고 볼륨 대비 0.75 → 0.45 로 점진 감량(명목 peak 가 아니라 — 못 닿았는데 명목치로
 *   감량하면 테이퍼가 오히려 늘어난다).
 */
export function planWeeklyVolumes(phases: TrainingPhaseName[], baseVolumeKm: number, peakVolumeKm: number): number[] {
  const isRecoveryWeek = (i: number) => phases[i] !== 'Taper' && phases[i] !== 'Recovery' && (i + 1) % 4 === 0
  const buildCount = phases.filter((p, i) => p !== 'Taper' && p !== 'Recovery' && !isRecoveryWeek(i)).length
  const growth =
    buildCount > 1 && peakVolumeKm > baseVolumeKm
      ? Math.min(Math.pow(peakVolumeKm / baseVolumeKm, 1 / (buildCount - 1)) - 1, MAX_BUILD_WEEK_GROWTH)
      : 0
  const taperLen = phases.filter((p) => p === 'Taper').length
  const volumes: number[] = []
  let buildIndex = 0
  let lastBuild = baseVolumeKm
  let taperPos = 0
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]
    if (phase === 'Taper') {
      const frac = taperLen > 1 ? taperPos / (taperLen - 1) : 0
      volumes.push(lastBuild * (0.75 - 0.3 * frac))
      taperPos++
    } else if (phase === 'Recovery') {
      volumes.push(baseVolumeKm * 0.6)
    } else if (isRecoveryWeek(i)) {
      volumes.push(Math.max(baseVolumeKm, lastBuild * 0.8))
    } else {
      lastBuild = Math.min(peakVolumeKm, baseVolumeKm * Math.pow(1 + growth, buildIndex))
      volumes.push(lastBuild)
      buildIndex++
    }
  }
  return volumes.map((v) => Math.round(v * 10) / 10)
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
        ? formatPaceRangeSec(pace.easyPaceRangeSec[0], pace.easyPaceRangeSec[1])
        : ''
    case 'Race':
      return '' // 한계 시험(TT)은 전력 측정 — 페이스 목표 없음(결과로 체력 갱신)
    case 'Recovery':
      return pace.easyPaceRangeSec ? `${formatPaceSec(pace.easyPaceRangeSec[0])} 이상(느리게)` : ''
    default: // Easy, Easy + Strides
      return pace.easyPaceRangeSec
        ? formatPaceRangeSec(pace.easyPaceRangeSec[0], pace.easyPaceRangeSec[1])
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
 * 한 주 세션들의 거리. 타입별 가중치(롱런 35%·Tempo ×1.1·Recovery ×0.7)로 나눈 뒤 **합이 주간 목표와 같아지게**
 * 맞춘다(#848). 가중치만 쓰면 Tempo 가 많은 주는 목표보다 길고 Recovery 가 낀 주는 짧아져, 주간 합이 목표 곡선과
 * 따로 놀았다(Threshold 진입 주가 +33% 로 튄 원인 중 하나). 한계 시험(Race)은 고정 단거리라 맞춤에서 뺀다.
 */
function weekSessionDistances(types: RunType[], weeklyVolume: number): number[] {
  const raw = types.map((type) => sessionDistance(type, weeklyVolume, types.length))
  const fixed = types.reduce((sum, type, i) => (type === 'Race' ? sum + raw[i] : sum), 0)
  const flex = raw.reduce((sum, km, i) => (types[i] === 'Race' ? sum : sum + km), 0)
  const scale = flex > 0 ? Math.max(0, weeklyVolume - fixed) / flex : 1
  return raw.map((km, i) => (types[i] === 'Race' ? km : round1(km * scale)))
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

  const entryLevel = Boolean(input.entryLevel)
  const runDays = entryLevel ? ENTRY_RUN_DAYS : clamp(profile.weeklyRunDaysTarget ?? 4, 3, 6)
  const longRunDayIndex = Math.max(0, DAY_NAMES.indexOf(profile.preferredLongRunDay || '토요일'))
  // Easy 페이스는 관측값(있으면)으로 보정 — VDOT 추정이 심박과 싸우는 문제 해결(#405).
  const pace = withObservedEasy(resolvePaceModel(profile), input.observedEasyPace)

  // 시작 볼륨 앵커링(#395): 목표거리 역산(×2.5)이 아니라 현재 주간 주행량에서 시작한다.
  // 데이터 없으면(콜드스타트) 보수적 기본값. 이미 목표 피크 이상으로 뛰면 피크를 현재 이상으로
  // 올려 유지하고 base ≤ peak 불변식을 지킨다. (running-coaching-standards "시작점 앵커링")
  const coldStartBaseKm = Math.min(goal.distanceKm * 2.5, 20)
  const hasVolumeData = Boolean(currentWeeklyKm && currentWeeklyKm > 0)
  const anchorKm = hasVolumeData ? (currentWeeklyKm as number) : coldStartBaseKm
  // 데이터가 없으면 등급을 고를 근거가 없다 → 보수적 최저 등급(초보 피크). 콜드스타트 기본값(10K 20km)이
  // 초보 피크와 같아 "이미 초보 피크를 뛴다"로 읽혀 중급(40km)으로 올라가던 사고(2026-10-16) 방지.
  const peakVolumeKm = hasVolumeData
    ? planPeakWeeklyKm(goal.distanceKm, anchorKm)
    : Math.max(minimumGoalWeeklyKm(goal.distanceKm), anchorKm)
  const baseVolumeKm = Math.min(anchorKm, peakVolumeKm)

  const weeklyVolumes = planWeeklyVolumes(phases, baseVolumeKm, peakVolumeKm)

  const drafts: ScheduledSessionDraft[] = []
  let lastTimeTrialWeek = -1
  for (let week = 0; week < phases.length; week++) {
    const phase = phases[week]
    const weekRunDays = runDaysForVolume(runDays, weeklyVolumes[week])
    // 단계 블록 마지막 주면 한계 시험(TT) 삽입 — 다음 단계 진입 전 재측정(#411). 단 직전 TT 와 4주 이상 떨어졌을 때만(#861).
    const isPhaseEnd = week === phases.length - 1 || phases[week + 1] !== phase
    // 입문은 한계 시험이 없다(SSOT §완전 초보 "첫 측정은 권하지 않는다").
    const timeTrialDue = !entryLevel && isPhaseEnd && TIME_TRIAL_PHASES.has(phase) && week - lastTimeTrialWeek >= TIME_TRIAL_MIN_GAP_WEEKS
    if (timeTrialDue) lastTimeTrialWeek = week
    const baseTypes: RunType[] = entryLevel ? Array(weekRunDays).fill('Easy') : weeklySessionTypes(phase, weekRunDays)
    const types = timeTrialDue ? injectTimeTrial(baseTypes) : baseTypes
    const placement = placeOnDays(types, weekRunDays, longRunDayIndex)
    const placedTypes = [...placement.values()]
    const distances = weekSessionDistances(placedTypes, weeklyVolumes[week])

    for (const [slot, [dayIdx, type]] of [...placement].entries()) {
      const date = dateForWeekDay(start, week, dayIdx)
      if (date > target) continue
      const distance = distances[slot]
      drafts.push({
        goalId: goal.id ?? null,
        date: formatDateOnly(date),
        // 입문 주는 단계 이름도 '기초'다 — "역치 집중" 같은 이름을 걷기·뛰기 주에 붙이지 않는다.
        phase: entryLevel ? 'Base' : phase,
        sessionType: type,
        keySession: QUALITY_TYPES.has(type),
        prescription: prescriptionFor(type, distance, pace),
        source: 'generator'
      })
    }
  }

  // 날짜 오름차순 + 중복 날짜 제거(키세션 우선 보존).
  const ordered = dedupeByDate(drafts)
  // 복귀 램프(#473 Phase 2): 가장 이른 windowSessions 개 세션을 Easy·캡으로 낮춰 점진 복원의 1차 가드레일.
  if (input.returnRamp && input.returnRamp.windowSessions > 0) {
    const n = Math.min(input.returnRamp.windowSessions, ordered.length)
    for (let i = 0; i < n; i++) ordered[i] = capReturnSession(ordered[i], input.returnRamp.capKm, pace)
  }
  return ordered
}

/**
 * 복귀 초반 세션(#473 Phase 2)을 Easy 로 낮추고 거리를 상한으로 캡한다(SSOT §휴식과 복귀, 복귀 초반 세션들).
 * 강도·스트라이드 세션(QUALITY 또는 Easy + Strides)은 'Easy' 로 — 복귀 초반 강한 자극·전력 측정 회피.
 * Easy/Recovery 는 타입 유지하고 거리만 캡(상한이므로 더 짧으면 그대로). 처방(페이스·노트·시간)은 새 타입·거리로 재생성.
 */
function capReturnSession(draft: ScheduledSessionDraft, capKm: number, pace: PaceModel): ScheduledSessionDraft {
  const isHard = QUALITY_TYPES.has(draft.sessionType) || draft.sessionType === 'Easy + Strides'
  const type: RunType = isHard ? 'Easy' : draft.sessionType
  const original = draft.prescription.distanceKm
  const cappedKm = original != null && original > 0 ? Math.min(original, capKm) : capKm
  return {
    ...draft,
    sessionType: type,
    keySession: false,
    prescription: prescriptionFor(type, round1(cappedKm), pace)
  }
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
  const longRunDayIndex = Math.max(0, DAY_NAMES.indexOf(profile.preferredLongRunDay || '토요일'))
  const pace = withObservedEasy(resolvePaceModel(profile), input.observedEasyPace)
  const weeklyKm = input.currentWeeklyKm && input.currentWeeklyKm > 0 ? input.currentWeeklyKm : spec.weeklyKmDefault
  // 저볼륨이면 횟수를 줄인다(#861 규칙을 리듬에도) — 주 7.2km 를 4회로 쪼개면 1.8km 세션이 된다(#865).
  const runDays = runDaysForVolume(clamp(profile.weeklyRunDaysTarget ?? spec.runDays, 3, 5), weeklyKm)

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
      // 주 합이 weeklyKm 의 70~88% 다(롱런 몫 35% 를 떼어 둠). 주기화처럼 합을 맞추지 않는다 — 앵커는 "최근 가장 많이 뛴
      // 7일"이라, 맞추면 매주 최고 주를 처방하게 된다. 남는 몫이 상시 리듬의 안전 여유다(#865 에서 검토 후 유지).
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
  /** 무엇으로 판정했나 — 목표 거리를 최근 뛰어봤으면 'pace'(#847), 아니면 'volume'. */
  basis: 'volume' | 'pace'
}

/**
 * 목표 거리를 완주 준비하는 데 필요한 **최소** 주간 주행량(km) — 초보 플랜 피크 기준.
 * Higdon Novice: 10K ≈ 주 12mi(최장 6mi), 하프 Novice 1 = 주 23~25mi, 풀 Novice 1 = 주 40mi(64km).
 * 5K 는 직접 출처 없음 — 10K 절반 거리 대비 보수 추정. 사이는 선형 보간, 양끝은 고정.
 * (플랜 생성기의 피크(거리×4)와는 다른 개념: 이건 "목표가 가능한가" 판정용 바닥값.)
 */
const NOVICE_PEAK_KM: Array<[number, number]> = [
  [5, 15],
  [10, 20],
  [21.1, 38],
  [42.195, 64]
]

export function minimumGoalWeeklyKm(distanceKm: number): number {
  return interpolateByDistance(NOVICE_PEAK_KM, distanceKm)
}

/**
 * 런 기록이 하나도 없는 신규 사용자의 시작 주간 주행량(km) — 온보딩 "완주해본 가장 긴 거리"로 고른다(#865).
 * 완주한 거리의 **다음 거리 초보 플랜 1주차** 주행량(halhigdon.com 표, 2026-10-26 조사):
 * 레이스 전 → 5K Novice 2.4km×3 = 7.2("Never run before? This one's for you"), 5K → 10K Novice 12.0,
 * 10K 이상 → Half Novice 1 16.0(고정 런만, 전제 "3마일을 주 3~4회").
 * 하프·풀 완주자도 16 에서 멈춘다 — 온보딩은 **언제** 완주했는지 모른다. 완주 경험은 현재 체력의 약한 대리값이라
 * (몇 년 전 풀코스 완주자가 지금은 안 뛸 수 있다) 위로 올리지 않고, 실제 기록이 쌓이면 그걸로 넘어간다.
 * 답이 없으면(건너뛰기) 레이스 전과 같다 — SSOT §시작점 앵커링 "그것도 없으면 보수적 최저 등급".
 */
export function coldStartWeeklyKm(selfReportedMaxDistanceM: number | null): number {
  const m = selfReportedMaxDistanceM ?? 0
  if (m >= 10000) return 16
  if (m >= 5000) return 12
  return 7.2
}

/**
 * 플랜을 짓는 시작 주간 주행량(km) — 대시보드 생성과 온보딩 첫 주 미리보기가 **같은 값**을 보게 여기 둔다.
 * 기록이 있으면 최근 감당 볼륨(공백 직전 × 디트레이닝 포함, `deriveWeeklyVolumeAnchorKm`), 기록이 하나도 없는
 * 신규 사용자만 온보딩 답(`coldStartWeeklyKm`, #865). 기록이 있는데 앵커가 0 인 복귀자는 null — 예전 최장 거리로
 * 무거운 플랜을 받으면 안 된다(복귀는 §휴식과 복귀 경로가 맡는다).
 */
export function planStartWeeklyKm(
  runs: Array<{ date: string; distanceKm: number }>,
  selfReportedMaxDistanceM: number | null,
  today: Date
): number | null {
  const noon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const anchorKm = deriveWeeklyVolumeAnchorKm(runs, noon).anchorKm
  if (anchorKm > 0) return anchorKm
  return runs.length === 0 ? coldStartWeeklyKm(selfReportedMaxDistanceM) : null
}

/**
 * 한 단계 위 등급(Higdon Intermediate)의 피크 주간 주행량(km). 초보 피크(NOVICE_PEAK_KM)를 이미 뛰는 러너용.
 * 출처(halhigdon.com 플랜 표, 2026-10-16 조사): 10K Intermediate ≈ 34km(거리 지정 런만 — 템포 포함 시
 * ≈ 10K Advanced 40km), Half Intermediate 1 = 34mi ≈ 55km, Marathon Intermediate 1 = 44mi ≈ 71km,
 * 5K Intermediate = 18mi ≈ 29km. 사이는 선형 보간.
 */
const INTERMEDIATE_PEAK_KM: Array<[number, number]> = [
  [5, 29],
  [10, 40],
  [21.1, 55],
  [42.195, 71]
]

function interpolateByDistance(table: Array<[number, number]>, distanceKm: number): number {
  const first = table[0]
  const last = table[table.length - 1]
  if (distanceKm <= first[0]) return first[1]
  if (distanceKm >= last[0]) return last[1]
  for (let i = 1; i < table.length; i++) {
    const [d1, km1] = table[i]
    if (distanceKm <= d1) {
      const [d0, km0] = table[i - 1]
      return km0 + ((km1 - km0) * (distanceKm - d0)) / (d1 - d0)
    }
  }
  return last[1]
}

/**
 * 플랜 피크 주간 주행량 — **현재 주행량이 등급을 고른다**(SSOT §시작점 앵커링, #848).
 * 지금 주행량보다 높은 첫 등급의 피크로 간다: 초보 피크 미만이면 초보 피크, 초보 피크를 이미 뛰면 중급 피크,
 * 중급 피크도 넘으면 지금 주행량을 유지한다(더 올릴 근거 없음 — 이미 상급 볼륨).
 *
 * 예전엔 `max(목표거리×4, 30)` 하나였다: 10K 40·하프 84·풀 169km. 주 20km 러너의 하프 플랜이 74km,
 * 주 30km 러너의 풀 플랜이 140km 를 향했다.
 */
export function planPeakWeeklyKm(distanceKm: number, currentWeeklyKm: number): number {
  for (const peak of [minimumGoalWeeklyKm(distanceKm), interpolateByDistance(INTERMEDIATE_PEAK_KM, distanceKm)]) {
    if (currentWeeklyKm < peak) return Math.round(peak * 10) / 10
  }
  return currentWeeklyKm
}

/**
 * 목표 거리를 "최근 뛰어봤다"로 인정하는 창(일). SSOT §휴식과 복귀의 디트레이닝 4주 경계를 그대로 쓴다 —
 * 그보다 오래된 긴 런은 최근 획득분이 빠지기 시작해 "완주는 문제 아니다"의 근거가 되지 못한다.
 * (이 창 자체를 정한 권위 출처는 없다 — 2026-10-16 조사. 기존 SSOT 경계를 재사용한 설계값.)
 */
export const GOAL_DISTANCE_RECENCY_DAYS = 28

/**
 * 한 주에 현실적으로 기대할 수 있는 기록 단축(비율). **넉넉하게** 잡은 상한이다 — 이보다 큰 격차만 경고한다.
 * 근거(약함, 2026-10-16 조사): Daniels 계열 — VDOT 를 4~6주마다 재측정, 한 블록에 1~3 포인트, 1포인트 ≈ 기록 1.5~2%.
 * "4주에 1포인트(≈2%)"를 주당으로 펴면 0.5%. 통제 연구 효과크기는 찾지 못했다 — 그래서 상한으로만 쓴다.
 */
const REALISTIC_WEEKLY_IMPROVEMENT = 0.005

export type GoalFeasibilityInput = PeriodizationInput & {
  /** 최근 GOAL_DISTANCE_RECENCY_DAYS 안 최장 런(km). 목표 거리 이상이면 페이스로 판정한다(#847). */
  recentLongestKm?: number | null
  /** 지금 예상 기록(초) — 요약 탭 '활성 목표' 블록이 보여주는 값과 같은 것. */
  projectedSec?: number | null
}

/**
 * 목표가 지금 체력에서 **닿을 수 있는지** 평가한다(#395).
 *
 * - 목표 거리를 최근 4주 안에 뛰어봤으면(#847) 완주는 문제가 아니다 → **페이스**로 본다: 예상 기록에서 목표
 *   기록까지 줄여야 하는 비율이 남은 주 동안의 현실적 단축(주 0.5%)을 넘으면 경고하고 현실적인 목표 기록을 제안.
 * - 아니면 **주행량**으로 본다: 목표 거리의 최소 주간 주행량(minimumGoalWeeklyKm)까지, 회복주·테이퍼를 뺀
 *   "늘리는 주"마다 필요한 증가율(복리)이 급증선(MAX_BUILD_WEEK_GROWTH)을 넘으면 경고.
 * (근거: running-coaching-standards "시작점 앵커링" — 10% 룰은 근거 약함(Buist), ~30%+ 급증은 부상 연관(Nielsen).)
 */
export function assessGoalFeasibility(input: GoalFeasibilityInput): GoalFeasibility {
  const { goal, today, currentWeeklyKm } = input
  if (!goal.targetDate || !goal.distanceKm || goal.distanceKm <= 0) {
    return { feasible: true, requiredWeeklyGrowth: 0, message: null, basis: 'volume' }
  }
  const start = startOfDay(today)
  const target = startOfDay(new Date(`${goal.targetDate}T00:00:00`))
  const weeks = Math.max(1, Math.ceil((target.getTime() - start.getTime()) / MS_PER_DAY / 7))

  if ((input.recentLongestKm ?? 0) >= goal.distanceKm) return assessGoalPace(goal, weeks, input.projectedSec ?? null)

  const neededKm = minimumGoalWeeklyKm(goal.distanceKm)
  const current = currentWeeklyKm && currentWeeklyKm > 0 ? currentWeeklyKm : Math.min(goal.distanceKm * 2.5, 20)
  if (current >= neededKm) return { feasible: true, requiredWeeklyGrowth: 0, message: null, basis: 'volume' }
  // 테이퍼·회복주(4주마다)는 볼륨을 늘리지 않으니 빼고 남은 주로 계산한다(planWeeklyVolumes 와 같은 규칙).
  const taperWeeks = allocatePhases(weeks, goal.distanceKm).filter((p) => p === 'Taper').length
  const recoveryWeeks = Math.floor((weeks - taperWeeks) / 4)
  const buildWeeks = Math.max(1, weeks - taperWeeks - recoveryWeeks)
  // current * (1+g)^buildWeeks = needed  →  g = (needed/current)^(1/buildWeeks) - 1
  const growth = Math.pow(neededKm / current, 1 / buildWeeks) - 1
  if (growth <= MAX_BUILD_WEEK_GROWTH) return { feasible: true, requiredWeeklyGrowth: growth, message: null, basis: 'volume' }
  const pct = Math.round(growth * 100)
  return {
    feasible: false,
    requiredWeeklyGrowth: growth,
    basis: 'volume',
    message: `지금 주행량(약 ${Math.round(current)}km/주)에서 이 목표에 필요한 주행량(주 약 ${Math.round(neededKm)}km)까지 가려면, 회복 주와 대회 전 감량 주를 빼고 늘리는 주마다 약 ${pct}%씩 올려야 해요. 한 주에 30% 가까이 늘리면 부상 위험이 커져요. 목표일을 조금 미루거나 목표 거리를 낮추는 걸 권해요.`
  }
}

/** 목표 거리를 이미 뛰어본 러너 — 관건은 버티기가 아니라 목표 페이스다(#847). */
function assessGoalPace(goal: TrainingGoal, weeks: number, projectedSec: number | null): GoalFeasibility {
  const targetSec = goal.targetDurationSec ?? null
  // 목표 기록이 없거나(완주 목표) 예상 기록을 못 내면 판정할 게 없다 — 거리는 이미 뛰어봤다.
  if (!targetSec || !projectedSec || projectedSec <= targetSec) {
    return { feasible: true, requiredWeeklyGrowth: 0, message: null, basis: 'pace' }
  }
  const neededCut = (projectedSec - targetSec) / projectedSec
  // 장기(30주+) 상한 15% — 초보 1년 단축 추정치(10~15%, Runner's Connect 코칭 추정)를 넘겨 약속하지 않는다.
  const realisticCut = Math.min(REALISTIC_WEEKLY_IMPROVEMENT * weeks, 0.15)
  if (neededCut <= realisticCut) return { feasible: true, requiredWeeklyGrowth: 0, message: null, basis: 'pace' }
  // 제안 기록은 분 단위로 올림 — "1:14:23" 보다 "1:15:00" 이 목표답고, 낙관 쪽으로 깎지 않는다.
  const suggestedSec = Math.ceil((projectedSec * (1 - realisticCut)) / 60) * 60
  return {
    feasible: false,
    requiredWeeklyGrowth: 0,
    basis: 'pace',
    message: `최근 ${goal.distanceKm}km 를 이미 뛰어봤으니 완주는 걱정 없어요. 관건은 페이스예요 — 지금 예상 기록(${formatDuration(projectedSec)})에서 목표(${formatDuration(targetSec)})까지 약 ${Math.round(neededCut * 100)}% 빨라져야 하는데, 남은 ${weeks}주 동안 현실적으로 기대할 수 있는 건 ${Math.max(1, Math.round(realisticCut * 100))}% 안팎이에요. 목표 기록을 ${formatDuration(suggestedSec)} 정도로 조정하거나 목표일을 미루는 걸 권해요.`
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

export const PHASE_LABEL_KO: Record<TrainingPhaseName, string> = {
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
  /** 그 주 세션 수 — 입문(걷기·뛰기)은 km 대신 횟수로 보여준다. */
  sessionCount: number
}

/**
 * 오늘이 속한 캘린더 주(일~토)의 스케줄을 요약한다. 트레이니에게 "이번 주가 통째로 뭘 위한 주인지"를 준다.
 */
/** 비성과 아키타입용 위크요약 라벨(단계 대신). running-coaching-standards "목표 타입별 코칭". */
const NON_PERF_SUMMARY: Record<'fat-loss' | 'wellbeing', { label: string; focus: string }> = {
  'fat-loss': { label: '체중·체형', focus: '존2 유산소 리듬' },
  wellbeing: { label: '건강·습관', focus: '규칙적 유산소' }
}
/** 입문(5K 미완주) 레이스 플랜 — 단계 이름도 걷기·뛰기다(#887). 플랜 세션은 'Base' 를 달지만 화면엔 기초기라 부르지 않는다. */
const ENTRY_SUMMARY = { label: '걷기·뛰기', focus: '30분 연속 달리기 만들기' }

/**
 * "이번 주" 단일 기준(SSOT). 훈련 주는 **월요일 시작–일요일 종료**로 통일한다.
 * 위크요약·이번주 미션이 같은 창을 쓰도록 여기서만 정의한다(과거: 요약=일~토, 미션=월~일로 어긋나
 * 같은 주인데 볼륨이 달라 보이던 버그). 캐러셀 day-strip은 오늘 중심 롤링이라 별개(네비게이션용).
 */
export function trainingWeekRange(today: Date): { start: string; end: string } {
  const base = startOfDay(today)
  const mondayOffset = (base.getDay() + 6) % 7 // 월요일=0
  const weekStart = new Date(base.getTime() - mondayOffset * MS_PER_DAY)
  const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY)
  return { start: formatDateOnly(weekStart), end: formatDateOnly(weekEnd) }
}

export function buildWeekSummary(
  sessions: ScheduledSession[],
  today: Date,
  targetDate: string | null,
  /** 목표 아키타입(#398). 비성과는 단계/D-day 대신 유형 라벨, 마감 없음. */
  archetype: GoalArchetype = 'performance',
  /**
   * 요약할 주(2026-09-07). 기본은 오늘 주 — 주 넘기기로 **보고 있는 주**를 요약할 때만 다르게 준다.
   * D-day 는 언제나 오늘 기준이다: 다음주를 보는 동안에도 대회까지 남은 날은 그대로여야 한다.
   */
  weekAnchor: Date = today,
  /** 입문(걷기·뛰기) — 단계 대신 '걷기·뛰기' 라벨(#887). */
  entryLevel = false
): WeekSummary | null {
  const start = startOfDay(today)
  const { start: startStr, end: endStr } = trainingWeekRange(weekAnchor)

  // rested(선언한 휴식, #473) 제외 — 안 그러면 휴식 주의 처방 km/핵심 세션이 주간 요약 헤더에 잡혀
  // weekMission(isActiveSession 기반)과 같은 주의 볼륨이 어긋나고, 쉬는 주를 "약 N km" 로 닦달한다.
  const week = sessions.filter(
    (s) =>
      s.date >= startStr &&
      s.date <= endStr &&
      s.status !== 'superseded' &&
      s.status !== 'skipped' &&
      s.status !== 'rested'
  )
  if (!week.length) return null

  const phase = weekPhase(week, formatDateOnly(start))
  const keyCount = week.filter((s) => s.keySession).length
  const weekKm = round1(week.reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0))

  // 비성과는 마감 없는 상시 — D-day 미표시.
  let dDayText = ''
  if (archetype === 'performance' && targetDate) {
    const target = startOfDay(new Date(`${targetDate}T00:00:00`))
    const days = Math.round((target.getTime() - start.getTime()) / MS_PER_DAY)
    if (days >= 0) dDayText = `D-${days}`
  }

  // 비성과는 단계(기초기 등) 대신 유형 라벨, 입문은 걷기·뛰기.
  const label = archetype !== 'performance' ? NON_PERF_SUMMARY[archetype] : entryLevel ? ENTRY_SUMMARY : null
  return {
    phase,
    phaseLabel: label?.label ?? PHASE_LABEL_KO[phase],
    focusLine: label?.focus ?? PHASE_FOCUS_KO[phase],
    keyCount,
    weekKm,
    dDayText,
    sessionCount: week.length
  }
}

/**
 * 한 주의 단계 — 그 주에 오늘 세션이 있으면 그 세션의, 없으면 그 주 최빈 단계.
 * 위크 요약과 코치 탭 단계 카드(planPhases)가 같은 정의를 쓴다(#887 — 단계가 두 개로 갈리지 않게).
 */
export function weekPhase(weekSessions: ScheduledSession[], todayIso: string): TrainingPhaseName {
  return weekSessions.find((s) => s.date === todayIso)?.phase ?? mostCommonPhase(weekSessions)
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

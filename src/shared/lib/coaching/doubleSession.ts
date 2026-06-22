/**
 * 같은 날 2세션(더블/make-up) 코칭 로직 (#455).
 *
 * 두 번 뛰기는 볼륨을 늘리는 **고급 도구**이지 초보의 기본기가 아니다(SSOT §같은 날 2세션).
 * 이 모듈은 순수 로직만 둔다 — 영속/표시는 store·UI가, 인앱 라이브 시작 둘째 세션의 minGap 강한 확인은 RacePage(웹)가 맡는다(#462).
 *
 *  - evaluateDoubleEligibility: 누가 더블을 받는가(경력·볼륨·부상·단일 quality 적응). 초보 앱이라 게이트는 강하게.
 *  - forcePmEasyType / buildPmEasyDraft: 둘째(PM)는 이지/회복 강제(quality는 AM, 일일 quality ≤1).
 *  - classifyDoubleGap: 세션 간 최소 간격(하한 ~5h, 권장 7~9h) 분류.
 *  - buildDoubleSuggestion: 코치 자동제안 신호(현재 주 '열린 장부' 따라잡기 — 주말 트리아지의 자매 갈래).
 *
 * SSOT: .harness/project/running-coaching-standards.md §같은 날 2세션, decision-log 2026-06-21.
 */

import type { RunLog, RunType } from '@/entities/run/model'
import {
  isActiveSession,
  type ScheduledSession,
  type ScheduledSessionDraft,
  type TrainingPhaseName
} from '@/entities/training-schedule/model'
import { getActiveInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { gate1InputsFromRuns } from '@/shared/lib/level/levelModel'
import { getAcwr } from '@/shared/lib/runStats'
import { isHardType, trainingWeekRange } from '@/shared/lib/coaching/periodizedSchedule'
import type { CriterionStatus } from '@/shared/lib/coaching/progressionCriteria'
import { currentWeekBacklog, weekDaysLeftInclusive } from '@/shared/lib/coaching/weeklyTriage'

// ── 적격 게이트 임계값(SSOT 가드레일, 절대규칙 아님) ──────────────────────────────
/**
 * 더블 권장 최소 경력. SSOT: "처음 ~2년(24개월)은 단일 세션/일이 원칙"이고 더블은 그 다음 "**수년간**" 무통증 고볼륨 러너에게만.
 * 즉 24개월은 아직 단일-only 구간의 경계라 더블 자격이 아니다 — 약 3년(36개월)을 floor 로 둔다(게이트는 강하게, 코드 advanced=36mo 정합).
 */
export const DOUBLE_MIN_EXPERIENCE_MONTHS = 36
/** 더블 권장 최소 주간 볼륨(km). SSOT: 대략 주 50mi·80km 이상을 무통증으로 소화. */
export const DOUBLE_MIN_WEEKLY_VOLUME_KM = 80
/**
 * 급성 부하 가드 상한(ACWR). 더블은 일일/주간 부하를 압축하므로 ACWR 유지밴드(0.8~1.3, >1.5 위험)를 적용한다
 * (SSOT §부상 연계, running-injury-knowledge.md). ACWR > 1.5 면 더블을 제안/추가하지 않는다.
 */
export const DOUBLE_ACWR_CEILING = 1.5

// ── 세션 간 최소 간격(minGap) ──────────────────────────────────────────────────
/** 두 세션 간 하한(시간). 이보다 짧으면 회복·글리코겐 재합성 창 부족 → 인앱 라이브 시작 시 강한 확인+오버라이드(#462, RacePage). */
export const DOUBLE_MIN_GAP_HOURS = 5
/** 권장 간격 하한(시간). 7~9시간이 최적(Marathon Handbook). */
export const DOUBLE_RECOMMENDED_GAP_HOURS = 7

export type DoubleGapVerdict = 'blocked' | 'tight' | 'ok'

/** 세션 간 간격(시간)을 분류한다. <5h=차단, 5~7h=빠듯(소프트 경고), ≥7h=양호. */
export function classifyDoubleGap(gapHours: number): DoubleGapVerdict {
  if (gapHours < DOUBLE_MIN_GAP_HOURS) return 'blocked'
  if (gapHours < DOUBLE_RECOMMENDED_GAP_HOURS) return 'tight'
  return 'ok'
}

const HOUR_MS = 3_600_000

/**
 * 세션 간 간격을 **오전 런 실제 종료시각 기준**으로 평가한 동적 안내 상태(Phase 4 #462).
 *  - phase 'planning': 오전 런이 아직 안 끝남(amEndAt 없음) → 시각 미정, 일반 minGap 안내만.
 *  - phase 'measured': 오전 종료시각 기준 경과·판정·권장 오후 시작 시각(하한/최적)을 계산.
 * 시각은 ISO 문자열로 돌려준다(UI 의 formatTime 입력에 그대로 맞춤).
 */
export type DoubleGapStatus = {
  phase: 'planning' | 'measured'
  /** measured: 오전 종료~기준시각 경과(시간). planning: null. */
  gapHours: number | null
  /** measured: classifyDoubleGap 판정. planning: null. */
  verdict: DoubleGapVerdict | null
  /** 오전 종료 시각(ISO). measured만. */
  amEndAt: string | null
  /** 오후 시작 권장 하한 = 오전 종료 + minGap(ISO). measured만. */
  earliestStartAt: string | null
  /** 오후 시작 최적 = 오전 종료 + 권장 간격(ISO). measured만. */
  optimalStartAt: string | null
}

/**
 * 같은 날 더블의 세션 간 간격을 동적으로 평가한다(#462 v1 — 웹 선제 안내).
 * 오전 런 종료시각(`amEndAt`)이 있으면 기준시각(`at`, 기본 now)까지 경과로 verdict 와
 * 권장 오후 시작 시각(오전 종료 +minGap / +권장)을 계산하고, 없으면 'planning' 을 돌려준다.
 * 순수 함수 — 표시는 UI. 인앱 라이브 시작(RacePage)으로 시작하는 둘째 세션엔 이 verdict로 강한 확인을 띄운다
 * (#462, 물리 차단 아님·오버라이드 허용). 워치 임포트 런은 인앱 '시작' 이벤트가 없어 안내만.
 */
export function evaluateDoubleGap(input: { amEndAt: string | null | undefined; at?: Date }): DoubleGapStatus {
  const raw = input.amEndAt ?? null
  const amEnd = raw ? new Date(raw) : null
  if (!amEnd || !Number.isFinite(amEnd.getTime())) {
    return { phase: 'planning', gapHours: null, verdict: null, amEndAt: null, earliestStartAt: null, optimalStartAt: null }
  }
  const at = input.at ?? new Date()
  const gapHours = (at.getTime() - amEnd.getTime()) / HOUR_MS
  return {
    phase: 'measured',
    gapHours,
    verdict: classifyDoubleGap(gapHours),
    amEndAt: amEnd.toISOString(),
    earliestStartAt: new Date(amEnd.getTime() + DOUBLE_MIN_GAP_HOURS * HOUR_MS).toISOString(),
    optimalStartAt: new Date(amEnd.getTime() + DOUBLE_RECOMMENDED_GAP_HOURS * HOUR_MS).toISOString()
  }
}

/**
 * 더블을 추가해도 급성 부하상 안전한가. ACWR > DOUBLE_ACWR_CEILING(1.5)면 위험 → 추가 보류
 * (더블은 부하를 압축하므로 ACWR 가드 적용 — SSOT §부상 연계). 만성 기반이 빈약해 ACWR 산출 불가(null)면
 * 적격 볼륨 게이트(80km)가 이미 거르므로 안전으로 본다. **수동 추가(Phase 3 UI)도 이 가드를 거쳐야 한다**
 * (store.addDouble 은 구조 불변식만 — 부하·적격 판단은 호출부).
 */
export function isDoubleLoadSafe(runs: RunLog[], today = new Date()): boolean {
  const acwr = getAcwr(runs, today)
  return acwr === null || acwr <= DOUBLE_ACWR_CEILING
}

// ── 적격 게이트 ────────────────────────────────────────────────────────────────
export type DoubleEligibilityCriterionKey = 'experience' | 'volume' | 'injury' | 'quality-adaptation'

export type DoubleEligibilityCriterion = {
  key: DoubleEligibilityCriterionKey
  met: boolean
  /** UI/코치가 보여주는 한 줄 사유(통과/미달 공통). */
  label: string
}

export type DoubleEligibility = {
  /** 4기준 모두 충족해야 더블 처방 가능(미달이면 더블 옵션 숨김·차단 — 결정 D). */
  eligible: boolean
  criteria: DoubleEligibilityCriterion[]
  /** 미달 기준 라벨(차단 카드/코치 설명용). eligible이면 빈 배열. */
  blockers: string[]
}

export type DoubleEligibilityInput = {
  /** 경력·부상 출처. */
  memory: TrainingMemory
  /** 최근 볼륨 산출(gate1InputsFromRuns 28일 롤링 주간평균). */
  runs: RunLog[]
  /**
   * 단일 quality 적응 신호 = tempo-ceiling-quality 기준 status(evaluateProgressionCriteria).
   * 'blocked'(quality 세션이 흔들림)면 더블 금지 — 하드 부하 위에 더 쌓지 않는다. 'ready'면 적응 입증.
   * 'watch'/'n/a'(현 단계 quality 없음)는 다른 강한 게이트(경력·볼륨·부상)에 맡기고 통과시킨다.
   */
  qualityAdaptation: CriterionStatus
  today?: Date
}

/**
 * 누가 더블을 받는가. 초보 중심 앱이므로 게이트는 강하게 — 4기준 모두 충족해야 한다.
 * 데이터가 없으면(경력 미입력 등) 보수적으로 미달 처리한다.
 */
export function evaluateDoubleEligibility(input: DoubleEligibilityInput): DoubleEligibility {
  const today = input.today ?? new Date()
  const expMonths = input.memory.athleteProfile.runningExperienceMonths
  const weeklyVolumeKm = gate1InputsFromRuns(input.runs, today).weeklyVolumeKm
  const activeInjury = getActiveInjuryItem(input.memory)

  const experienceMet = expMonths !== null && Number.isFinite(expMonths) && expMonths >= DOUBLE_MIN_EXPERIENCE_MONTHS
  const volumeMet = weeklyVolumeKm >= DOUBLE_MIN_WEEKLY_VOLUME_KM
  // active/monitoring 부상은 더블 금지(SSOT: 부상 이력/현재 통증이면 금지). 회복 우선.
  const injuryMet = activeInjury === null
  // 단일 quality에 적응했는가. 'blocked'(quality 실패)만 차단, 그 외는 통과(강한 게이트는 경력·볼륨·부상).
  const qualityMet = input.qualityAdaptation !== 'blocked'

  const criteria: DoubleEligibilityCriterion[] = [
    {
      key: 'experience',
      met: experienceMet,
      label: experienceMet
        ? `러닝 경력 ${expMonths}개월 — 더블 도입 기준(2년 이상) 충족`
        : expMonths === null
          ? '러닝 경력 미입력 — 더블은 2년 이상 경력부터(보수적 차단)'
          : `러닝 경력 ${expMonths}개월 — 더블은 2년(24개월) 이상부터`
    },
    {
      key: 'volume',
      met: volumeMet,
      label: volumeMet
        ? `최근 주간 볼륨 ${weeklyVolumeKm}km — 고볼륨 기준(주 80km) 충족`
        : `최근 주간 볼륨 ${weeklyVolumeKm}km — 더블은 주 80km 이상 소화부터`
    },
    {
      key: 'injury',
      met: injuryMet,
      label: injuryMet
        ? '활성/관찰 중 부상 없음 — 더블 가능'
        : `${activeInjury?.area || '관리 부위'} ${activeInjury?.status === 'active' ? '부상' : '관찰'} 중 — 회복 우선, 더블 보류`
    },
    {
      key: 'quality-adaptation',
      met: qualityMet,
      label: qualityMet
        ? '단일 quality 세션 적응 양호 — 더블 가능'
        : 'quality 세션이 아직 흔들려요 — 단일 세션 안정이 먼저'
    }
  ]

  const blockers = criteria.filter((c) => !c.met).map((c) => c.label)
  return { eligible: blockers.length === 0, criteria, blockers }
}

// ── PM(둘째) 이지/회복 강제 ──────────────────────────────────────────────────────
/** 둘째 세션 기본 타입. 회복이 목적이므로 이지(대화 가능 페이스). */
export const PM_DOUBLE_DEFAULT_TYPE: RunType = 'Easy'
/** 둘째 세션 기본 시간(분). SSOT: 처음엔 20~30분. */
export const PM_DOUBLE_DEFAULT_DURATION_MIN = 25

/**
 * 둘째(PM) 세션 타입을 이지/회복으로 강제한다. quality(Tempo/LSD/Steady Long/Race)면 이지로 내린다.
 * 일일 quality ≤1·"둘째는 이지" 원칙(SSOT §강도 배치) — 같은 날 하드-하드 금지.
 */
export function forcePmEasyType(type: RunType): RunType {
  return isHardType(type) ? PM_DOUBLE_DEFAULT_TYPE : type
}

/**
 * 코치 제안/수동 추가에 쓸 둘째(PM) 세션 draft 를 만든다. 항상 이지/회복·비키세션·수동 소스.
 * 거리 목표 없이 시간(발 위 시간) 기반(SSOT: 둘째는 대화 가능 페이스로 20~30분).
 * store.addDouble 가 slot='PM' 으로 insert 하고 기존 세션을 'AM' 으로 표시한다.
 */
export function buildPmEasyDraft(input: {
  goalId: string | null
  date: string
  phase: TrainingPhaseName
  /** 원하는 PM 타입(기본 Easy). quality면 강제로 이지로 내린다. */
  desiredType?: RunType
  /** 둘째 세션 시간(분, 기본 25 — 20~30분). */
  durationMin?: number
  /** 있으면 페이스대 라벨(VDOT 파생). 없으면 ''(브리핑이 RPE/심박 우선으로 안내). */
  paceRange?: string
}): ScheduledSessionDraft {
  const sessionType = forcePmEasyType(input.desiredType ?? PM_DOUBLE_DEFAULT_TYPE)
  const durationMin = Math.max(15, Math.round(input.durationMin ?? PM_DOUBLE_DEFAULT_DURATION_MIN))
  return {
    goalId: input.goalId,
    date: input.date,
    phase: input.phase,
    sessionType,
    slot: 'PM',
    keySession: false, // 둘째는 절대 키세션 아님
    prescription: {
      distanceKm: null,
      durationMin,
      paceRange: input.paceRange ?? '',
      note: '둘째 세션 — 이지/회복(대화 가능 페이스). 회복이 목적이라 천천히, 첫 세션과 5시간 이상 벌려요.'
    },
    source: 'manual'
  }
}

// ── 코치 자동제안 신호(현재 주 따라잡기) ──────────────────────────────────────────
export type DoubleSuggestion = {
  /** PM 을 붙일 날의 기존 세션(이게 AM 이 된다). */
  amSession: ScheduledSession
  /** 따라잡을 이지 백로그 세션(PM 으로 만회). */
  backlogSession: ScheduledSession
  /** 코치 메시지용 라벨(예: "오늘 Tempo"). */
  amDayLabel: string
  /** 코치 메시지용 라벨(예: "월요일 Easy"). */
  backlogLabel: string
}

const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']

function dayLabel(date: string, todayStr: string): string {
  if (date === todayStr) return '오늘'
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : `${WEEKDAY_LABEL[d.getDay()]}요일`
}

function toDateOnly(d: Date): string {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  const y = copy.getFullYear()
  const m = String(copy.getMonth() + 1).padStart(2, '0')
  const day = String(copy.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type BuildDoubleSuggestionInput = {
  sessions: ScheduledSession[]
  memory: TrainingMemory
  runs: RunLog[]
  qualityAdaptation: CriterionStatus
  /** 최근 누적 부하가 급증(spike)했는가 — 급성 과부하 가드(더블로 볼륨 더 쌓지 않는다). */
  chronicSpike: boolean
  today: Date
}

/**
 * 코치가 더블을 자동제안할지 결정한다(현재 주 '열린 장부'의 따라잡기 — 주말 트리아지의 자매 갈래).
 * 주말 트리아지(backlog > 남은 날)가 "다 못 끼우니 놓아주라"면, 더블 제안은 그 직전 구간
 * (backlog ≤ 남은 날, 즉 더블로 따라잡을 수 있을 때) "오후 이지로 붙여 살리자"는 부드러운 제안이다.
 *
 * 조건(모두 충족 시 제안): 적격(게이트) · 급성 과부하 없음 · 주 막판(남은 ≤2일) ·
 *   이지 백로그(과거 due 미수행, quality 제외) ≥1 · 트리아지 오버플로 아님 · 붙일 기존 세션(AM)이 있음.
 * 미달이거나 트리아지 구간이면 null(자격 미달이면 더블 대신 재배치·놓아주기 — SSOT §위치).
 */
export function buildDoubleSuggestion(input: BuildDoubleSuggestionInput): DoubleSuggestion | null {
  const { sessions, memory, runs, qualityAdaptation, chronicSpike, today } = input
  // 1) 적격 미달이면 더블 제안 안 함(재배치·놓아주기는 다른 경로가 담당).
  if (!evaluateDoubleEligibility({ memory, runs, qualityAdaptation, today }).eligible) return null
  // 2) 급성 과부하면 볼륨을 더 쌓지 않는다(부상 가드는 적격에서 이미 차단).
  //    ACWR > 1.5(부하 압축 위험 — SSOT §부상 연계) 또는 30일 절대 스파이크면 제안하지 않는다.
  if (chronicSpike || !isDoubleLoadSafe(runs, today)) return null

  // 3) 주 막판(남은 1~2일)에만 — 평소엔 정상 일정으로 따라잡으면 된다(과발동 금지).
  const daysLeftIncl = weekDaysLeftInclusive(today)
  if (daysLeftIncl > 2) return null

  // 4) 트리아지 오버플로(backlog > 남은 날)면 더블 제안 아님 — 그건 "놓아주기"(weekEndTriage)가 담당.
  const backlog = currentWeekBacklog(sessions, today)
  if (backlog.length === 0 || backlog.length > daysLeftIncl) return null

  // 5) 더블로 만회할 백로그는 **이지(비quality)** 만. quality 백로그는 같은 날 더블로 안 만든다(2 quality/일 금지) — 재배치.
  const easyBacklog = backlog.filter((s) => !isHardType(s.sessionType))
  if (easyBacklog.length === 0) return null

  // 6) PM 을 붙일 날 = 오늘 이후(이번 주) 활성 세션이 있고 아직 더블이 아닌 가장 이른 날.
  const { start, end } = trainingWeekRange(today)
  const todayStr = toDateOnly(today)
  const pmExistsOn = new Set(
    sessions
      .filter((s) => s.slot === 'PM' && s.status !== 'superseded' && s.status !== 'skipped')
      .map((s) => s.date)
  )
  const amSession = sessions
    .filter(
      (s) =>
        s.date >= todayStr &&
        s.date <= end &&
        s.date >= start &&
        isActiveSession(s) &&
        !pmExistsOn.has(s.date)
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!amSession) return null

  // 만회할 이지 백로그 = 가장 최근(가까운) 것 1건.
  const backlogSession = [...easyBacklog].sort((a, b) => b.date.localeCompare(a.date))[0]

  return {
    amSession,
    backlogSession,
    amDayLabel: `${dayLabel(amSession.date, todayStr)} ${amSession.sessionType}`,
    backlogLabel: `${dayLabel(backlogSession.date, todayStr)} ${backlogSession.sessionType}`
  }
}

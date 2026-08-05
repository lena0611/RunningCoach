import type { CoachResponseMode } from './responseMode.ts'

/**
 * 코치 대화 → 훈련 스케줄 액션 제안(#639) 정규화 게이트.
 *
 * 코치는 스케줄을 **직접 바꾸지 않는다**. 여기서 만드는 제안은 부상 제안(injuryUpdateProposal)과 동일 등급의
 * **승인형 후보**이고, 웹은 이를 카드로 보여준 뒤 기존 진입점(휴식 선언 시트 / 코치 탭 세션 액션)으로 연결만 한다.
 * 따라서 액션 어휘에 재정렬(realign) 류가 없다 — SSOT §60 "실시간 코칭은 알리고 돕되 골격을 다시 짜지 않는다",
 * §32 "변경은 국소 처리".
 *
 * 게이트는 프롬프트가 아니라 **코드**가 강제한다([[coach-always-on-block-deterministic]]).
 * 프롬프트 지침은 품질을 높일 뿐이고, 안전 불변식은 전부 이 모듈에서 떨군다.
 */

export type CoachScheduleActionType =
  | 'declare_rest'
  | 'ease_session'
  | 'intensify_session'
  | 'reschedule_session'
  | 'skip_session'

export type CoachScheduleRestReason = 'injury' | 'weather' | 'personal' | 'other'

export type CoachScheduleProposal = {
  actionType: CoachScheduleActionType
  /** 세션 액션의 대상 날짜(YYYY-MM-DD). declare_rest 면 항상 null. */
  targetDate: string | null
  /** declare_rest 프리셋. 사용자가 발화에서 **명시한** 기간만 담긴다(발명 금지). 없으면 null. */
  suggestedRestUntil: string | null
  restReason: CoachScheduleRestReason | null
  rationale: string
  userApprovalPrompt: string
}

/** 세션 액션의 대상 후보. 웹이 보낸 upcomingSchedule 항목에서 게이트에 필요한 필드만 본다. */
export type ScheduleProposalTarget = {
  date: string
  /**
   * 상향(intensify) 적격 — **웹이 산출한다**(client-summary 패턴).
   * 강도 사다리(alternativeSession)와 progressionCriteria 가 웹 SSOT 라 서버에 미러를 두지 않는다.
   * 값이 없으면 부적격으로 본다(fail-safe deny).
   */
  canIntensify?: boolean
}

export type ScheduleProposalGate = {
  responseMode: CoachResponseMode
  /** 웹이 보낸 다가오는 세션들. null/빈 배열이면 세션 액션은 전부 떨군다. */
  upcomingSchedule: ScheduleProposalTarget[] | null
  /** 이미 선언된 휴식 기간 중인가(범용 휴식 #473, activeRest). */
  restActive: boolean
  /**
   * 활성 부상(status=active)이 있는가(#639 G9). 부상 중의 휴식은 **부상 관리 시스템**(체크인·복귀 게이트·
   * 전략적 휴식 스케줄)이 소유한다 — 그 위에 "쉬어가기 선언"을 또 제안하면 휴식이 이중 시스템에 걸려
   * 사용자가 어찌할 바를 모른다(2026-08-05 실사고: 족저근막 부상선언·휴식 중 "11월 목표 걱정" 발화에
   * 쉬어가기 카드가 떴다 — activeRest 가 없어 G4 를 통과). monitoring(재발 감시)은 정상 훈련 중이라 제외.
   */
  injuryActive: boolean
  /** redFlag 발동 또는 고통증(4~5/5) — 상향을 막는다. */
  injuryBlocksIntensify: boolean
  /** 오늘 날짜(YYYY-MM-DD). 휴식 프리셋 상한 계산 기준. */
  today: string
}

const ACTION_TYPES: CoachScheduleActionType[] = [
  'declare_rest',
  'ease_session',
  'intensify_session',
  'reschedule_session',
  'skip_session'
]

const REST_REASONS: CoachScheduleRestReason[] = ['injury', 'weather', 'personal', 'other']

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 휴식 프리셋 상한(일). SSOT §84 — 4주를 넘는 중단은 "최근 획득분 사실상 소실 + 목표 실현가능성 재점검" 구간이라
 * LLM 이 기본값으로 밀어넣을 자리가 아니다. 넘으면 프리셋만 버리고(제안 자체는 살린다) 시트 기본값을 쓰게 한다.
 */
export const REST_PRESET_MAX_DAYS = 28

/**
 * LLM 이 낸 스케줄 제안을 안전한 형태로 강제한다. 하나라도 불변식을 깨면 **제안 전체를 null 로 떨군다**
 * (부분 복구 금지 — 반쯤 맞는 제안이 사용자에게 코치 권위로 보이는 게 더 위험하다).
 */
export function normalizeCoachScheduleProposal(raw: unknown, gate: ScheduleProposalGate): CoachScheduleProposal | null {
  // G2: 단일 객체만 — 배열로 여러 건을 밀어넣지 못한다(1 응답 1 제안).
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  // G6: 빈 노트 자동 디브리핑에서는 제안하지 않는다. 사용자가 아무 말도 안 했는데 휴식/조정 카드가 뜨면 닦달이다.
  //     능동 넛지의 제도적 자리는 coachMoments 와 SSOT §39 주말 트리아지이지 디브리핑 리포트가 아니다.
  if (gate.responseMode === 'report') return null

  const value = raw as Record<string, unknown>

  // G1: 어휘 밖 액션은 없다. realign 류가 애초에 어휘에 없으므로 여기서 자동 차단된다.
  const actionType = ACTION_TYPES.find((type) => type === value.actionType)
  if (!actionType) return null

  const rationale = readText(value.rationale, 500)
  const userApprovalPrompt = readText(value.userApprovalPrompt, 220)
  if (!rationale || !userApprovalPrompt) return null

  if (actionType === 'declare_rest') {
    // G4: 이미 쉬는 중이면 재제안하지 않는다.
    if (gate.restActive) return null
    const restReason = REST_REASONS.find((reason) => reason === value.restReason) ?? 'other'
    // G9: 활성 부상 중의 부상성 휴식 제안은 떨군다 — 부상 휴식은 부상 관리가 이미 소유한다(위 injuryActive 주석).
    //     부상과 무관함이 명시된 사유(개인 일정·날씨)만 통과한다. 'other'는 부상 대화에서 나온 애매한
    //     휴식 발화일 가능성이 높아 부상 쪽으로 보수 처리한다.
    if (gate.injuryActive && (restReason === 'injury' || restReason === 'other')) return null
    return {
      actionType,
      targetDate: null,
      suggestedRestUntil: normalizeRestPreset(value.suggestedRestUntil, gate.today),
      restReason,
      rationale,
      userApprovalPrompt
    }
  }

  // G3: 세션 액션의 대상은 웹이 보낸 실제 예정 세션이어야 한다. 날짜를 지어내면 떨군다.
  const targetDate = readText(value.targetDate, 10)
  if (!DATE_PATTERN.test(targetDate)) return null
  const target = gate.upcomingSchedule?.find((session) => session.date === targetDate)
  if (!target) return null

  if (actionType === 'intensify_session') {
    // G5: redFlag/고통증이면 상향하지 않는다 — 부상 KB 게이트가 처방보다 우선.
    if (gate.injuryBlocksIntensify) return null
    // G7: 상향은 품질 게이트를 통과했을 때만. 판정은 웹 소유(canIntensify), 없으면 부적격.
    if (target.canIntensify !== true) return null
  }

  return {
    actionType,
    targetDate,
    suggestedRestUntil: null,
    restReason: null,
    rationale,
    userApprovalPrompt
  }
}

/**
 * G8: 휴식 프리셋은 **미래의 오늘+28일 이내**만 통과한다. 과거·오늘·형식 오류·상한 초과는 null 로 떨궈
 * 시트의 기존 기본값이 뜨게 한다(SSOT §80 "기간은 사용자가 정한다" — 프리셋은 앵커라서 보수적으로 다룬다).
 */
function normalizeRestPreset(value: unknown, today: string): string | null {
  const text = readText(value, 10)
  if (!DATE_PATTERN.test(text) || !DATE_PATTERN.test(today)) return null
  const days = daysBetween(today, text)
  if (days === null || days <= 0 || days > REST_PRESET_MAX_DAYS) return null
  return text
}

function daysBetween(from: string, to: string): number | null {
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null
  return Math.round((toMs - fromMs) / 86400000)
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

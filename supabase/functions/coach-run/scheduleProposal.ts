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

/**
 * `ease_session` 이 **무엇을 깎는지**(#703). 축을 밝히지 않으면 의도 보존을 판정할 수 없다.
 *
 * SSOT §세션 변경 요청 — 의도 보존 관용 매트릭스. 저강도 dose 우선순위
 * (① 강도 → ② 시간 → ③ 거리 → ④ 페이스)를 뒤집은 것이라, **깎을 땐 아래에서 위로** 간다.
 */
export type CoachScheduleEaseAxis =
  /** 스트라이드 회수 감소·전량 생략. 신경근 자극이라 유산소 dose 가 아니다 → 1순위 관용 축. */
  | 'strides'
  /** 웜업/쿨다운 축소. Tempo·Race 에서 본세트에 **더하는** 부속이다(삭제 아닌 축소). */
  | 'warmup_cooldown'
  /** 페이스를 늦춘다. 저강도에서 페이스는 타깃이 아니라 결과다. */
  | 'pace'
  /** 거리를 줄인다. 저강도에서 거리는 ③ 보조 dose. */
  | 'distance'
  /** 시간(time-on-feet)을 줄인다. 저강도·LSD 의 dose 본체라 대개 훼손이다. */
  | 'duration'
  /** 강도를 낮춘다. 세션의 정체성이라 항상 훼손이다. */
  | 'intensity'

export type CoachScheduleProposal = {
  actionType: CoachScheduleActionType
  /** 세션 액션의 대상 날짜(YYYY-MM-DD). declare_rest 면 항상 null. */
  targetDate: string | null
  /** declare_rest 프리셋. 사용자가 발화에서 **명시한** 기간만 담긴다(발명 금지). 없으면 null. */
  suggestedRestUntil: string | null
  restReason: CoachScheduleRestReason | null
  /** ease_session 이 깎는 축(#703). 다른 액션이면 항상 null. */
  easeAxis: CoachScheduleEaseAxis | null
  rationale: string
  userApprovalPrompt: string
}

/** 세션 액션의 대상 후보. 웹이 보낸 upcomingSchedule 항목에서 게이트에 필요한 필드만 본다. */
export type ScheduleProposalTarget = {
  date: string
  /** 세션 타입(RunType 문자열). G10 관용 매트릭스 판정에 쓴다. 없으면 매트릭스를 못 보므로 보수 통과(아래 주석). */
  type?: string
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
  /**
   * 사용자 발화가 지목한 요일(0=일…6=토), 정확히 하나만 지목했을 때만. `extractSoleWeekday` 산출(#703 G11).
   * 2026-08-24 실측: "목요일 훈련 좀 그런데"에 직전 대화에 앵커링한 **화요일** 카드가 나갔다 —
   * G3 는 "실재하는 날짜냐"만 보므로 못 막았다. 지목 요일과 다른 날짜의 세션 액션은 떨군다.
   */
  mentionedWeekday?: number | null
}

const ACTION_TYPES: CoachScheduleActionType[] = [
  'declare_rest',
  'ease_session',
  'intensify_session',
  'reschedule_session',
  'skip_session'
]

const REST_REASONS: CoachScheduleRestReason[] = ['injury', 'weather', 'personal', 'other']

const EASE_AXES: CoachScheduleEaseAxis[] = ['strides', 'warmup_cooldown', 'pace', 'distance', 'duration', 'intensity']

/**
 * G10 — 의도 보존 관용 매트릭스(#703, SSOT §세션 변경 요청).
 *
 * 세션 타입별로 **깎아도 의도가 보존되는 축**만 나열한다. 여기 없는 축을 깎는 제안은 훼손이다 —
 * 제안을 떨구고, 지침이 모델에게 관용 축 대안을 말하게 한다("시간을 줄이면 롱런이 아니게 됩니다,
 * 대신 페이스를 늦추죠"). 상향 G7(canIntensify)과 대칭을 이루는 하향 게이트다.
 *
 * 키는 웹 RunType 문자열(src/entities/run/model.ts). 서버가 타입 union 을 미러하지 않고 문자열로 본다.
 */
const EASE_TOLERANCE_BY_TYPE: Record<string, CoachScheduleEaseAxis[]> = {
  // Easy 계열은 duration 도 관용이다(2026-08-24 라이브 QA 교정): 페이스가 고정이면 거리와 시간은
  // **같은 dose 손잡이**라, 거리 허용·시간 차단은 비일관이었다(실측: "훈련 좀 그런데"에 모델이
  // duration 을 골랐다가 게이트에 죽어 카드가 안 떴다). 시간이 세션의 본체인 건 LSD(발 위 시간)와
  // Tempo(역치 지속시간)뿐이다 — 거기서만 duration 을 훼손으로 막는다.
  Easy: ['pace', 'distance', 'duration'],
  Recovery: ['pace', 'distance', 'duration'],
  'Easy + Strides': ['strides', 'pace', 'distance', 'duration'],
  Tempo: ['warmup_cooldown', 'distance'],
  LSD: ['pace', 'distance'],
  'Steady Long': ['pace', 'distance'],
  Race: ['warmup_cooldown']
}

/**
 * 타입을 모를 때(구 클라이언트·Unknown) 허용하는 축 — 어떤 세션에서도 정체성(강도)이나
 * dose 본체(시간)는 아니라서 최악의 오판이 "조금 관대"에 그친다. duration·intensity 는 항상 막는다.
 */
const EASE_TOLERANCE_UNKNOWN: CoachScheduleEaseAxis[] = ['strides', 'warmup_cooldown', 'pace', 'distance']

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
/** 게이트 판정 결과 + 폐기 사유(#703 관측). 사유는 data_query_log 에 남아 "모델 미출력 vs 게이트 폐기"를 가른다. */
export type CoachScheduleProposalVerdict = {
  proposal: CoachScheduleProposal | null
  /** 폐기한 게이트 이름. 통과·미출력이면 null. */
  drop: string | null
}

export function normalizeCoachScheduleProposal(raw: unknown, gate: ScheduleProposalGate): CoachScheduleProposal | null {
  return evaluateCoachScheduleProposal(raw, gate).proposal
}

/**
 * normalize 와 같되 **왜 떨어졌는지**를 함께 돌려준다(#703 라이브 QA 에서 "카드 안 뜸"의 원인을
 * 원형 없이 구분할 수 없었다 — #642 는 임시 코드로 원형을 실어 진단했는데, 그걸 영구 관측으로 만든다).
 */
export function evaluateCoachScheduleProposal(raw: unknown, gate: ScheduleProposalGate): CoachScheduleProposalVerdict {
  // G2: 단일 객체만 — 배열로 여러 건을 밀어넣지 못한다(1 응답 1 제안).
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { proposal: null, drop: raw == null ? null : 'G2_not_object' }

  // G6: 빈 노트 자동 디브리핑에서는 제안하지 않는다. 사용자가 아무 말도 안 했는데 휴식/조정 카드가 뜨면 닦달이다.
  //     능동 넛지의 제도적 자리는 coachMoments 와 SSOT §39 주말 트리아지이지 디브리핑 리포트가 아니다.
  if (gate.responseMode === 'report') return { proposal: null, drop: 'G6_report_mode' }

  const value = raw as Record<string, unknown>

  // G1: 어휘 밖 액션은 없다. realign 류가 애초에 어휘에 없으므로 여기서 자동 차단된다.
  const actionType = ACTION_TYPES.find((type) => type === value.actionType)
  if (!actionType) return { proposal: null, drop: 'G1_unknown_action' }

  const rationale = readText(value.rationale, 500)
  const userApprovalPrompt = readText(value.userApprovalPrompt, 220)
  if (!rationale || !userApprovalPrompt) return { proposal: null, drop: 'missing_text' }

  if (actionType === 'declare_rest') {
    // G4: 이미 쉬는 중이면 재제안하지 않는다.
    if (gate.restActive) return { proposal: null, drop: 'G4_rest_active' }
    const restReason = REST_REASONS.find((reason) => reason === value.restReason) ?? 'other'
    // G9: 활성 부상 중의 부상성 휴식 제안은 떨군다 — 부상 휴식은 부상 관리가 이미 소유한다(위 injuryActive 주석).
    //     부상과 무관함이 명시된 사유(개인 일정·날씨)만 통과한다. 'other'는 부상 대화에서 나온 애매한
    //     휴식 발화일 가능성이 높아 부상 쪽으로 보수 처리한다.
    if (gate.injuryActive && (restReason === 'injury' || restReason === 'other')) return { proposal: null, drop: 'G9_injury_owns_rest' }
    return {
      proposal: {
        actionType,
        targetDate: null,
        suggestedRestUntil: normalizeRestPreset(value.suggestedRestUntil, gate.today),
        restReason,
        easeAxis: null,
        rationale,
        userApprovalPrompt
      },
      drop: null
    }
  }

  // G3: 세션 액션의 대상은 웹이 보낸 실제 예정 세션이어야 한다. 날짜를 지어내면 떨군다.
  const targetDate = readText(value.targetDate, 10)
  if (!DATE_PATTERN.test(targetDate)) return { proposal: null, drop: 'G3_bad_date' }
  const target = gate.upcomingSchedule?.find((session) => session.date === targetDate)
  if (!target) return { proposal: null, drop: 'G3_date_not_in_schedule' }

  // G11: 사용자가 요일을 하나 지목했으면 카드도 그 요일이어야 한다(#703). 스레드 앵커링으로
  // 다른 날 카드가 나가면, 사용자는 자기 질문과 무관한 조정을 승인하라는 요구를 받는다.
  if (gate.mentionedWeekday != null) {
    const targetWeekday = new Date(`${targetDate}T00:00:00Z`).getUTCDay()
    if (Number.isFinite(targetWeekday) && targetWeekday !== gate.mentionedWeekday) {
      return { proposal: null, drop: 'G11_weekday_mismatch' }
    }
  }

  if (actionType === 'intensify_session') {
    // G5: redFlag/고통증이면 상향하지 않는다 — 부상 KB 게이트가 처방보다 우선.
    if (gate.injuryBlocksIntensify) return { proposal: null, drop: 'G5_injury_blocks' }
    // G7: 상향은 품질 게이트를 통과했을 때만. 판정은 웹 소유(canIntensify), 없으면 부적격.
    if (target.canIntensify !== true) return { proposal: null, drop: 'G7_not_eligible' }
  }

  let easeAxis: CoachScheduleEaseAxis | null = null
  if (actionType === 'ease_session') {
    // G10: 하향은 의도를 보존하는 축에서만(#703). 상향 G7 과 대칭 — 하향 무게이트면 요청→제안이
    // 직결되어 반복 하향이 목표 특이성을 갉아먹는다(§루틴 유지 기준 붕괴 경로).
    easeAxis = EASE_AXES.find((axis) => axis === value.easeAxis) ?? null
    // 축 미표기는 떨군다 — 무엇을 깎는지 모르는 조정 카드는 판정 불가이고, 사용자에게도 불투명하다.
    if (!easeAxis) return { proposal: null, drop: 'G10_axis_missing' }
    const tolerated = EASE_TOLERANCE_BY_TYPE[target.type ?? ''] ?? EASE_TOLERANCE_UNKNOWN
    if (!tolerated.includes(easeAxis)) return { proposal: null, drop: 'G10_axis_violates_intent' }
  }

  return {
    proposal: {
      actionType,
      targetDate,
      suggestedRestUntil: null,
      restReason: null,
      easeAxis,
      rationale,
      userApprovalPrompt
    },
    drop: null
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

const WEEKDAY_BY_CHAR: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

/**
 * 발화가 지목한 요일 — **정확히 하나일 때만** 돌려준다(G11 입력).
 * "화요일 말고 목요일로"처럼 둘 이상이면 null(재배치 발화라 요일 강제가 오히려 틀린다).
 * `X요일` 완전형만 받는다 — 한 글자(화·토)는 아무 데나 걸린다(#643 교훈).
 */
export function extractSoleWeekday(note: string): number | null {
  const matches = [...note.matchAll(/([월화수목금토일])요일/g)].map((m) => WEEKDAY_BY_CHAR[m[1]])
  const unique = [...new Set(matches)]
  return unique.length === 1 ? unique[0] : null
}

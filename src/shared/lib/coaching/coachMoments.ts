/**
 * 코치 모먼트 엔진 (#382, 북극성 [[coach-proactive-communication-vision]]).
 *
 * 앱의 핵심 가치 = 앱↔코치의 잦은 소통. 흩어진 코칭 카드 대신, 도메인별 "유의미한 순간" 감지기가
 * 각각 타이밍 잡힌 코치 메시지/질문을 만들고, 엔진이 **우선순위로 정리**해 적시에 노출한다.
 *
 * 순수 로직 — 컨텍스트(런·부하·부상 등)를 받아 CoachMoment[] 를 반환한다. 감지기는 여기 등록한다.
 * 관심 표현 → 의도 질문(options) → 분기 피드백(option.response)을 한 틀로 낸다.
 */

import type { RunLog } from '@/entities/run/model'
import type { RestReason, TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { analyzeExtraRunTrend, buildExtraRunInquiry } from '@/shared/lib/coaching/extraRunTrend'
import { isRunningLoadGroup, PAIN_GROUP_LABEL, type PainGroup } from '@/features/post-run-interview/buildInterviewRunPatch'

export type CoachMomentKind = 'injury' | 'load-spike' | 'deviation' | 'pain-followup' | 'extra-run' | 'goal-progress' | 'goal-feasibility' | 'time-trial' | 'weekend-triage' | 'double-suggest' | 'rest-support' | 'rest-return'

/** 모먼트가 제안하는 행동(전용 시트 열기 등). 트레이니 확인 후 실행. */
export type CoachMomentAction = {
  label: string
  kind: 'open-injury-screening' | 'open-weekend-triage' | 'open-doubles-add'
}
export type CoachMomentSentiment = 'positive' | 'neutral' | 'caution'

/** 의도 질문의 선택지 — 고르면 분기 피드백(response)을 보여준다. */
export type CoachMomentOption = {
  label: string
  sentiment: CoachMomentSentiment
  response: string
}

export type CoachMoment = {
  /** 안정 키(dedupe·dismiss·cooldown용). */
  key: string
  kind: CoachMomentKind
  /** 높을수록 시급. 동시에 여러 개면 상위가 먼저 노출. */
  priority: number
  icon: string
  message: string
  /** 있으면 의도 질문(관심 표현 후 트레이니가 응답). 없으면 단순 고지. */
  options?: CoachMomentOption[]
  /** 있으면 제안 행동(전용 시트 열기 등). 트레이니 확인 시 실행. */
  action?: CoachMomentAction
}

/** painNote(거친 그룹 라벨 포함)에서 부위 그룹을 역분류. */
function painGroupFromNote(painNote: string | null | undefined): PainGroup | null {
  if (!painNote) return null
  if (painNote.includes(PAIN_GROUP_LABEL.foot)) return 'foot'
  if (painNote.includes(PAIN_GROUP_LABEL.lower)) return 'lower'
  if (painNote.includes(PAIN_GROUP_LABEL.upper)) return 'upper'
  return null
}

const PAIN_FOLLOWUP_WINDOW_DAYS = 3

export type CoachMomentContext = {
  runs: RunLog[]
  attributedRunIds: Set<string>
  chronic: ChronicLoadTrend | null
  injury: TrainingInjuryItem | null
  today: Date
  /** 실제 주기화 스케줄이 존재하는가. 없으면 "추가 런" 개념이 성립 안 함(비교할 계획 없음). */
  scheduleExists?: boolean
  /** 플랜 시작일(YYYY-MM-DD). 이전 런은 플랜 없던 시절이라 추가런으로 안 셈. */
  scheduleStartDate?: string | null
  /** 누적 이탈(놓친 세션) — 있으면 코치가 일정 재정렬을 알린다. */
  deviation?: { shouldRealign: boolean; reason: string; missedCount: number } | null
  /** 주말 트리아지(주 마감 임박+백로그 초과) — 살릴 키 세션 라벨·놓아줄 개수. weekEndTriage 결과 주입. */
  weekendTriage?: { saveLabel: string; releaseCount: number } | null
  /** 목표 준비도 — '충분'이면 코치가 격려(긍정 소통). */
  goalProgress?: { readinessScore: number; readinessLevel: '충분' | '보통' | '부족'; dDayText: string } | null
  /** 목표 실현가능성(#395) — 현재 체력 대비 목표가 무리면 솔직히 경고+대안(message). assessGoalFeasibility 결과 주입. */
  goalFeasibility?: { feasible: boolean; message: string | null } | null
  /** 최근 한계 시험(TT) 결과(#411) — VDOT·등급 갱신 계기. 측정→승급 연결 메시지. daysAgo 작을 때만 노출. */
  timeTrialResult?: { daysAgo: number; nextClassLabel: string | null; gatePercent: number | null; eligible: boolean } | null
  /**
   * 같은 날 더블(#455) 자동제안 — 현재 주 '열린 장부' 따라잡기. buildDoubleSuggestion 결과를 라벨만 주입.
   * 적격 미달·트리아지 오버플로 구간이면 caller 가 null 로 둔다(더블 비제안). 주말 트리아지의 자매 갈래.
   */
  doubleSuggestion?: { backlogLabel: string; amDayLabel: string } | null
  /**
   * 휴식 선언(#473, SSOT §휴식과 복귀) — deriveRestState 파생을 주입. 있으면:
   *  - active 중엔 닦달성 모먼트를 전면 억제하고 "푹 쉬세요" 지원 모먼트만 노출(능동 휴식 ≠ missed).
   *  - 복귀 전후(showReturn)엔 "회복 후 정리" 모먼트(놓침 프레이밍 금지), 긴 휴식이면 목표 재점검 안내.
   * reason+injury.severity 로 "가벼운 회복주" 대안(1회) 제시 여부를 가른다.
   */
  rest?: {
    active: boolean
    reason: RestReason | null
    daysUntilReturn: number | null
    /** 선언 직후(~1일) — "가벼운 회복주" 대안을 1회 제시하는 창. */
    justDeclared: boolean
    /**
     * "가벼운 회복주" 대안을 제시해도 되는가(restWindow.shouldOfferRecoveryRun 결과를 caller 가 주입).
     * 도메인 게이트(이유·공존 부상 severity)는 entities 에 두고, shared 인 여기선 플래그만 받는다(#397 경계).
     */
    offerRecoveryRun: boolean
    /** 복귀일 전후(0~2일) — "회복 후 정리" 모먼트 노출. */
    showReturn: boolean
    /** >4주(28일) 휴식 — 복귀 시 목표 실현가능성 정직 재점검(SSOT 디트레이닝 4주 경계). */
    longLayoff: boolean
  } | null
}

type Detector = (ctx: CoachMomentContext) => CoachMoment | null

function detectInjury(ctx: CoachMomentContext): CoachMoment | null {
  const injury = ctx.injury
  if (!injury || (injury.status !== 'active' && injury.status !== 'monitoring')) return null
  const sev = injury.severity ?? 0
  if (sev < 3) return null
  const area = injury.area || '관리 부위'
  return {
    key: 'injury',
    kind: 'injury',
    priority: 90,
    icon: '🩹',
    message: `${area} 통증 ${sev}/5 신호가 커요. 강한 세션은 미루고 회복·재활을 먼저 챙겨요. 통증이 가라앉으면 알려주세요.`
  }
}

function detectLoadSpike(ctx: CoachMomentContext): CoachMoment | null {
  const c = ctx.chronic
  if (!c || c.status !== 'spike') return null
  return {
    key: 'load-spike',
    kind: 'load-spike',
    priority: 70,
    icon: '⚠️',
    message: `최근 30일 누적이 이전 대비 ${c.increasePct ?? ''}% 급증했어요. 부상 전에 회복 주간을 한 번 넣는 게 안전해요.`
  }
}

function detectExtraRun(ctx: CoachMomentContext): CoachMoment | null {
  // 실제 스케줄이 없으면 "지정 외 추가 런" 개념이 성립 안 함(비교 대상 없음).
  if (!ctx.scheduleExists) return null
  const trend = analyzeExtraRunTrend(ctx.runs, ctx.attributedRunIds, ctx.today, ctx.scheduleStartDate ?? null)
  const inquiry = buildExtraRunInquiry(trend)
  if (!inquiry) return null
  return {
    key: 'extra-run',
    kind: 'extra-run',
    priority: 40,
    icon: '👀',
    message: inquiry.message,
    options: [
      {
        label: '컨디션이 좋아서',
        sentiment: 'positive',
        response: '좋은 신호예요! 지정 훈련이 쉽게 느껴진다면 브랜치 목표를 세우거나 주간에 1회 추가하는 걸 제안할게요 — 원하면 같이 설정해요.'
      },
      {
        label: '빠진 훈련 보충',
        sentiment: 'caution',
        response: '보충하려는 마음 이해해요. 다만 죄책감 훈련은 부상 위험이 있어요 — 빠진 건 일정 재정렬로 따라잡고 회복일은 지켜요.'
      },
      {
        label: '스트레스 해소',
        sentiment: 'neutral',
        response: '좋아요, 달리기가 도움이 된다니 다행이에요. 다만 회복일은 챙겨서 누적 피로를 관리해요.'
      },
      {
        label: '그냥 더 하고 싶어서',
        sentiment: 'caution',
        response: '열정 좋아요! 다만 계획 밖 볼륨이 쌓이면 부하·부상 관리가 필요해요. 더 하고 싶으면 플랜을 올리는 쪽이 안전해요.'
      }
    ]
  }
}

function detectDeviation(ctx: CoachMomentContext): CoachMoment | null {
  const d = ctx.deviation
  if (!d || !d.shouldRealign) return null
  return {
    key: 'deviation',
    kind: 'deviation',
    priority: 60,
    icon: '🧭',
    message: d.reason || `최근 ${d.missedCount}개를 놓쳐서, 목표일은 그대로 두고 오늘부터 일정을 다시 맞췄어요.`
  }
}

function detectGoalProgress(ctx: CoachMomentContext): CoachMoment | null {
  const g = ctx.goalProgress
  // 긍정 소통 전용 — 준비도가 '충분'할 때만 격려(낮을 땐 부상/부하 감지기가 담당).
  if (!g || g.readinessLevel !== '충분') return null
  return {
    key: 'goal-progress',
    kind: 'goal-progress',
    priority: 30,
    icon: '🎉',
    message: `목표 준비도 ${g.readinessScore}% — 충분해요! 지금 흐름이 좋아요${g.dDayText ? ` (${g.dDayText})` : ''}. 이대로 가면서 다음 단계 상향도 검토해볼 만해요.`
  }
}

function detectPainFollowup(ctx: CoachMomentContext): CoachMoment | null {
  // 이미 관리 중인 활성 부상이 있으면 그쪽(부상 감지기/전용 체크인)이 담당.
  if (ctx.injury && (ctx.injury.status === 'active' || ctx.injury.status === 'monitoring')) return null
  const todayMs = new Date(ctx.today).setHours(0, 0, 0, 0)
  const recent = ctx.runs.filter((r) => {
    const d = new Date(`${r.date}T00:00:00`).getTime()
    return (todayMs - d) / (24 * 60 * 60 * 1000) <= PAIN_FOLLOWUP_WINDOW_DAYS && (todayMs - d) >= 0
  })
  const loadPain = recent.find((r) => isRunningLoadGroup(painGroupFromNote(r.painNote)))
  if (!loadPain) return null
  const group = painGroupFromNote(loadPain.painNote)
  const label = group ? PAIN_GROUP_LABEL[group] : ''
  return {
    key: 'pain-followup',
    kind: 'pain-followup',
    priority: 65,
    icon: '🩹',
    message: `최근 런에 ${label} 통증이 있었어요. 러닝에 직접 영향 주는 부위라, 부상으로 등록하면 강도·타입을 거기 맞춰 조정할게요. 지금 짧게 체크인할까요?`,
    action: { label: '부상 체크인', kind: 'open-injury-screening' }
  }
}

function detectGoalFeasibility(ctx: CoachMomentContext): CoachMoment | null {
  const f = ctx.goalFeasibility
  if (!f || f.feasible || !f.message) return null
  return {
    key: 'goal-feasibility',
    kind: 'goal-feasibility',
    priority: 55,
    icon: '🎯',
    message: f.message
  }
}

function detectTimeTrialResult(ctx: CoachMomentContext): CoachMoment | null {
  const tt = ctx.timeTrialResult
  if (!tt || tt.daysAgo > 3) return null
  const grade =
    tt.nextClassLabel === null
      ? ''
      : tt.eligible
        ? ` ${tt.nextClassLabel} 승급 도전 자격을 충족했어요 — 한계 도전으로 완주하면 승급!`
        : ` ${tt.nextClassLabel} 승급까지 ${tt.gatePercent ?? 0}%.`
  return {
    key: 'time-trial',
    kind: 'time-trial',
    priority: 58,
    icon: '🏁',
    message: `한계 시험 완료! 기록이 반영돼 현재 체력(VDOT)·페이스가 갱신됐어요.${grade}`
  }
}

function detectWeekendTriage(ctx: CoachMomentContext): CoachMoment | null {
  const t = ctx.weekendTriage
  if (!t) return null
  return {
    key: 'weekend-triage',
    kind: 'weekend-triage',
    priority: 55,
    icon: '🧭',
    message: `주말이 빠듯해요. 다 하려 하지 말고 이번 주 핵심(${t.saveLabel}) 하나만 살릴까요? 나머지 ${t.releaseCount}개는 죄책감 없이 놓아줘도 괜찮아요 — 회복도 훈련의 일부예요.`,
    action: { label: '이번 주 정리하기', kind: 'open-weekend-triage' }
  }
}

/**
 * 같은 날 더블(#455) 자동제안 — 적격 러너의 따라잡기. 주말 트리아지(놓아주기)의 직전 구간:
 * "더블로 살릴 수 있을 때" 오후 이지를 붙이자고 부드럽게 제안한다. 닦달 금지(거절 가능).
 * caller(buildDoubleSuggestion)가 적격·백로그·간격을 다 판단해 신호를 주입했을 때만 노출.
 */
function detectDoubleSuggestion(ctx: CoachMomentContext): CoachMoment | null {
  const d = ctx.doubleSuggestion
  if (!d) return null
  return {
    key: 'double-suggest',
    kind: 'double-suggest',
    priority: 54, // 주말 트리아지(55) 바로 아래 — 둘은 조건상 상호배타(따라잡기 가능 vs 오버플로).
    icon: '🔁',
    message: `이번 주가 빠듯한데, ${d.backlogLabel}을 ${d.amDayLabel} 뒤 오후 이지로 붙여 따라잡을 수 있어요(오전 강도 + 오후 이지). 둘째는 회복이 목적이라 천천히 — 두 세션은 최소 5시간(권장 7~9시간) 벌려요.`,
    action: { label: '오후 이지 더블 추가', kind: 'open-doubles-add' }
  }
}

/**
 * 휴식 중(#473) "푹 쉬세요" 지원 모먼트 — 닦달 대신 응원. 부하성 경증 부상·통제 가능 휴식이고
 * 선언 직후면 "가벼운 회복주" 대안을 1회 제시하되 완전 휴식 선택을 존중한다(SSOT §휴식과 복귀).
 */
function detectRestSupport(ctx: CoachMomentContext): CoachMoment | null {
  const rest = ctx.rest
  if (!rest?.active) return null
  const dLeft = rest.daysUntilReturn && rest.daysUntilReturn > 0 ? ` 복귀까지 D-${rest.daysUntilReturn}.` : ''
  const base = `지금은 회복 시간이에요. 일정은 정리해뒀으니 마음 편히 푹 쉬어요.${dLeft}`
  if (rest.justDeclared && rest.offerRecoveryRun) {
    // 부상성 휴식 복귀의 정본은 연속주가 아니라 walk-run 점진+통증 정지(SSOT §3-B). 통제 휴식(날씨·일정)은 가벼운 연속 회복주.
    const acceptResponse =
      rest.reason === 'injury'
        ? '좋아요. 뛰기 전 걷기로 천천히 풀고, 통증 없이 편하면 걷기-뛰기를 짧게 번갈아 봐요. 통증이 날카롭거나 다음날 더 아프면 그날은 거기서 멈춰요. 나머지 기간은 그대로 쉬어도 괜찮아요.'
        : '좋아요. 20~30분 천천히, 대화 가능한 페이스로만 — 통증이나 무리가 느껴지면 바로 멈춰요. 나머지 기간은 그대로 쉬어도 괜찮아요.'
    return {
      key: 'rest-support',
      kind: 'rest-support',
      priority: 75,
      icon: '💤',
      message: `${base} 완전히 멈추기보다 가벼운 회복주가 체력 유지엔 더 나아요 — 어떻게 할까요?`,
      options: [
        { label: '가벼운 회복주 해볼게요', sentiment: 'positive', response: acceptResponse },
        {
          label: '완전히 쉴래요',
          sentiment: 'neutral',
          response: '그럼요, 완전한 휴식도 충분히 좋은 선택이에요. 돌아오면 가볍게 다시 시작해요.'
        }
      ]
    }
  }
  return { key: 'rest-support', kind: 'rest-support', priority: 75, icon: '💤', message: base }
}

/**
 * 복귀 전후(#473) "회복 후 정리" 모먼트 — "놓침"이 아니라 회복 마무리로 프레이밍한다.
 * 긴 휴식(>4주)이면 디트레이닝으로 목표 실현가능성을 정직하게 재점검하자고 덧붙인다(SSOT §휴식과 복귀·§시작점 앵커링).
 */
function detectReturnDay(ctx: CoachMomentContext): CoachMoment | null {
  const rest = ctx.rest
  if (!rest?.showReturn) return null
  const base = '돌아온 걸 환영해요! 쉬는 동안 일정은 정리해뒀어요. 오늘은 가볍게(Easy) 다시 시작해요 — 첫 세션은 짧게, 몸 상태를 보면서요.'
  return {
    key: 'rest-return',
    kind: 'rest-return',
    priority: 72,
    icon: '🌱',
    message: rest.longLayoff
      ? `${base} 4주 넘게 쉬어서 체력이 조금 빠졌을 수 있어요 — 목표일까지 무리 없는지 같이 점검해봐요.`
      : base
  }
}

const DETECTORS: Detector[] = [
  detectInjury,
  detectLoadSpike,
  detectPainFollowup,
  detectDeviation,
  detectWeekendTriage,
  detectDoubleSuggestion,
  detectTimeTrialResult,
  detectGoalFeasibility,
  detectExtraRun,
  detectGoalProgress,
  detectRestSupport,
  detectReturnDay
]

/**
 * 등록된 감지기를 모두 돌려 유의미한 순간을 모으고, 우선순위 내림차순으로 정렬해 반환한다.
 * dismissedKeys 에 있는 키는 제외(이미 응답/닫음).
 */
export function collectCoachMoments(ctx: CoachMomentContext, dismissedKeys: Set<string> = new Set()): CoachMoment[] {
  let moments = DETECTORS.map((d) => d(ctx)).filter(
    (m): m is CoachMoment => Boolean(m) && !dismissedKeys.has((m as CoachMoment).key)
  )
  // 휴식 중(#473)엔 닦달성 모먼트(이탈·트리아지·추가런·더블·부하·목표경고 등)를 억제한다(SSOT §휴식과 복귀 —
  // 능동 휴식은 missed가 아니다). 단, 부상 안전 모먼트(injury·pain-followup)는 닦달이 아니라 안전 신호이므로
  // 억제하지 않는다(SSOT는 missed/triage/realign 발동만 금지; 통증·redFlag 부상은 KB 게이트 우선).
  if (ctx.rest?.active) {
    moments = moments.filter(
      (m) => m.kind === 'rest-support' || m.kind === 'injury' || m.kind === 'pain-followup'
    )
  }
  return moments.sort((a, b) => b.priority - a.priority)
}

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

export type CoachMomentKind = 'injury' | 'load-spike' | 'deviation' | 'pain-followup' | 'pain-probe' | 'injury-escalation' | 'extra-run' | 'goal-progress' | 'goal-feasibility' | 'time-trial' | 'weekend-triage' | 'double-suggest' | 'rest-support' | 'rest-return'

/** 모먼트가 제안하는 행동(전용 시트 열기 등). 트레이니 확인 후 실행. */
export type CoachMomentAction = {
  label: string
  kind: 'open-injury-screening' | 'open-weekend-triage' | 'open-doubles-add'
}
export type CoachMomentSentiment = 'positive' | 'neutral' | 'caution'

/**
 * 부상 감별 grill 프로브 답변(§5 Phase C)의 영속 페이로드(plain). 페이지가 고른 답을
 * injuryItem.probeAnswers[probeId]=value 로 저장하고, subtype 가 있으면 subtypeResolved 에 적재한다.
 * ⚠ shared 레이어라 entities(injuryKnowledge) 타입을 import 하지 않는다(경계 래칫 #397) — 페이지가 plain 으로 채운다.
 */
export type CoachMomentProbeSelection = {
  injuryItemId: string
  /** 프로브 id(부위 base) — probeAnswers 키. */
  probeId: string
  /** 고른 옵션의 안정 슬러그 — probeAnswers 값. */
  value: string
  /** 해소된 아형 id(있으면 subtypeResolved 에 적재). */
  subtype?: string
}

/** 의도 질문의 선택지 — 고르면 분기 피드백(response)을 보여준다. probe 가 있으면 고른 답을 영속(grill). */
export type CoachMomentOption = {
  label: string
  sentiment: CoachMomentSentiment
  response: string
  /** 있으면 이 옵션 선택을 부상 항목에 영속한다(§5 Phase C grill). 카드가 select 이벤트로 올린다. */
  probe?: CoachMomentProbeSelection
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

/** 모먼트 발동 트리거 — 가장 최근 통증 런이 이 일수 안이어야 신선한 신호로 본다. */
const PAIN_FOLLOWUP_WINDOW_DAYS = 3
/**
 * RRI 운영 정의(달리기를 ≥1주 또는 ≥3연속 세션 제한 = "진짜 부상", 단순 1회 통증과 구별).
 * 근거: 합의 정의 [Fokkema 2019·Peterson 2022·Buist] — rri-risk-factors-evidence.md §3.4, injury-knowledge §6.
 */
const PERSISTENT_PAIN_MIN_SESSIONS = 3
const PERSISTENT_PAIN_MIN_SPAN_DAYS = 7
/** 통증 스트릭 평가 상한 — 이보다 오래된 통증 런은 현재 상태가 아니므로 스트릭에서 끊는다(스테일 차단). */
const PAIN_STREAK_LOOKBACK_DAYS = 30
/**
 * 장기 부상 escalation 임계 — 통증/부상 지속 >10주(70일)면 자가관리보다 전문가 평가 권유(3.5).
 * 근거: 부상 회복 중앙값 ~8주, >10주=poor 예후 ◐ — rri-risk-factors-evidence.md §3.5. redFlag 게이트 우선.
 */
const LONG_INJURY_ESCALATION_DAYS = 70

/** 날짜만(YYYY-MM-DD)은 로컬 자정으로, ISO 타임스탬프는 그대로 파싱(12개월/주차 경계 off-by-one 방지, model.ts 관행). */
function parseLocalDateMs(value: string | null | undefined): number | null {
  if (!value) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const t = new Date(normalized).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * 최근 러닝-부하 통증의 "지속성"을 평가한다 — 단순 1회 통증(single) vs RRI 운영 정의를 충족하는
 * 관리형 부상 패턴(persistent)을 구별한다(3.4). 가장 최근 통증 런부터 통증 없는 런을 만날 때까지
 * 연속 통증 세션을 세고(회복 신호면 끊김), ≥3연속 세션 또는 ≥7일 지속이면 persistent로 본다.
 */
type RecentPainAssessment = {
  /** 트리거 창 안의 가장 최근 러닝-부하 통증 런. 없으면 모먼트 미발동. */
  triggerRun: RunLog | null
  /** 가장 최근 통증 런부터 이어진 연속 통증 세션 수. */
  streakSessions: number
  /** 연속 통증 스트릭 첫 통증 런부터 가장 최근 통증 런까지 일수(지속 기간). */
  spanDays: number
  /** RRI 운영 정의(≥3연속세션 또는 ≥7일 지속) 충족 = 관리가 필요한 "진짜 부상" 패턴. */
  persistent: boolean
  /** 가장 최근 통증 부위 그룹(메시지 라벨용). */
  group: PainGroup | null
}

function assessRecentPain(runs: RunLog[], today: Date): RecentPainAssessment {
  const empty: RecentPainAssessment = { triggerRun: null, streakSessions: 0, spanDays: 0, persistent: false, group: null }
  const todayMs = new Date(today).setHours(0, 0, 0, 0)
  const dayMs = 24 * 60 * 60 * 1000
  const sorted = runs
    .map((r) => ({ r, ms: parseLocalDateMs(r.date) }))
    .filter((x): x is { r: RunLog; ms: number } => x.ms !== null && x.ms <= todayMs)
    .sort((a, b) => b.ms - a.ms)
  if (!sorted.length) return empty
  const newest = sorted[0]
  const newestGroup = painGroupFromNote(newest.r.painNote)
  // 트리거: 가장 최근 런이 트리거 창(3일) 안이고 러닝-부하 통증이어야 한다.
  if ((todayMs - newest.ms) / dayMs > PAIN_FOLLOWUP_WINDOW_DAYS || !isRunningLoadGroup(newestGroup)) return empty
  let streak = 0
  let oldestPainMs = newest.ms
  for (const { r, ms } of sorted) {
    if ((todayMs - ms) / dayMs > PAIN_STREAK_LOOKBACK_DAYS) break // 스테일 통증 데이터는 현재 스트릭에서 제외
    if (isRunningLoadGroup(painGroupFromNote(r.painNote))) {
      streak += 1
      oldestPainMs = ms
    } else {
      break // 통증 없는 러닝 세션 = 회복 신호 → 스트릭 종료
    }
  }
  const spanDays = Math.round((newest.ms - oldestPainMs) / dayMs)
  const persistent = streak >= PERSISTENT_PAIN_MIN_SESSIONS || spanDays >= PERSISTENT_PAIN_MIN_SPAN_DAYS
  return { triggerRun: newest.r, streakSessions: streak, spanDays, persistent, group: newestGroup }
}

export type CoachMomentContext = {
  runs: RunLog[]
  attributedRunIds: Set<string>
  chronic: ChronicLoadTrend | null
  injury: TrainingInjuryItem | null
  today: Date
  /**
   * 부상 감별 grill 프로브(§5 Phase C) — "왜 아픈지"를 좁히는 1문항. 페이지(DashboardPage)가
   * entities(selectNextProbe)로 미리 계산해 plain 으로 주입한다(shared 가 entities 를 import 하지 않게 — #397).
   * 활성 부상 + 미답 프로브가 있을 때만 채워지고, "한 세션 1문항"은 페이지가 스냅샷으로 가둔다.
   */
  painProbe?: {
    injuryItemId: string
    probeId: string
    question: string
    options: Array<{ label: string; response: string; sentiment: CoachMomentSentiment; value: string; subtype?: string }>
  } | null
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
    /**
     * 오늘 실제로 배치된 활성 세션의 타입 라벨(없으면 null = 오늘은 휴식날). 복귀 카드가 "오늘 Easy"를
     * 무조건 단정하지 않고 실제 스케줄에 종속되게 한다 — 복귀 처리는 설정된 run-day 에만 세션을 깔아서
     * 오늘이 run-day 가 아니면 오늘은 진짜 쉬는 날이다(데이-스트립·브리핑과 단일 진실로 정렬, #473 후속 버그).
     */
    todaySessionLabel?: string | null
    /**
     * 오늘 세션이 없을 때, 복귀 후 첫 활성 세션의 날짜(요일 포함)·타입 라벨. 카드가 "첫 복귀 세션은 {날짜}
     * 가볍게({타입})"처럼 정직하게 안내하도록 caller(스케줄 보유 페이지)가 주입한다. 없으면 날짜를 생략한다.
     */
    nextReturnSession?: { dateLabel: string; typeLabel: string } | null
  } | null
}

type Detector = (ctx: CoachMomentContext) => CoachMoment | null

// (detectInjury 제거) 정적 부상 고지는 대시보드 '부상 기준' 카드·'전략적 휴식' 카드·목표 보호 노트와
// 항상 중복이라 상단 모먼트로 다시 띄우지 않는다. 실행형 신호는 detectPainFollowup(부상 등록 체크인)이 담당.

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
  // 이미 관리 중인 활성 부상이 있으면 그쪽(부상 감지기/전용 체크인·장기부상 escalation)이 담당.
  if (ctx.injury && (ctx.injury.status === 'active' || ctx.injury.status === 'monitoring')) return null
  const pain = assessRecentPain(ctx.runs, ctx.today)
  if (!pain.triggerRun) return null
  const label = pain.group ? PAIN_GROUP_LABEL[pain.group] : ''
  if (pain.persistent) {
    // RRI 운영 정의(달리기를 ≥1주 또는 ≥3연속 세션 제한) 충족 → 단순 뻐근함이 아니라 관리가 필요한 신호(3.4).
    // 부상확률(%) 단정 금지·진단 아님([[coach-not-data-referee]]) — 등록+보수화를 권유하되 강권하지 않는다.
    const persistDesc =
      pain.streakSessions >= PERSISTENT_PAIN_MIN_SESSIONS
        ? `연속 ${pain.streakSessions}회 러닝에서`
        : `${pain.spanDays}일째`
    return {
      key: 'pain-followup',
      kind: 'pain-followup',
      priority: 78,
      icon: '🩹',
      message: `${persistDesc} ${label} 통증이 이어지고 있어요. 일시적인 뻐근함을 넘어 관리가 필요한 신호일 수 있어요. 부상으로 등록하고, 가라앉을 때까지 강도를 낮추거나 잠깐 회복 기간을 갖는 걸 권해요. (이 안내는 진단이 아니라 러닝 코칭 보조예요.) 지금 짧게 체크인할까요?`,
      action: { label: '부상 체크인', kind: 'open-injury-screening' }
    }
  }
  return {
    key: 'pain-followup',
    kind: 'pain-followup',
    priority: 65,
    icon: '🩹',
    message: `최근 런에 ${label} 통증이 있었어요. 러닝에 직접 영향 주는 부위라, 부상으로 등록하면 강도·타입을 거기 맞춰 조정할게요. 지금 짧게 체크인할까요?`,
    action: { label: '부상 체크인', kind: 'open-injury-screening' }
  }
}

/**
 * 부상 감별 grill 프로브(§5 Phase C) — 활성 부상의 "왜 아픈지"를 좁히는 능동 1문항.
 * 페이지가 selectNextProbe 로 고른 미답 프로브를 ctx.painProbe 로 주입하면, 이를 의도 질문 모먼트로 띄운다.
 * 고른 답은 option.probe 로 영속(카드 select). 진단 아님·"가능성"으로만(문구는 KB §1 결정적 지문 기반).
 * priority 68 — 급성 안전(injury-escalation 80·persistent pain-followup 78)·부하 경고(load-spike 70) 아래, 그 외 위.
 */
function detectPainProbe(ctx: CoachMomentContext): CoachMoment | null {
  const p = ctx.painProbe
  if (!p || !p.options.length) return null
  return {
    key: `pain-probe:${p.probeId}`,
    kind: 'pain-probe',
    priority: 68,
    icon: '🔎',
    message: p.question,
    options: p.options.map((o) => ({
      label: o.label,
      sentiment: o.sentiment,
      response: o.response,
      probe: { injuryItemId: p.injuryItemId, probeId: p.probeId, value: o.value, subtype: o.subtype }
    }))
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
  // 진행 중 휴식의 단순 "회복 시간 · 복귀 D-N" 고지는 '💤 쉬는 중 · 복귀 D-N' 배너와 중복이라 모먼트로 안 띄운다.
  // (선언 시점의 가벼운 회복주 제안 1회만 위 분기에서 노출.)
  return null
}

/**
 * 복귀 전후(#473) "회복 후 정리" 모먼트 — "놓침"이 아니라 회복 마무리로 프레이밍한다.
 * 긴 휴식(>4주)이면 디트레이닝으로 목표 실현가능성을 정직하게 재점검하자고 덧붙인다(SSOT §휴식과 복귀·§시작점 앵커링).
 */
function detectReturnDay(ctx: CoachMomentContext): CoachMoment | null {
  const rest = ctx.rest
  if (!rest?.showReturn) return null
  // 복귀 카드 문구는 "오늘 실제 처방"에 종속된다. 복귀 처리는 설정된 run-day 에만 세션을 깔아서, 오늘이
  // run-day 가 아니면 오늘은 진짜 쉬는 날이고 첫 복귀 세션은 다음 run-day(예: 목 Easy)다. 데이-스트립("🌙 휴식")·
  // 브리핑(세션 없음)과 같은 진실(스케줄)에 정렬한다 — "오늘 Easy" 무조건 단정 금지(#473 후속 불일치 버그).
  const hasToday = Boolean(rest.todaySessionLabel)
  // 오늘 세션 있음(오늘이 run-day) → 종전처럼 "오늘은 가볍게 다시 시작". 세션 없음(휴식날) → 오늘 쉼을 지지하고
  // 첫 복귀 세션 날짜/타입을 명시한다("가볍게 풀거나" 같은 권유는 빼서 데이-스트립의 '전략적 휴식'과 톤 충돌 방지).
  const lead = hasToday
    ? `오늘은 가볍게(${rest.todaySessionLabel}) 다시 시작해요 — 첫 세션은 짧게, 몸 상태를 보면서요.`
    : rest.nextReturnSession
      ? `오늘은 쉬어가는 날이에요. 첫 복귀 세션은 ${rest.nextReturnSession.dateLabel} 가볍게(${rest.nextReturnSession.typeLabel})예요 — 짧게, 몸 상태를 보면서 시작해요.`
      : '오늘은 쉬어가는 날이에요. 첫 복귀 세션은 가볍게(Easy)부터 — 짧게, 몸 상태를 보면서 시작해요.'
  const base = `돌아온 걸 환영해요! 쉬는 동안 일정은 정리해뒀어요. ${lead}`
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

/**
 * 장기 부상 escalation(#473 후속, 3.5) — 활성/관리 부상이 >10주(70일) 이어지면
 * 자가관리보다 전문가(의사·물리치료사) 평가를 권유한다. onsetDate(임상 발병일) 우선,
 * 없으면 등록일(createdAt)로 관리 지속 기간을 보수적으로 추정한다.
 * redFlag 게이트가 항상 우선이며, 이 모먼트 자체가 "전문가로 연결" 톤이라 redFlag 철학과 정합한다.
 * 진단 아님·부상확률 단정 금지([[coach-not-data-referee]]). 사용자가 닫으면(dismiss) 더 닦달하지 않는다.
 */
function detectInjuryEscalation(ctx: CoachMomentContext): CoachMoment | null {
  const inj = ctx.injury
  if (!inj || (inj.status !== 'active' && inj.status !== 'monitoring')) return null
  let anchor = parseLocalDateMs(inj.onsetDate) ?? parseLocalDateMs(inj.createdAt)
  if (anchor === null) return null
  // §3.5 정의는 "연속(continuous) 지속 >10주"다. resolved 이력이 있는데 다시 active/monitoring이면 = 재발(re-flare)이고,
  // 현재 에피소드는 옛 최초 발병이 아니라 마지막 해소(resolvedAt) 이후에 다시 시작한 것이다. 그 경우 옛 onsetDate로
  // "20주째"처럼 과대평가하지 않도록 resolvedAt를 에피소드 시작 하한으로 쓴다(연속 부상은 resolvedAt가 없어 그대로 onset 유지 — 약화 없음).
  const resolvedMs = parseLocalDateMs(inj.resolvedAt)
  if (resolvedMs !== null && resolvedMs > anchor) anchor = resolvedMs
  const todayMs = new Date(ctx.today).setHours(0, 0, 0, 0)
  const days = Math.floor((todayMs - anchor) / (24 * 60 * 60 * 1000))
  if (days < LONG_INJURY_ESCALATION_DAYS) return null
  const weeks = Math.floor(days / 7)
  return {
    key: 'injury-escalation',
    kind: 'injury-escalation',
    priority: 80,
    icon: '🩺',
    message: `이 부상이 ${weeks}주째 이어지고 있어요. 보통 이쯤 길어지면 혼자 관리하기보다 전문가(의사·물리치료사) 평가를 받는 게 회복에 더 빨라요 — 한 번 진료를 받아보시길 권해요. (이 안내는 진단이 아니라 러닝 코칭 보조예요.)`
  }
}

const DETECTORS: Detector[] = [
  detectLoadSpike,
  detectInjuryEscalation,
  detectPainFollowup,
  detectPainProbe,
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
      (m) =>
        m.kind === 'rest-support' ||
        m.kind === 'injury' ||
        m.kind === 'pain-followup' ||
        m.kind === 'pain-probe' || // 부상 감별 1문항은 닦달이 아니라 "왜 아픈지" 이해 — 휴식 중에도 허용
        m.kind === 'injury-escalation' // 장기 미해결 부상 전문가 의뢰는 휴식 중에도 떠야 할 안전 신호
    )
  }
  return moments.sort((a, b) => b.priority - a.priority)
}

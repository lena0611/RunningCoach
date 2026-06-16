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
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { analyzeExtraRunTrend, buildExtraRunInquiry } from '@/shared/lib/coaching/extraRunTrend'

export type CoachMomentKind = 'injury' | 'load-spike' | 'extra-run'
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
}

export type CoachMomentContext = {
  runs: RunLog[]
  attributedRunIds: Set<string>
  chronic: ChronicLoadTrend | null
  injury: TrainingInjuryItem | null
  today: Date
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
  const trend = analyzeExtraRunTrend(ctx.runs, ctx.attributedRunIds, ctx.today)
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

const DETECTORS: Detector[] = [detectInjury, detectLoadSpike, detectExtraRun]

/**
 * 등록된 감지기를 모두 돌려 유의미한 순간을 모으고, 우선순위 내림차순으로 정렬해 반환한다.
 * dismissedKeys 에 있는 키는 제외(이미 응답/닫음).
 */
export function collectCoachMoments(ctx: CoachMomentContext, dismissedKeys: Set<string> = new Set()): CoachMoment[] {
  return DETECTORS.map((d) => d(ctx))
    .filter((m): m is CoachMoment => Boolean(m) && !dismissedKeys.has((m as CoachMoment).key))
    .sort((a, b) => b.priority - a.priority)
}

/**
 * Pre-Run 의도 카드(#309)용 순수 빌더.
 * 기존 결정론 신호(추천 세션·심박모델·준비도 약점·페이스)를 조합해 SessionIntentDraft 를 만든다.
 * LLM 호출 없음 — 대시보드 진입마다 즉시·무료·테스트 가능.
 */

import type { RunType } from '@/entities/run/model'
import type { SessionIntentDraft, SessionIntentTargets } from '@/entities/session-intent/model'
import type { NextSessionRecommendation } from '@/shared/lib/runStats'

export type BuildSessionIntentArgs = {
  recommendation: NextSessionRecommendation
  heartRateModel: { easyCeilingBpm: number | null; tempoCeilingBpm: number | null; recoveryCeilingBpm: number | null }
  /** getRaceProjection 의 가장 약한 factor label. 없으면 null. */
  weakestFactorLabel: string | null
  activeGoalId: string | null
  /** 사용자가 "다른 훈련 제안받기"로 더 가벼운 세션을 요청할 때 강제 타입. */
  overrideType?: RunType
}

const QUALITY_HR_TYPES: RunType[] = ['Tempo', 'Race']
const RECOVERY_TYPES: RunType[] = ['Recovery']

/** 추천 제목 텍스트에서 RunType 을 추론한다(키워드 우선순위). */
export function parseRunTypeFromTitle(title: string): RunType {
  const t = title.toLowerCase()
  if (t.includes('recovery') || t.includes('회복')) return 'Recovery'
  if (t.includes('steady long')) return 'Steady Long'
  if (t.includes('lsd') || t.includes('long')) return 'LSD'
  if (t.includes('tempo') || t.includes('threshold')) return 'Tempo'
  if (t.includes('race')) return 'Race'
  if (t.includes('strides')) return 'Easy + Strides'
  return 'Easy'
}

/** "다른 훈련 제안받기": 현재 타입보다 한 단계 가벼운 세션. */
export function easierAlternative(type: RunType): RunType {
  switch (type) {
    case 'Tempo':
    case 'Race':
      return 'Easy + Strides'
    case 'Easy + Strides':
    case 'LSD':
    case 'Steady Long':
      return 'Easy'
    default:
      return 'Recovery'
  }
}

function ceilingFor(type: RunType, hr: BuildSessionIntentArgs['heartRateModel']): number | null {
  if (QUALITY_HR_TYPES.includes(type)) return hr.tempoCeilingBpm
  if (RECOVERY_TYPES.includes(type)) return hr.recoveryCeilingBpm
  return hr.easyCeilingBpm
}

function rpeRangeFor(type: RunType): [number, number] {
  switch (type) {
    case 'Recovery':
      return [1, 2]
    case 'Tempo':
      return [6, 7]
    case 'Race':
      return [8, 10]
    case 'Easy + Strides':
      return [3, 6]
    default:
      return [3, 5]
  }
}

function paceHoldFor(type: RunType): string {
  switch (type) {
    case 'LSD':
    case 'Steady Long':
      return '후반까지 일정한 페이스 유지'
    case 'Tempo':
    case 'Race':
      return '상한 심박 이내에서 리듬 유지'
    case 'Recovery':
      return '욕심내지 않고 천천히'
    default:
      return '대화 가능한 편안한 페이스'
  }
}

function buildWhy(args: BuildSessionIntentArgs, type: RunType): string {
  const { recommendation, weakestFactorLabel } = args
  if (recommendation.injuryAdjusted && recommendation.injuryNote) return recommendation.injuryNote
  if (type === 'Recovery') return '누적 피로를 풀고 다음 핵심 세션을 준비합니다.'
  if (weakestFactorLabel) return `${weakestFactorLabel}을(를) 보완하기 위한 세션입니다.`
  return recommendation.reason.split('. ')[0] || '꾸준한 유산소 기반을 유지합니다.'
}

export function buildSessionIntentDraft(args: BuildSessionIntentArgs): SessionIntentDraft {
  const { recommendation, heartRateModel, activeGoalId, overrideType } = args
  const sessionType = overrideType ?? parseRunTypeFromTitle(recommendation.title)

  const ceiling = ceilingFor(sessionType, heartRateModel)
  const hrRange: [number, number] | null = ceiling ? [Math.max(80, ceiling - 12), ceiling] : null
  const rpeRange = rpeRangeFor(sessionType)
  const paceHold = paceHoldFor(sessionType)

  const targets: SessionIntentTargets = {
    hrCeilingBpm: ceiling,
    hrRange,
    rpeRange,
    paceHold
  }

  const successCriteria: string[] = []
  if (hrRange) successCriteria.push(`평균심박 ${hrRange[0]}~${hrRange[1]}`)
  successCriteria.push(`RPE ${rpeRange[0]}~${rpeRange[1]}`)
  successCriteria.push(paceHold)

  const title = overrideType ? `${sessionType}` : recommendation.title

  return {
    goalId: activeGoalId,
    plannedDate: recommendation.plannedDate,
    sessionType,
    title,
    why: buildWhy(args, sessionType),
    targets,
    successCriteria,
    source: 'coach'
  }
}

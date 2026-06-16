/**
 * 전략적 휴식 가이던스 (#378). 휴식날도 훈련의 일부 — 회복·부상관리·다음 세션 준비.
 *
 * "아무것도 안 해도 되나?"에 답한다: 부하/부상 상태에 따라 완전 휴식 / 적극 회복 / 러닝 근력 /
 * 부상 재활을 결정론으로 안내. (근거: running-coaching-standards "회복은 훈련의 일부(World Athletics)",
 * 점진적 부하, deep-research[[coach-scheduling-research]] — 회복은 적응을 만드는 필수 요소)
 */

import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import type { EvidenceRef } from '@/shared/lib/coaching/sessionBriefing'

export type RestGuidance = {
  /** 왜 오늘 쉬는가(전략적 의미). */
  purpose: string
  /** 오늘 할 것(완전 휴식/적극 회복/근력/재활). */
  items: string[]
  evidence: EvidenceRef[]
}

/** 예정에 없던 추가 런(회복일에 뛴 경우 등) 평가. */
export type ExtraRunEvaluation = {
  headline: string
  note: string
  /** 회복을 건너뛴 비용이 큰지(부상·고부하·고강도) — true면 주의 톤. */
  caution: boolean
}

const LOW_INTENSITY_TYPES: ReadonlySet<string> = new Set(['Easy', 'Recovery', 'Easy + Strides'])

/**
 * 예정에 없던 추가 런(스케줄 세션에 귀속되지 않음 = 따라잡기 아님)을 코치 관점에서 평가한다.
 * 전략적 회복일을 건너뛴 비용을 부상·부하·강도로 판단해 인정/주의 톤을 결정한다.
 */
export function evaluateExtraRun(
  run: { type: string },
  injury: TrainingInjuryItem | null,
  chronic: ChronicLoadTrend | null
): ExtraRunEvaluation {
  const injuryActive = Boolean(injury && (injury.status === 'active' || injury.status === 'monitoring'))
  const loadHigh = Boolean(chronic && (chronic.status === 'spike' || chronic.status === 'rising'))
  const isLight = LOW_INTENSITY_TYPES.has(run.type)
  const headline = '🎁 예정에 없던 추가 런'

  if (injuryActive) {
    const area = injury!.area || '관리 부위'
    return {
      headline,
      note: `${area} 관리 중인데 회복일에 추가로 뛰었어요. 통증 신호를 꼭 확인하고, 무리였다면 다음 회복일은 지키세요.`,
      caution: true
    }
  }
  if (loadHigh || !isLight) {
    return {
      headline,
      note: '오늘은 전략적 회복일이었어요. 회복을 건너뛴 셈이라 누적 피로를 살피고, 다음 며칠은 강도를 낮추는 편이 안전해요.',
      caution: true
    }
  }
  return {
    headline,
    note: '가벼운 추가 런이라 큰 부담은 아니에요. 다만 회복일이 줄었으니 다음 회복은 꼭 챙기세요.',
    caution: false
  }
}

const REST_EVIDENCE: EvidenceRef = {
  method: '회복은 훈련의 일부 (World Athletics)',
  summary: '휴식·회복은 훈련 자극을 적응으로 바꾸는 필수 단계. 전략적 휴식이 다음 세션 품질을 만든다.'
}
const LOAD_EVIDENCE: EvidenceRef = {
  method: '점진적 부하',
  summary: '최근 부하가 높으면 완전 휴식으로 부상 위험을 낮춘다.'
}

/**
 * 휴식 가이던스를 산출한다.
 * - 활성 부상이 있으면: 부위 재활(strengthPlan) + 복귀 기준을 우선.
 * - 부하가 급증/증가면: 완전 휴식 권장.
 * - 그 외: 적극 회복 + 러닝 근력 보강.
 */
export function buildRestGuidance(
  injury: TrainingInjuryItem | null,
  chronic: ChronicLoadTrend | null
): RestGuidance {
  const items: string[] = []
  const evidence: EvidenceRef[] = [REST_EVIDENCE]
  const injuryActive = injury && (injury.status === 'active' || injury.status === 'monitoring')

  let purpose = '오늘 쉬는 것도 전략이에요 — 그동안의 부하를 적응으로 바꾸고 다음 세션을 준비합니다.'

  const loadHigh = chronic && (chronic.status === 'spike' || chronic.status === 'rising')

  if (injuryActive) {
    const area = injury!.area || '관리 부위'
    const sev = injury!.severity ?? 0
    purpose = `${area} 통증 ${sev}/5 관리가 오늘의 목적이에요. 통증을 키우지 않으면서 회복·강화합니다.`
    const plan = (injury!.strengthPlan ?? []).slice(0, 3)
    if (plan.length) items.push(`${area} 재활/강화: ${plan.join(' · ')}`)
    else items.push(`${area} 부위 통증 범위 내 가벼운 모빌리티·스트레칭`)
    if (injury!.returnToRunCriteria) items.push(`복귀 기준: ${injury!.returnToRunCriteria}`)
    items.push('통증이 커지면 중단하고, 필요하면 전문가 상담')
    evidence.push(LOAD_EVIDENCE)
    return { purpose, items, evidence }
  }

  if (loadHigh) {
    const pct = chronic?.increasePct ?? null
    purpose = `최근 부하가 ${pct !== null ? `이전 대비 ${pct}% ` : ''}높아요 — 오늘은 완전 휴식으로 회복을 우선합니다.`
    items.push('완전 휴식 권장 — 무리한 운동 금지')
    items.push('충분한 수면·수분·영양으로 회복 촉진')
    items.push('가벼운 산책·스트레칭 정도는 OK')
    evidence.push(LOAD_EVIDENCE)
    return { purpose, items, evidence }
  }

  // 평상시: 적극 회복 + 러닝 근력
  items.push('적극 회복: 가벼운 걷기/모빌리티 10~15분')
  items.push('러닝 근력 보강: 둔근(브리지)·코어·종아리 가볍게(2~3세트)')
  items.push('충분한 수면·수분 — 다음 세션 컨디션을 위해')
  return { purpose, items, evidence }
}

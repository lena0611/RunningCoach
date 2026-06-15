import type { TrainingPhaseName } from '@/entities/training-memory/model'
import type { EvaluatedProgressionCriteria } from '@/shared/lib/coaching/progressionCriteria'

/**
 * Phase 자동 전환 상태머신 (#337) — 순수 로직.
 *
 * ProgressionCriteria 평가(#336) + 부상 + 목표 레이스까지 남은 주수로 다음 phase 전환을 "제안"한다.
 * ⚠️ 자동 변경 금지: 항상 requiresUserConfirm=true. 실제 적용은 사용자 확인 모달(와이어프레임 게이트, 별도)에서.
 *
 * 전환 규칙:
 *   - 어디서든 → Recovery: 부상 활성(최우선 오버라이드).
 *   - Base → Build: easy ready + tempo not-blocked + long ready + injury ready.
 *   - Build → Threshold: 4기준 모두 ready.
 *   - Threshold → Race Specific: 모두 ready + 최근 5km TT 성공 + 레이스 ≤ 8주.
 *   - Race Specific → Taper: 레이스 ≤ 2주.
 *   - Recovery → Base: 부상/회복 게이트 ready(복귀).
 *   - Taper: 자동 전진 없음(레이스까지 유지).
 */

export type PhaseTransitionProposal = {
  shouldTransition: boolean
  fromPhase: TrainingPhaseName
  toPhase: TrainingPhaseName | null
  reason: string
  blockers: string[]
  requiresUserConfirm: true
}

export type PhaseTransitionContext = {
  injuryActive?: boolean
  /** 목표 레이스까지 남은 주(없으면 null). */
  weeksToRace?: number | null
  /** 최근 5km TT를 성공적으로 수행했는가(Race Specific 진입 조건). */
  hadRecent5kTT?: boolean
}

const CRITERIA_LABELS: Record<string, string> = {
  'easy-hr-stability': 'Easy 심박 안정',
  'tempo-ceiling-quality': 'Tempo 상한 준수',
  'long-run-durability': 'Long Run 지속성',
  'injury-recovery-gate': '부상/회복 게이트'
}

function proposal(
  fromPhase: TrainingPhaseName,
  toPhase: TrainingPhaseName,
  reason: string
): PhaseTransitionProposal {
  return { shouldTransition: true, fromPhase, toPhase, reason, blockers: [], requiresUserConfirm: true }
}

function hold(fromPhase: TrainingPhaseName, blockers: string[], reason: string): PhaseTransitionProposal {
  return { shouldTransition: false, fromPhase, toPhase: null, reason, blockers, requiresUserConfirm: true }
}

export function evaluatePhaseTransition(
  currentPhase: TrainingPhaseName,
  evaluated: EvaluatedProgressionCriteria,
  context: PhaseTransitionContext = {}
): PhaseTransitionProposal {
  const status = (id: string) => evaluated.statusMap[id]
  const isReady = (id: string) => status(id) === 'ready'
  const notBlocked = (id: string) => status(id) !== 'blocked'
  const weeksToRace = typeof context.weeksToRace === 'number' ? context.weeksToRace : null

  // 부상 활성 — 최우선: Recovery로(이미 Recovery면 유지).
  if (context.injuryActive) {
    if (currentPhase !== 'Recovery') {
      return proposal(currentPhase, 'Recovery', '부상 활성 — 회복 단계로 전환을 권장합니다(목표 보호).')
    }
    return hold('Recovery', ['부상 활성'], '부상 활성 — 회복 단계 유지.')
  }

  const notReadyBlockers = (ids: string[]) =>
    ids
      .filter((id) => !isReady(id))
      .map((id) => `${CRITERIA_LABELS[id] ?? id}: ${status(id) ?? 'unknown'}`)

  switch (currentPhase) {
    case 'Base': {
      const ok = isReady('easy-hr-stability') && notBlocked('tempo-ceiling-quality') && isReady('long-run-durability') && isReady('injury-recovery-gate')
      if (ok) {
        return proposal('Base', 'Build', 'Easy 안정·Long Run 지속성·부상 게이트 통과(Tempo 미차단) — Build 진입을 권장합니다.')
      }
      const blockers = notReadyBlockers(['easy-hr-stability', 'long-run-durability', 'injury-recovery-gate'])
      if (status('tempo-ceiling-quality') === 'blocked') blockers.push('Tempo 상한 준수: blocked')
      return hold('Base', blockers, 'Build 진입 조건 미충족 — Base 유지.')
    }
    case 'Build': {
      if (evaluated.allReady) {
        return proposal('Build', 'Threshold', '4기준 모두 ready — Threshold 진입을 권장합니다.')
      }
      return hold('Build', notReadyBlockers(Object.keys(CRITERIA_LABELS)), 'Threshold 진입 조건(4기준 ready) 미충족 — Build 유지.')
    }
    case 'Threshold': {
      const blockers = notReadyBlockers(Object.keys(CRITERIA_LABELS))
      if (!context.hadRecent5kTT) blockers.push('최근 5km TT 성공 기록 필요')
      if (weeksToRace === null) blockers.push('목표 레이스 일정 필요')
      else if (weeksToRace > 8) blockers.push(`레이스까지 ${weeksToRace}주(8주 이내여야 진입)`)
      if (!blockers.length) {
        return proposal('Threshold', 'Race Specific', '4기준 ready + 5km TT 성공 + 레이스 8주 이내 — Race Specific 진입을 권장합니다.')
      }
      return hold('Threshold', blockers, 'Race Specific 진입 조건 미충족 — Threshold 유지.')
    }
    case 'Race Specific': {
      if (weeksToRace !== null && weeksToRace <= 2) {
        return proposal('Race Specific', 'Taper', `레이스까지 ${weeksToRace}주 — Taper 진입을 권장합니다.`)
      }
      const detail = weeksToRace === null ? '목표 레이스 일정 필요' : `레이스까지 ${weeksToRace}주(2주 이내 시 Taper)`
      return hold('Race Specific', [detail], 'Taper 진입 시점 아님 — Race Specific 유지.')
    }
    case 'Taper': {
      return hold('Taper', [], '레이스까지 Taper 유지 — 자동 전진 없음.')
    }
    case 'Recovery': {
      if (isReady('injury-recovery-gate')) {
        return proposal('Recovery', 'Base', '부상/회복 게이트 통과 — 기반(Base) 단계로 복귀를 권장합니다.')
      }
      return hold('Recovery', ['부상/회복 게이트 미통과'], '회복 미완 — Recovery 유지.')
    }
    default:
      return hold(currentPhase, [], '정의되지 않은 단계 — 전환 보류.')
  }
}

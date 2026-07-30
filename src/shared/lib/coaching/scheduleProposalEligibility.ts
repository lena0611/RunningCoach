/**
 * 코치 대화 제안(#639)의 **상향(intensify) 적격 판정** — 웹 소유.
 *
 * 서버(coach-run G7)는 이 판정 결과(`canIntensify`)만 받아 상향 제안을 통과/폐기한다.
 * 판정을 서버에 미러링하지 않는 이유: 강도 사다리(`alternativeSession`)와 품질 게이트
 * (`progressionCriteria`)가 웹 SSOT 이고, 미러는 조용히 어긋난다(vdotPaces 미러 유지 부담 교훈).
 *
 * 왜 두 단계로 갈리나 (#전문코치리뷰 F2 → 구현 정밀화):
 * - 승격 결과가 **quality(Tempo/Steady Long/Race)** 면 80/20 의 20% 를 건드리는 경계다.
 *   SSOT §190("품질 게이트가 ready이고 부상/회복 게이트가 막히지 않을 때만")·§202~208 을 적용해
 *   해당 기준이 실제로 `ready` 일 때만 허용한다.
 * - 그 외(Recovery→Easy, Easy→Easy + Strides)는 강도 분포를 흔들지 않으므로 `blocked` 만 막는다.
 *   `progressionCriteria` 는 **표본 부족도 `watch`** 로 떨어뜨려서(초보는 최근 Tempo 2건이 잘 안 모인다)
 *   `watch` 를 차단으로 보면 기능이 사실상 발동하지 않는다. #455 더블 게이트가 같은 문제를
 *   "`watch` 는 무데이터+경계 혼재라 sparse-data 과차단"으로 정리한 선례를 따른다.
 *
 * 하향(easier)에는 이 판정을 쓰지 않는다 — 회복은 훈련의 일부이고 하향은 무마찰(SSOT §37).
 */

import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { adjustSessionType } from '@/shared/lib/coaching/alternativeSession'

/**
 * 세션 타입은 entities 를 직접 import 하지 않고 강도 사다리 함수 시그니처에서 끌어온다 —
 * shared → entities 의존을 새로 늘리지 않기 위함(#397 아키텍처 래칫, architecture-boundaries.test).
 */
type LadderSessionType = Parameters<typeof adjustSessionType>[0]

/** 승격 결과가 이 타입이면 강도 분포(80/20)를 건드리는 quality 승격으로 본다. */
const QUALITY_TYPES: LadderSessionType[] = ['Tempo', 'Steady Long', 'Race']

/** quality 승격을 허용할지 판단할 때 보는 기준 id. */
const QUALITY_GATE_CRITERION_ID = 'tempo-ceiling-quality'

/** 안전 게이트 — 이 기준이 blocked 면 어떤 상향도 허용하지 않는다. */
const INJURY_GATE_CRITERION_ID = 'injury-recovery-gate'

type CriterionStatus = CoachAdaptiveProgressSummary['criteria'][number]['status']

function statusOf(progress: CoachAdaptiveProgressSummary | null, id: string): CriterionStatus | null {
  return progress?.criteria.find((criterion) => criterion.id === id)?.status ?? null
}

/**
 * 그날 세션을 코치가 "더 강하게" 제안해도 되는가.
 * `progress` 가 없으면(판정 근거 없음) 허용하지 않는다 — fail-safe deny.
 */
export function canIntensifySession(
  sessionType: LadderSessionType,
  progress: CoachAdaptiveProgressSummary | null
): boolean {
  if (!progress) return false

  // 사다리 끝이면 올릴 곳이 없다(Race 등). 제안해도 아무 일도 일어나지 않으니 카드도 띄우지 않는다.
  const promotedType = adjustSessionType(sessionType, 'harder')
  if (promotedType === sessionType) return false

  // 부상/회복 게이트가 막혔으면 방향 무관 상향 금지(§190 "부상/회복 게이트가 막히지 않을 때만").
  if (statusOf(progress, INJURY_GATE_CRITERION_ID) === 'blocked') return false

  if (QUALITY_TYPES.includes(promotedType)) {
    // quality 승격: 해당 품질 기준이 실제로 ready 여야 한다(§190·§202~208).
    return statusOf(progress, QUALITY_GATE_CRITERION_ID) === 'ready'
  }

  // 이지 계열 내 승격: blocked 인 기준이 하나도 없을 때만(watch = 무데이터/경계는 통과).
  return !progress.criteria.some((criterion) => criterion.status === 'blocked')
}

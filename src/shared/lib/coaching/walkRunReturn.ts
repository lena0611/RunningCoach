/**
 * 부상 후 복귀 walk-run(걷기-뛰기) 점진 처방 (#501, #473 Phase 2 후속).
 *
 * SSOT: running-injury-knowledge.md §3-B(OSU Wexner Basic Return to Running) + running-coaching-standards.md §휴식과 복귀.
 * 통증성(급성) 부상 복귀는 연속주가 아니라 걷기-뛰기 5단계로 충격에 점진 재적응한다:
 *   P1 걷기4:뛰기1 → P2 3:2 → P3 2:3 → P4 1:4 → P5 연속 30분.
 * 단계 진행은 **달력이 아니라 통증으로** 게이트한다 — "통증·부종 증가 없이 한 단계를 여러 번(약 6회) 마치면 다음 단계".
 * 그래서 우리는 자동 진행 상태머신을 만들지 않고(앱이 매 세션의 통증을 신뢰성 있게 알 수 없음 → 캘린더 자동진행은
 * §3-B 의 통증 게이트를 위배한다), 기존 재활 처방 관용구(injuryAreas.ts 의 InjuryStrengthPlanDetail 처럼
 * useWhen/stopWhen/progression 을 제시)와 같이 **제시형 프로토콜**로 사다리와 진행·정지 규칙을 안내한다.
 *
 * ⚠ 범위: 모든 부상이 아니라 **급성 통증성 부상(status active + severity ≥ 2)** 에만 적용한다(§3-B "통증성 부상에
 * 이 점진을 적용한다 — 가벼운 단기 휴식엔 Easy 복귀로 충분"). monitoring(관리·안정화 중)·경증은 기존 연속 Easy 램프를
 * 유지해 과처방을 막는다. **무통 정식 RTR**(수술/골절 후 통증은 없으나 4주+ 중단)은 통증 트리거에 안 걸리며,
 * 이 경우는 returnRamp.ts 의 거리캡+초반 Easy화가 커버한다(walk-run 사다리 비대상 — 의도된 경계).
 * **redFlag 우선(§4)**: redFlag 자동 감지(evaluateRedFlags/redFlagTripped)는 아직 미구축이라(SSOT §5 청사진),
 * 현재는 severity ≥ 3 을 §4 프록시로 쓴다 — severity ≥ 3 이면 "복귀 보류·전문가 평가 먼저" 안내를 본세트 앞에 단다.
 * 그리고 walk-run 대상자는 정의상 급성 통증성 부상자이므로 **redFlag 위험 신호 의뢰 문구는 severity 불문 항상** cautions 에 노출해
 * 저-severity redFlag(피로골절 야간통·DVT 부종 등)도 사용자가 스스로 멈추도록 escape hatch 를 상시 띄운다.
 *
 * 순수 모듈(엔티티 타입만 의존). 거리/볼륨 상한(직전30일 최장+10%)·디트레이닝 경계는 returnRamp.ts 가 담당하고,
 * 이 모듈은 "어떻게 뛰나"(연속주 vs 걷기-뛰기 + 통증 정지)만 결정한다 — 두 레이어는 상보적이다.
 */

/**
 * 부상 입력의 **구조적 최소 뷰**. 엔티티 타입(TrainingInjuryItem)을 직접 import 하지 않는다 — shared→entities
 * 역방향 의존을 늘리지 않기 위함(#397 래칫). 호출부(sessionBriefing)가 TrainingInjuryItem 을 그대로 넘기면
 * status/severity/area 가 구조적으로 맞아 들어온다.
 */
export type WalkRunInjury = { status: string; severity: number | null; area?: string | null }

/** "어떻게 뛰나" 한 단계(라벨+본문). sessionBriefing 의 BriefingStep 과 구조 동일(순환/역방향 import 회피용 로컬 정의). */
export type WalkRunStep = { label: string; detail: string }

/** walk-run 사다리 한 단계. OSU Wexner RTR §3-B. */
export type WalkRunStage = {
  id: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'
  /** 걷기 분(P5 는 0 — 연속주). */
  walkMin: number
  /** 뛰기 분(P5 는 연속 30분이라 30). */
  runMin: number
  /** 사용자 표시 라벨. */
  label: string
}

export const WALK_RUN_STAGES: readonly WalkRunStage[] = [
  { id: 'P1', walkMin: 4, runMin: 1, label: '걷기 4분·뛰기 1분' },
  { id: 'P2', walkMin: 3, runMin: 2, label: '걷기 3분·뛰기 2분' },
  { id: 'P3', walkMin: 2, runMin: 3, label: '걷기 2분·뛰기 3분' },
  { id: 'P4', walkMin: 1, runMin: 4, label: '걷기 1분·뛰기 4분' },
  { id: 'P5', walkMin: 0, runMin: 30, label: '연속 30분' }
] as const

/**
 * walk-run 점진을 적용하는 연속 저강도 세션 타입(품질/한계시험 제외 — 통증성 부상엔 cautions/하향이 따로 처리).
 * 'Easy + Strides' 는 제외한다 — 스트라이드는 부상 severity 에 따라 감축/보류하는 기존 로직(computeStrides)이 따로 있고,
 * 복귀 램프(capReturnSession)가 통증성 복귀자의 Easy + Strides 를 어차피 Easy 로 강등하므로 walk-run 은 그 Easy 에 얹힌다.
 */
export const WALK_RUN_SESSION_TYPES: ReadonlySet<string> = new Set([
  'Easy',
  'Recovery',
  'LSD',
  'Steady Long'
])

/** 급성 통증성 부상(§3-B 적용 대상)인가 — status active + severity ≥ 2. monitoring·경증은 제외(연속 Easy 유지). */
export function isAcutePainfulInjury(injury: WalkRunInjury | null | undefined): boolean {
  if (!injury || injury.status !== 'active') return false
  return (injury.severity ?? 0) >= 2
}

/**
 * 이 세션에 walk-run 점진 처방을 적용할지. 급성 통증성 부상 + 저강도 세션일 때만.
 * (Race/Tempo 등 품질 세션은 통증성 부상이면 cautions/하향이 별도로 다룬다 — 여기선 보류.)
 */
export function shouldPrescribeWalkRun(injury: WalkRunInjury | null | undefined, sessionType: string): boolean {
  return isAcutePainfulInjury(injury) && WALK_RUN_SESSION_TYPES.has(sessionType)
}

/**
 * 복귀 보류·전문가 평가를 먼저 권할 수준인가. §4 redFlag 자동 감지가 미구축이라(SSOT §5 청사진)
 * 현재는 severity ≥ 3 을 프록시로 쓴다. evaluateRedFlags/redFlagTripped 가 도입되면 OR 조건으로 합친다.
 */
function isReferralLevel(injury: WalkRunInjury | null | undefined): boolean {
  return (injury?.severity ?? 0) >= 3
}

/** 사다리 한 줄 요약(P1 … → P5). */
function ladderSummary(): string {
  return WALK_RUN_STAGES.map((s) => `${s.id} ${s.label}`).join(' → ')
}

/**
 * walk-run 세션의 "어떻게 뛰나" 단계들(웜업→본훈련(걷기-뛰기 사다리)→강도→진행→통증 정지).
 * 처방된 시간(durationMin)이 있으면 본훈련 분량 안내에 쓰고, 없으면 ~20~30분 기준.
 */
export function walkRunExecutionSteps(
  injury: WalkRunInjury | null | undefined,
  durationMin: number | null | undefined
): WalkRunStep[] {
  const area = injury?.area || '부상 부위'
  const durText = durationMin && durationMin > 0 ? `약 ${durationMin}분` : '20~30분'
  const steps: WalkRunStep[] = [
    { label: '웜업', detail: '5분 걷기로 충분히 풀고, 통증이 없는지 먼저 확인해요' },
    {
      label: '본훈련(걷기-뛰기)',
      detail: `걷기와 뛰기를 번갈아 ${durText}. 복귀 첫날이면 P1부터, 이미 통증 없이 진행 중인 단계가 있으면 그 단계를 유지해요 — ${ladderSummary()}`
    },
    {
      label: '강도',
      detail: '뛰는 구간도 "편한 대화 페이스" — 빠르게가 아니라 충격에 다시 적응하는 게 목적이에요(심박·페이스는 보지 않아요)'
    },
    {
      label: '진행',
      detail: '통증·부종 증가 없이 한 단계를 여러 번(약 6회) 무리 없이 마치면 다음 단계로. 러닝하는 날 사이에는 최소 하루 쉬어요'
    },
    {
      label: '통증 정지',
      detail: `${area} — 달리는 중 ①날카로운 통증 ②갈수록 심해지는 통증 ③절뚝일 만큼 아픈 통증 중 하나라도 나오면 그날은 멈추고 단계를 올리지 않아요`
    }
  ]
  if (isReferralLevel(injury)) {
    steps.splice(1, 0, {
      label: '먼저',
      detail: `${area} 통증이 ${injury?.severity ?? 3}/5로 강해요 — 통증이 가라앉기 전이라면 복귀를 미루고 전문가 평가를 먼저 권해요. 통증이 줄었다면 아래를 가장 보수적으로(P1) 시작하세요`
    })
  }
  return steps
}

/**
 * walk-run 세션의 ④ 조심할 점(통증 정지 요약 + redFlag 의뢰). cautionsFor 가 일반 부상 주의에 더한다.
 * redFlag 위험 신호 의뢰 문구는 severity 불문 **항상** 노출한다(§4 escape hatch) — walk-run 대상자는 정의상
 * 급성 통증성 부상자라, redFlag 자동 감지가 없는 현재는 사용자가 위험 신호를 스스로 알아채고 멈추는 게 1차 안전망이다.
 */
export function walkRunCautions(): string[] {
  return [
    '걷기-뛰기는 "통증 0"이 합격선이에요 — 빠르기·거리 욕심은 단계가 통증 없이 안정된 뒤에.',
    '통증이 안정·휴식·야간에도 심하거나, 부종·열감·저림·방사통이 있으면 달리지 말고 전문가 평가로 연결하세요(러닝 부하 코칭은 의료 진단이 아니에요).'
  ]
}

/** walk-run 세션의 🎯 오늘의 핵심. */
export const WALK_RUN_KEY_POINT =
  '걷기-뛰기로 통증 없이 — 빠르기보다 "통증 0"이 오늘의 합격선이에요. 아프면 그날은 멈추고 단계를 올리지 않기.'

/**
 * 가상레이싱 경쟁 도메인 모델 (#233, competition-domain §10).
 *
 * 가상레이싱은 훈련 분류(RunLog.type)와 **직교**하는 경쟁 주석이다.
 *   - 정본 활동 = RunLog (type 불변). 레이싱 수행 세션은 RunLog.tags 의 'self-race' 로만 식별.
 *   - 경쟁 결과(타겟 PB·시간차·승패)는 경량 `CompetitionResult` 로 RunLog 에 링크된다.
 *   - ⚠️ CompetitionResult 는 볼륨·부하·추세 집계에 **미포함**. 업적·동기부여·코칭 인용 전용.
 */

/** 레이싱 결과 단위 태그. RunLog.tags 에 붙어 (a) 레이싱 세션 식별 (b) 업적 PB 사다리 분리 키. */
export const SELF_RACE_TAG = 'self-race'

/**
 * "이 런이 가상레이싱(self-race) 수행 세션인가" 단일 판정 헬퍼 (#235 후속 SSOT).
 * G1 유입 태깅·G4 치유 대상 식별·DashboardPage 집계/디브리핑 필터가 모두 이걸 쓴다.
 * `tags.includes('self-race')` 리터럴이 산재해 일관성이 깨지는 걸 막는다.
 */
export function isSelfRaceRun(run: { tags?: string[] | null }): boolean {
  return Boolean(run.tags?.includes(SELF_RACE_TAG))
}

export type CompetitionMode = 'self-pb'

/** ahead=win, behind=lose, even=tie. ghost.ts leadState 와 1:1 대응. */
export type CompetitionOutcome = 'win' | 'lose' | 'tie'

/** 타겟 = 거리별 내 베스트 PB. sourceRunId = 그 PB 를 소유한 RunLog(약결합). */
export type CompetitionTargetPb = {
  distanceM: number
  elapsedSec: number
  sourceRunId: string
}

/**
 * 영속 레이싱 결과. 종료 후 import 된 정본 RunLog 와 매칭되어 생성된다(linkedRunId 채워짐).
 * 타겟 '없음'(자유 TT)은 결과가 없으므로 이 레코드를 만들지 않는다(태그만 부여).
 */
export type CompetitionResult = {
  id: string
  userId: string
  mode: CompetitionMode
  targetPb: CompetitionTargetPb
  racedDistanceM: number
  racedDurationSec: number | null
  /** 부호(ghost.ts): 음수 = 타겟보다 빠름(win), 양수 = 느림(lose). */
  resultGapSec: number
  outcome: CompetitionOutcome
  /** 매칭된 정본 RunLog id. 매칭 시점에 채워진다. RunLog 삭제 시 null 로 끊김. */
  linkedRunId: string | null
  racedAt: string
  createdAt: string
  updatedAt: string
}

/**
 * 라이브 종료 직후 보관하는 임시 결과(클라이언트 로컬). 다음 HealthKit 동기화 때 import 된
 * RunLog 와 근접 매칭되어 (a) RunLog 에 'self-race' 태그 부여 (b) target 이 있으면 CompetitionResult 생성.
 * 매칭/만료되면 제거된다(영속 테이블 아님).
 */
export type PendingSelfRace = {
  id: string
  /** 라이브 측정 시작 wall-clock(ISO). RunLog.startAt 과 근접 매칭의 1차 키. */
  racedAt: string
  racedDistanceM: number
  racedDurationSec: number | null
  /** 타겟 '없음'(자유 TT)이면 null → 태그만 부여하고 CompetitionResult 는 만들지 않는다. */
  targetPb: CompetitionTargetPb | null
  outcome: CompetitionOutcome | null
  resultGapSec: number | null
  createdAt: string
}

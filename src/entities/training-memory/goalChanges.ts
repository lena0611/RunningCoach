import { createRecoveryGoal, getActiveGoal, getActiveInjuryItem, goalPlanKey, RECOVERY_GOAL_ID, type TrainingGoal, type TrainingMemory } from './model'

/**
 * '목표 다시 정하기'(#889)가 메모리에 남기는 변경. 플랜 재구성은 여기서 하지 않는다 — 활성 목표의 날짜·거리가
 * 플랜을 지은 값(planBuiltFor)과 달라지면 일정 확인(useTrainingWeek.doEnsureSchedule)이 오늘부터 다시 짠다.
 * 그래서 기억 탭에서 날짜를 직접 바꿔도 같은 길을 탄다.
 */
export type GoalChange =
  | { kind: 'postpone'; targetDate: string }
  | { kind: 'shorter'; distanceKm: number; targetDate: string }
  /** 날짜 그대로, 기록 목표만 빼고 완주 — 빠듯한 걸 알고 정했으니 무리 카드도 다시 안 띄운다. */
  | { kind: 'finish-only' }
  /** 지금 목표 그대로(#886) — 이 날짜·거리 동안 무리 카드를 다시 안 띄운다. */
  | { kind: 'keep' }
  /** 잠시 내려놓기 — 대회 목표는 '쉬는 중'으로 보관하고 회복 우선 목표를 활성으로. */
  | { kind: 'let-go' }
  /** 쉬던 목표를 새 날짜(·거리)로 다시 시작 — 회복 우선 목표는 걷어낸다. */
  | { kind: 'resume'; targetDate: string; distanceKm?: number }

export function applyGoalChange(memory: TrainingMemory, goalId: string, change: GoalChange, now: string): TrainingMemory {
  const target = memory.goals.find((goal) => goal.id === goalId)
  if (!target) return memory
  const touch = (goal: TrainingGoal, patch: Partial<TrainingGoal>): TrainingGoal => ({ ...goal, ...patch, updatedAt: now })

  const mapTarget = (patch: (goal: TrainingGoal) => Partial<TrainingGoal>) =>
    memory.goals.map((goal) => (goal.id === goalId ? touch(goal, patch(goal)) : goal))

  switch (change.kind) {
    case 'postpone':
      return { ...memory, goals: mapTarget(() => ({ targetDate: change.targetDate, feasibilityAcceptedFor: null })) }
    case 'shorter':
      return {
        ...memory,
        goals: mapTarget(() => ({
          distanceKm: change.distanceKm,
          targetDate: change.targetDate,
          targetDurationSec: null,
          feasibilityAcceptedFor: null
        }))
      }
    case 'finish-only':
      return { ...memory, goals: mapTarget((goal) => ({ targetDurationSec: null, feasibilityAcceptedFor: goalPlanKey(goal) })) }
    case 'keep':
      return { ...memory, goals: mapTarget((goal) => ({ feasibilityAcceptedFor: goalPlanKey(goal) })) }
    case 'let-go': {
      const paused = mapTarget(() => ({ status: 'paused' }))
      const existing = paused.find((goal) => goal.id === RECOVERY_GOAL_ID)
      const goals = existing
        ? paused.map((goal) => (goal.id === RECOVERY_GOAL_ID ? touch(goal, { status: 'active' }) : goal))
        : [...paused, createRecoveryGoal(now)]
      return { ...memory, goals, activeGoalId: RECOVERY_GOAL_ID, goal: '회복 우선' }
    }
    case 'resume': {
      // 다시 시작한 날이 새 시작일(#893 후속) — 단계 달력은 시작일과 첫 세션 중 늦은 쪽부터라, 옛 플랜 첫 세션(몇 달 전)부터
      // 이어 가지 않고 기초기부터 새로 나눈다. 쉬는 동안 회복 리듬으로 계속 뛰어 28일 공백이 없어도 마찬가지다.
      const goals = mapTarget(() => ({
        status: 'active',
        startDate: localDateOf(now),
        targetDate: change.targetDate,
        ...(change.distanceKm ? { distanceKm: change.distanceKm, targetDurationSec: null } : {}),
        feasibilityAcceptedFor: null
      })).filter((goal) => goal.id !== RECOVERY_GOAL_ID)
      return { ...memory, goals, activeGoalId: goalId, goal: target.title }
    }
  }
}

/** 쉬는 중(내려놓은) 대회 목표들 — 회복 우선 목표가 활성일 때 코치 탭 '쉬고 있는 목표'에 보인다. */
export function pausedGoals(memory: TrainingMemory): TrainingGoal[] {
  return memory.goals.filter((goal) => goal.status === 'paused' && goal.id !== RECOVERY_GOAL_ID)
}

/** 쉬던 대회 목표를 다시 정하자고 물을 이유. pausedOnly = 부상과 무관하게 내려놓았던 목표 — 몸 얘기를 하지 않는다. */
export type GoalResumeSignal = { goalId: string; areaLabel: string | null; pausedOnly?: boolean }

/**
 * 쉬던 대회 목표를 다시 정하자고 물을 때인가(#889) — 회복 우선 목표가 활성일 때만.
 * - 부상 중이면 마지막으로 아픈 날에서 quietDays 가 지나야.
 * - 내려놓은 뒤 부상이 해소됐으면 바로.
 * - 부상과 무관하게 내려놓았으면 쉰 지 quietDays 가 지나야 — 예전엔 부상이 없으면 곧장 참이라, 내려놓자마자
 *   "몸이 한결 나아졌어요. 다시 정해볼까요?"가 떴다(#891 라이브 QA).
 * 내려놓은 날은 목표의 updatedAt('쉬고 있는 목표' 카드의 "~부터"와 같은 기준). 선언한 휴식 중엔 묻지 않는다(닦달 금지).
 */
export function goalResumeSignal(memory: TrainingMemory, todayIso: string, quietDays: number): GoalResumeSignal | null {
  if (getActiveGoal(memory).id !== RECOVERY_GOAL_ID) return null
  if (memory.activeRest && memory.activeRest.untilDate >= todayIso) return null
  const goal = pausedGoals(memory)[0]
  if (!goal) return null
  const injury = getActiveInjuryItem(memory)
  if (injury) {
    const lastPain = injury.lastFlareDate ?? injury.onsetDate
    if (!lastPain || daysBetween(lastPain, todayIso) < quietDays) return null
    return { goalId: goal.id, areaLabel: injury.area }
  }
  const pausedOn = goal.updatedAt.slice(0, 10)
  if (memory.injuryItems.some((item) => item.resolvedAt && item.resolvedAt.slice(0, 10) >= pausedOn)) {
    return { goalId: goal.id, areaLabel: null }
  }
  if (daysBetween(pausedOn, todayIso) < quietDays) return null
  return { goalId: goal.id, areaLabel: null, pausedOnly: true }
}

/** 시각(ISO) → 그 사용자의 달력 날짜. UTC 로 자르면 한국 오전 9시 전엔 어제가 된다. */
function localDateOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime() - new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000)
}

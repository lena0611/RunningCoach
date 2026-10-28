import { createRecoveryGoal, goalPlanKey, RECOVERY_GOAL_ID, type TrainingGoal, type TrainingMemory } from './model'

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
      const goals = mapTarget(() => ({
        status: 'active',
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

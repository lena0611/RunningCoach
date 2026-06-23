/**
 * DEV 전용 E2E 시드(#473 복귀 램프 검증용). 프로덕션 번들엔 포함되지 않는다(main.ts 에서 import.meta.env.DEV 게이트 + 동적 import).
 *
 * 복귀 램프 화면은 "레이스 목표 + 7일+ 경과한(이미 끝난) 휴식"이 있어야 doEnsureSchedule 의 자연만료 분기가
 * 발동한다. 실제로 2주를 기다릴 수 없으므로, 테스트 계정에 그 상태를 결정론으로 깐다(과거 날짜 휴식).
 * 인증된 실 Supabase 세션에서만 동작한다(스토어 액션이 Supabase 에 쓴다).
 */
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { buildPeriodizedSchedule } from '@/shared/lib/coaching/periodizedSchedule'
import type { TrainingGoal } from '@/entities/training-memory/model'

function isoOffset(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const RACE_GOAL_ID = 'e2e-race-10k'

/**
 * 복귀 램프 시나리오를 깐다: 레이스 10K 목표 + 2주 전 시작해 이틀 전 끝난 휴식(durationDays≈13, returnRampApplied=false).
 * 이후 새로고침하면 doEnsureSchedule 자연만료 분기가 첫 세션을 Easy·캡으로 재정렬한다.
 */
export async function seedReturnRamp(): Promise<{ ok: true }> {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const start = isoOffset(-14)
  const until = isoOffset(-2)
  const target = isoOffset(120)

  const raceGoal: TrainingGoal = {
    id: RACE_GOAL_ID,
    title: '10K 레이스(E2E)',
    category: 'race',
    startDate: start,
    targetDate: target,
    distanceKm: 10,
    targetDurationSec: 3000,
    priority: 1,
    status: 'active',
    successCriteria: '',
    strategyNotes: '',
    notes: '',
    createdAt: `${start}T00:00:00.000Z`,
    updatedAt: new Date().toISOString()
  }

  // 1) 레이스 목표로 교체 + 기존 휴식 제거.
  await memory.update({ ...memory.memory, goal: raceGoal.title, activeGoalId: RACE_GOAL_ID, goals: [raceGoal], activeRest: null })

  // 2) 2주 전부터의 주기화 스케줄을 깐다(현재 시점 기준 미래 세션 = 복귀 후 대상).
  await sched.load(RACE_GOAL_ID)
  const drafts = buildPeriodizedSchedule({
    goal: raceGoal,
    profile: memory.memory.athleteProfile,
    today: new Date(`${start}T00:00:00`),
    currentWeeklyKm: 25,
    observedEasyPace: null
  })
  await sched.realign(RACE_GOAL_ID, start, drafts)

  // 3) 과거 휴식(끝남) — 아직 램프 미적용.
  await sched.declareRest(RACE_GOAL_ID, start, until)
  await memory.setActiveRest({ startDate: start, untilDate: until, reason: 'personal', declaredAt: `${start}T00:00:00.000Z`, returnRampApplied: false })

  return { ok: true }
}

/** 현재 활성 목표의 가장 이른 미래(오늘 이후) planned 세션 정보 — 램프 적용 검증용. */
export function firstUpcomingSession(): { date: string; sessionType: string; distanceKm: number | null } | null {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const today = isoOffset(0)
  const upcoming = sched.sessions
    .filter((s) => s.goalId === memory.memory.activeGoalId && s.status === 'planned' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  return upcoming ? { date: upcoming.date, sessionType: upcoming.sessionType, distanceKm: upcoming.prescription.distanceKm } : null
}

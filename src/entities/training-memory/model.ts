export type TrainingMemory = {
  goal: string
  goals: TrainingGoal[]
  activeGoalId: string
  athleteProfile: AthleteProfile
  weeklyPattern: string[]
  longRunStrategy: string
  currentVolumeNote: string
  knownIssues: string[]
  runningStyle: string[]
  heatStrategy: string[]
  aiNotes: string[]
}

export type TrainingGoal = {
  id: string
  title: string
  category: 'race' | 'fitness' | 'health' | 'habit' | 'maintenance'
  targetDate: string | null
  distanceKm: number | null
  targetDurationSec: number | null
  priority: number
  status: 'active' | 'paused' | 'completed' | 'archived'
  notes: string
  createdAt: string
  updatedAt: string
}

export type AthleteProfile = {
  birthYear: number | null
  sex: 'male' | 'female' | 'other' | 'unknown'
  runningExperienceMonths: number | null
  weeklyRunDaysTarget: number | null
  preferredLongRunDay: string
  personalBests: PersonalBest[]
}

export type PersonalBest = {
  distanceKm: number
  durationSec: number
  date: string
  source: 'race' | 'time_trial' | 'estimated'
}

export const defaultGoalId = 'goal-10k-60'

export const initialTrainingMemory: TrainingMemory = {
  goal: '10km 60분 달성',
  activeGoalId: defaultGoalId,
  goals: [
    {
      id: defaultGoalId,
      title: '10km 60분 달성',
      category: 'race',
      targetDate: null,
      distanceKm: 10,
      targetDurationSec: 3600,
      priority: 1,
      status: 'active',
      notes: '기본 활성 목표',
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z'
    }
  ],
  athleteProfile: {
    birthYear: null,
    sex: 'unknown',
    runningExperienceMonths: null,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: []
  },
  weeklyPattern: [
    '화요일: Easy + Strides',
    '목요일: Tempo',
    '토요일: LSD 또는 Steady Long',
    '필요 시 5km Easy 추가'
  ],
  longRunStrategy: '토요일 롱런은 격주로 Easy LSD와 Steady Long을 번갈아 수행한다.',
  currentVolumeNote: '최근 반달 114km 누적. 대부분 5km Easy.',
  knownIssues: [
    '과거 좌측 근위부 햄스트링 이슈',
    '더위에서 심박 상승',
    '30도 이상 낮 러닝은 위험도가 높음'
  ],
  runningStyle: [
    '케이던스를 억지로 맞추면 호흡이 불편함',
    '케이던스 신경을 줄이면 복식호흡이 편함',
    '느린 페이스에서는 165~170spm 정도',
    '5분 초반 페이스에서는 180spm이 자연스럽게 나옴',
    '스트라이드형 성향 가능성'
  ],
  heatStrategy: [
    '30도 이상 낮 러닝은 피한다',
    '여름에는 페이스보다 체감강도와 심박 상한을 우선한다',
    '여름은 기록 시즌이 아니라 버티기와 기반 유지 시즌으로 본다'
  ],
  aiNotes: [
    '코칭은 단일 기록보다 최근 훈련 흐름과 격주 롱런 패턴을 함께 봐야 한다',
    '다음 훈련 추천은 피로도, 최근 14일 기록, 장거리 주차 여부를 함께 반영한다'
  ]
}

export function getActiveGoal(memory: TrainingMemory): TrainingGoal {
  return memory.goals.find((goal) => goal.id === memory.activeGoalId) ?? memory.goals[0]
}

export function normalizeTrainingMemory(memory: Partial<TrainingMemory> | null | undefined): TrainingMemory {
  const base = cloneMemory(initialTrainingMemory)
  const merged = {
    ...base,
    ...(memory ?? {}),
    athleteProfile: {
      ...base.athleteProfile,
      ...(memory?.athleteProfile ?? {})
    }
  }

  const goals = normalizeGoals(memory)
  const activeGoalId = goals.some((goal) => goal.id === memory?.activeGoalId) ? memory?.activeGoalId ?? goals[0].id : goals[0].id
  const activeGoal = goals.find((goal) => goal.id === activeGoalId) ?? goals[0]

  return {
    ...merged,
    goals,
    activeGoalId,
    goal: activeGoal.title
  }
}

function normalizeGoals(memory: Partial<TrainingMemory> | null | undefined): TrainingGoal[] {
  const now = new Date().toISOString()
  const rawGoals = Array.isArray(memory?.goals) ? memory.goals : []
  const goals = rawGoals
    .map((goal, index) => normalizeGoal(goal as Partial<TrainingGoal>, index, now))
    .filter((goal): goal is TrainingGoal => Boolean(goal))

  if (goals.length) return goals

  const title = memory?.goal?.trim() || initialTrainingMemory.goal
  return [
    {
      ...cloneMemory(initialTrainingMemory.goals[0]),
      id: defaultGoalId,
      title,
      updatedAt: now
    }
  ]
}

function normalizeGoal(goal: Partial<TrainingGoal>, index: number, now: string): TrainingGoal | null {
  const title = typeof goal.title === 'string' ? goal.title.trim() : ''
  if (!title) return null
  return {
    id: typeof goal.id === 'string' && goal.id ? goal.id : `goal-${index + 1}`,
    title,
    category: normalizeGoalCategory(goal.category),
    targetDate: typeof goal.targetDate === 'string' && goal.targetDate ? goal.targetDate : null,
    distanceKm: normalizeNullableNumber(goal.distanceKm),
    targetDurationSec: normalizeNullableNumber(goal.targetDurationSec),
    priority: Number.isFinite(goal.priority) ? Number(goal.priority) : index + 1,
    status: normalizeGoalStatus(goal.status),
    notes: typeof goal.notes === 'string' ? goal.notes : '',
    createdAt: typeof goal.createdAt === 'string' ? goal.createdAt : now,
    updatedAt: typeof goal.updatedAt === 'string' ? goal.updatedAt : now
  }
}

function normalizeGoalCategory(value: unknown): TrainingGoal['category'] {
  return value === 'fitness' || value === 'health' || value === 'habit' || value === 'maintenance' || value === 'race' ? value : 'race'
}

function normalizeGoalStatus(value: unknown): TrainingGoal['status'] {
  return value === 'paused' || value === 'completed' || value === 'archived' || value === 'active' ? value : 'active'
}

function normalizeNullableNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function cloneMemory<T>(memory: T): T {
  return JSON.parse(JSON.stringify(memory))
}

export type TrainingMemory = {
  goal: string
  goals: TrainingGoal[]
  activeGoalId: string
  injuryItems: TrainingInjuryItem[]
  activeInjuryItemId: string | null
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
  startDate: string | null
  targetDate: string | null
  distanceKm: number | null
  targetDurationSec: number | null
  priority: number
  status: 'active' | 'paused' | 'completed' | 'archived'
  successCriteria: string
  strategyNotes: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type TrainingInjuryItem = {
  id: string
  title: string
  area: string
  status: 'active' | 'monitoring' | 'resolved' | 'archived'
  severity: number | null
  onsetDate: string | null
  lastFlareDate: string | null
  notes: string
  managementPlan: string
  triggers: string[]
  restrictions: string[]
  returnToRunCriteria: string
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
export const defaultInjuryItemId = 'injury-left-hamstring'

export const initialTrainingMemory: TrainingMemory = {
  goal: '10km 60분 달성',
  activeGoalId: defaultGoalId,
  activeInjuryItemId: defaultInjuryItemId,
  goals: [
    {
      id: defaultGoalId,
      title: '10km 60분 달성',
      category: 'race',
      startDate: null,
      targetDate: null,
      distanceKm: 10,
      targetDurationSec: 3600,
      priority: 1,
      status: 'active',
      successCriteria: '10km를 59:59 이내로 완주한다.',
      strategyNotes: 'Easy 기반을 유지하면서 Tempo와 격주 롱런으로 10km 지속 능력을 끌어올린다.',
      notes: '기본 활성 목표',
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z'
    }
  ],
  injuryItems: [
    {
      id: defaultInjuryItemId,
      title: '좌측 근위부 햄스트링 이슈',
      area: '좌측 햄스트링',
      status: 'monitoring',
      severity: null,
      onsetDate: null,
      lastFlareDate: null,
      notes: '과거 이슈. 강훈련/롱런 뒤 뻣뻣함 여부 확인.',
      managementPlan: '통증 단정 없이 피로 누적 신호를 보수적으로 관찰한다.',
      triggers: ['템포/롱런 다음날 뻣뻣함', '볼륨 급증'],
      restrictions: ['통증이 있으면 스트라이드와 템포를 줄인다', '롱런 후 회복 반응을 먼저 확인한다'],
      returnToRunCriteria: '다음날 뻣뻣함이나 통증 신호 없이 Easy 조깅이 편하게 느껴질 때 강도를 올린다.',
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

export function getActiveInjuryItem(memory: TrainingMemory): TrainingInjuryItem | null {
  if (!memory.activeInjuryItemId) return memory.injuryItems.find((item) => item.status === 'active' || item.status === 'monitoring') ?? null
  return memory.injuryItems.find((item) => item.id === memory.activeInjuryItemId) ?? null
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
  const injuryItems = normalizeInjuryItems(memory)
  const activeInjuryItemId = memory?.activeInjuryItemId && injuryItems.some((item) => item.id === memory.activeInjuryItemId)
    ? memory.activeInjuryItemId
    : injuryItems.find((item) => item.status === 'active' || item.status === 'monitoring')?.id ?? null

  return {
    ...merged,
    goals,
    activeGoalId,
    injuryItems,
    activeInjuryItemId,
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
    startDate: typeof goal.startDate === 'string' && goal.startDate ? goal.startDate : null,
    targetDate: typeof goal.targetDate === 'string' && goal.targetDate ? goal.targetDate : null,
    distanceKm: normalizeNullableNumber(goal.distanceKm),
    targetDurationSec: normalizeNullableNumber(goal.targetDurationSec),
    priority: Number.isFinite(goal.priority) ? Number(goal.priority) : index + 1,
    status: normalizeGoalStatus(goal.status),
    successCriteria: typeof goal.successCriteria === 'string' ? goal.successCriteria : '',
    strategyNotes: typeof goal.strategyNotes === 'string' ? goal.strategyNotes : '',
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

function normalizeInjuryItems(memory: Partial<TrainingMemory> | null | undefined): TrainingInjuryItem[] {
  const now = new Date().toISOString()
  const rawItems = Array.isArray(memory?.injuryItems) ? memory.injuryItems : []
  const items = rawItems
    .map((item, index) => normalizeInjuryItem(item as Partial<TrainingInjuryItem>, index, now))
    .filter((item): item is TrainingInjuryItem => Boolean(item))

  if (items.length) return items

  const legacyItems = (memory?.knownIssues ?? [])
    .filter((issue) => /햄스트링|통증|부상|이슈|무릎|발목|족저|아킬레스|정강|고관절/.test(issue))
    .map((issue, index) => normalizeInjuryItem({ title: issue, notes: issue, status: 'monitoring' }, index, now))
    .filter((item): item is TrainingInjuryItem => Boolean(item))

  if (legacyItems.length) return legacyItems
  return cloneMemory(initialTrainingMemory.injuryItems)
}

function normalizeInjuryItem(item: Partial<TrainingInjuryItem>, index: number, now: string): TrainingInjuryItem | null {
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  if (!title) return null
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `injury-${index + 1}`,
    title,
    area: typeof item.area === 'string' ? item.area : '',
    status: normalizeInjuryStatus(item.status),
    severity: normalizeSeverity(item.severity),
    onsetDate: typeof item.onsetDate === 'string' && item.onsetDate ? item.onsetDate : null,
    lastFlareDate: typeof item.lastFlareDate === 'string' && item.lastFlareDate ? item.lastFlareDate : null,
    notes: typeof item.notes === 'string' ? item.notes : '',
    managementPlan: typeof item.managementPlan === 'string' ? item.managementPlan : '',
    triggers: normalizeStringArray(item.triggers),
    restrictions: normalizeStringArray(item.restrictions),
    returnToRunCriteria: typeof item.returnToRunCriteria === 'string' ? item.returnToRunCriteria : '',
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now
  }
}

function normalizeInjuryStatus(value: unknown): TrainingInjuryItem['status'] {
  return value === 'active' || value === 'resolved' || value === 'archived' || value === 'monitoring' ? value : 'monitoring'
}

function normalizeSeverity(value: unknown): number | null {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.min(5, Math.max(1, Math.round(numberValue)))
}

function normalizeNullableNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function cloneMemory<T>(memory: T): T {
  return JSON.parse(JSON.stringify(memory))
}

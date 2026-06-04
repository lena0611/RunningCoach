import {
  createConservativeStrengthPlan,
  createConservativeStrengthPlanDetails,
  createInjuryManagementPlan,
  createReturnToRunCriteria,
  createInjuryRestrictions,
  deriveInjurySeverity,
  normalizeInjuryAreaSelections,
  summarizeInjuryAreas,
  type InjuryAreaSelection,
  type InjuryStrengthPlanDetail,
  type InjuryStrengthPlanSource
} from './injuryAreas'

export type TrainingMemory = {
  goal: string
  goals: TrainingGoal[]
  activeGoalId: string
  injuryItems: TrainingInjuryItem[]
  activeInjuryItemId: string | null
  athleteProfile: AthleteProfile
  adaptiveTrainingProfile: AdaptiveTrainingProfile
  runnerIdentity: RunnerIdentity
  coachBeliefs: CoachBelief[]
  weeklyPattern: string[]
  longRunStrategy: string
  currentVolumeNote: string
  knownIssues: string[]
  runningStyle: string[]
  heatStrategy: string[]
  aiNotes: string[]
}

export type RunnerIdentity = {
  strengths: RunnerIdentityTrait[]
  weaknesses: RunnerIdentityTrait[]
  riskFactors: RunnerIdentityTrait[]
  coachingStyle: string[]
}

export type RunnerIdentityTrait = {
  label: string
  evidence: string[]
  confidence: number
  source: 'engine' | 'coach' | 'user' | 'mixed'
  updatedAt: string | null
}

export type CoachBelief = {
  id: string
  belief: string
  category: 'recovery' | 'injury' | 'load' | 'pacing' | 'routine' | 'weather' | 'preference' | 'other'
  confidence: number
  supportCount: number
  contradictionCount: number
  evidenceRunIds: string[]
  status: 'candidate' | 'confirmed' | 'retired'
  source: 'engine' | 'coach' | 'user' | 'mixed'
  updatedAt: string | null
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
  normalizedAreas: InjuryAreaSelection[]
  status: 'active' | 'monitoring' | 'resolved' | 'archived'
  severity: number | null
  onsetDate: string | null
  lastFlareDate: string | null
  lastCheckedAt: string | null
  resolvedAt: string | null
  checkInHistory: TrainingInjuryCheckIn[]
  notes: string
  managementPlan: string
  triggers: string[]
  restrictions: string[]
  returnToRunCriteria: string
  strengthPlan: string[]
  strengthPlanDetails: TrainingStrengthPlanDetail[]
  createdAt: string
  updatedAt: string
}

export type TrainingInjuryCheckIn = {
  id: string
  checkedAt: string
  painLevel: number | null
  areaPainLevels: InjuryAreaSelection[]
  worsenedDuringOrAfterRun: boolean | null
  dailyActivityPain: boolean | null
  readyForQualitySession: boolean | null
  note: string
  source: 'user_check_in' | 'coach_suggestion' | 'manual_edit'
}

export type TrainingStrengthPlanDetail = InjuryStrengthPlanDetail
export type TrainingStrengthPlanSource = InjuryStrengthPlanSource

export type RunnerLevel = 'beginner' | 'intermediate' | 'advanced'
export type RunnerLevelSetting = 'auto' | RunnerLevel

export type AthleteProfile = {
  birthYear: number | null
  sex: 'male' | 'female' | 'other' | 'unknown'
  runningExperienceMonths: number | null
  weeklyRunDaysTarget: number | null
  preferredLongRunDay: string
  personalBests: PersonalBest[]
  runnerLevel: RunnerLevelSetting
  // 개인 심박 기준. 심박존/템포 상한을 상수 대신 개인 anchor에서 파생한다.
  // heartRateMode가 'manual'이고 입력값이 있으면 그것을 우선, 아니면 앱 추천값(나이+누적데이터)을 쓴다.
  maxHeartRate: number | null
  restingHeartRate: number | null
  lactateThresholdHr: number | null
  heartRateMode: 'auto' | 'manual'
  // 심폐 체력(VO2max, mL/kg·min). HealthKit 최신 샘플이 있으면 채우고, 없으면 null로 미사용.
  // 심박 상한 파생에는 쓰지 않는다. VDOT 페이스 추정의 보조 신호로만 쓴다. (vdotPaces.ts)
  vo2Max: number | null
  vo2MaxSampleDate: string | null
  vo2MaxSource: 'healthkit' | 'manual' | null
}

export type PersonalBest = {
  distanceKm: number
  durationSec: number
  date: string
  source: 'race' | 'time_trial' | 'estimated'
}

export type AdaptiveTrainingProfile = {
  methodologyVersion: string
  updatedAt: string | null
  trainingPhase: TrainingPhasePlan
  progressionCriteria: ProgressionCriterion[]
  prescriptionTemplates: PrescriptionTemplate[]
  compliancePatterns: string[]
  sessionGuides: AdaptiveSessionGuide[]
}

export type TrainingPhaseName = 'Base' | 'Build' | 'Threshold' | 'Race Specific' | 'Taper' | 'Recovery'

export type TrainingPhasePlan = {
  currentPhase: TrainingPhaseName
  startedAt: string | null
  goal: string
  focus: string[]
  nextPhase: TrainingPhaseName | null
  reviewAfter: string
}

export type ProgressionCriterion = {
  id: string
  label: string
  status: 'ready' | 'watch' | 'blocked'
  evidence: string
  action: string
}

export type PrescriptionTemplate = {
  id: string
  name: string
  phase: TrainingPhaseName | 'Any'
  sessionType: string
  purpose: string
  workout: string[]
  useWhen: string[]
  avoidWhen: string[]
  progressionTrigger: string
}

export type AdaptiveSessionGuide = {
  type: string
  boundary: string
  adjustment: 'maintain' | 'raise' | 'lower' | 'watch'
  evidence: string
  nextCheck: string
}

export const defaultGoalId = 'goal-10k-60'
export const defaultInjuryItemId = 'injury-left-hamstring'

export const defaultTrainingPhase: TrainingPhasePlan = {
  currentPhase: 'Base',
  startedAt: null,
  goal: '10km 60분 목표를 위한 유산소 기반과 주간 루틴 안정화',
  focus: ['Easy 심박 안정', 'Easy + Strides 신경근 자극', 'Tempo 상한 준수', '격주 Long Run 지속성'],
  nextPhase: 'Build',
  reviewAfter: '핵심 세션 2~3주 안정 수행 후'
}

export const defaultProgressionCriteria: ProgressionCriterion[] = [
  {
    id: 'easy-hr-stability',
    label: 'Easy 심박 안정',
    status: 'watch',
    evidence: 'Easy는 페이스보다 심박을 우선하며 145bpm 이하 유지가 기준이다.',
    action: '2~3회 연속 안정되면 Easy 볼륨 또는 Strides 품질 상향 후보로 본다.'
  },
  {
    id: 'tempo-ceiling-quality',
    label: 'Tempo 상한 준수',
    status: 'watch',
    evidence: 'Tempo는 최대 심박 165bpm을 넘기지 않고 후반 급락이 없어야 한다.',
    action: '2회 이상 안정되면 지속 시간 소폭 증가 또는 구간형 Tempo를 검토한다.'
  },
  {
    id: 'long-run-durability',
    label: 'Long Run 지속성',
    status: 'watch',
    evidence: '10km 이상 세션은 후반 페이스 급락, 심박 드리프트, 다음날 회복 반응을 함께 본다.',
    action: '회복이 안정되면 격주 Steady Long 비중을 조금 올린다.'
  },
  {
    id: 'injury-recovery-gate',
    label: '부상/회복 게이트',
    status: 'watch',
    evidence: 'active 또는 monitoring 부상, 통증 메모, 피로 반응이 있으면 승급을 보류한다.',
    action: '착지감과 다음날 반응이 조용할 때만 강도나 거리 상향을 검토한다.'
  }
]

export const defaultPrescriptionTemplates: PrescriptionTemplate[] = [
  {
    id: 'easy-base',
    name: 'Easy 기반주',
    phase: 'Any',
    sessionType: 'Easy',
    purpose: '유산소 기반 유지와 회복 가능한 볼륨 확보',
    workout: ['대화 가능한 강도', '심박 145bpm 이하 우선', '페이스는 컨디션과 날씨에 맡김'],
    useWhen: ['주간 루틴의 기본 볼륨일 때', '강훈련 전후 연결 조깅이 필요할 때'],
    avoidWhen: ['통증이 뛰면서 커질 때', '더위로 심박이 쉽게 튈 때는 거리보다 시간으로 축소'],
    progressionTrigger: '심박 145 이하로 2~3회 안정되고 다음날 피로가 낮으면 거리나 시간을 소폭 증가'
  },
  {
    id: 'recovery-reset',
    name: 'Recovery 회복주',
    phase: 'Any',
    sessionType: 'Recovery',
    purpose: '롱런/템포 다음날 혈류 회복과 피로 확인',
    workout: ['심박 130bpm 전후', 'RPE 1~2', '거리 욕심 없이 착지감 확인'],
    useWhen: ['롱런 또는 템포 다음날', '부상/피로 신호를 확인해야 할 때'],
    avoidWhen: ['통증이 달리며 커질 때', '회복주가 Easy 강도로 올라갈 때'],
    progressionTrigger: '반복적으로 회복주 심박이 낮고 통증이 없으면 다음 핵심 세션 정상 진행'
  },
  {
    id: 'easy-strides-8x',
    name: 'Easy + Strides',
    phase: 'Base',
    sessionType: 'Easy + Strides',
    purpose: '낮은 심박 기반에 짧은 신경근 자극 추가',
    workout: ['워밍업 10분', '20초 가속 + 1분40초 회복 x 8', '쿨다운 15분'],
    useWhen: ['화요일 루틴', 'Easy 기반은 유지하면서 다리 회전을 깨우고 싶을 때'],
    avoidWhen: ['햄스트링/발바닥 신호가 active일 때', '가속 회복 구간에서 호흡이 내려오지 않을 때'],
    progressionTrigger: '가속이 선명하고 회복 구간 심박이 안정되면 횟수보다 질을 유지하고 Tempo 품질로 연결'
  },
  {
    id: 'tempo-ceiling-165',
    name: 'Tempo 상한주',
    phase: 'Build',
    sessionType: 'Tempo',
    purpose: '10km 목표를 위한 역치 지속력 확보',
    workout: ['워밍업 후 Tempo', '최대 심박 165bpm 넘기지 않기', '후반 페이스 급락 없이 마무리'],
    useWhen: ['목요일 루틴', '최근 Easy/Long Run 회복이 안정적일 때'],
    avoidWhen: ['최근 7일 강훈련이 많을 때', 'Tempo 중반 전에 165를 넘길 때', '통증 신호가 있을 때'],
    progressionTrigger: '2회 이상 165 이하로 안정되면 Tempo 지속 시간을 소폭 늘리거나 구간형 Tempo 검토'
  },
  {
    id: 'lsd-easy-long',
    name: 'Easy LSD',
    phase: 'Base',
    sessionType: 'LSD',
    purpose: '긴 시간 움직이는 기반과 지방대사/지속성 확보',
    workout: ['초반 억제', '대화 가능한 강도', '후반 심박 드리프트 관찰'],
    useWhen: ['토요일 Easy LSD 주차', '최근 강훈련 뒤 회복이 필요할 때'],
    avoidWhen: ['전날/당일 통증 신호', '더위로 심박이 쉽게 오를 때'],
    progressionTrigger: '후반 급락 없이 마치고 다음날 회복주가 잘 눌리면 거리 소폭 증가'
  },
  {
    id: 'steady-long',
    name: 'Steady Long',
    phase: 'Build',
    sessionType: 'Steady Long',
    purpose: '롱런 안에서 목표 지속력과 후반 효율 확보',
    workout: ['초반 Easy', '후반 자연스러운 Steady', '무리한 레이스 페이스 금지'],
    useWhen: ['토요일 Steady Long 주차', 'LSD와 회복이 안정된 뒤'],
    avoidWhen: ['최근 Tempo가 흔들렸을 때', '회복/부상 게이트가 watch 이상일 때'],
    progressionTrigger: '후반 효율과 다음날 회복이 안정되면 Steady 구간을 아주 조금 확장'
  },
  {
    id: '5k-check',
    name: '5km TT 체크',
    phase: 'Threshold',
    sessionType: 'Race',
    purpose: '10km 예측과 훈련 단계 점검',
    workout: ['충분한 워밍업', '5km 지속 가능한 최고 노력', '회복 주간 안에서 배치'],
    useWhen: ['2~3주 이상 루틴 소화와 회복이 안정적일 때', '목표 예상 업데이트 근거가 필요할 때'],
    avoidWhen: ['통증/피로 신호가 있을 때', '최근 강훈련이 누적됐을 때'],
    progressionTrigger: '예상 기록과 회복 반응을 보고 Tempo/Long Run 처방을 재조정'
  },
  {
    id: 'cruise-interval',
    name: 'Cruise Interval',
    phase: 'Threshold',
    sessionType: 'Tempo',
    purpose: '연속 Tempo 전 단계 또는 Tempo 품질 상향',
    workout: ['짧은 Tempo 반복', '반복 사이 짧은 회복', '심박 상한 165 유지'],
    useWhen: ['연속 Tempo가 안정됐지만 더 긴 지속주가 부담될 때'],
    avoidWhen: ['초반부터 심박이 튈 때', '회복이 충분하지 않을 때'],
    progressionTrigger: '반복별 심박 상한과 페이스 안정성이 확인되면 연속 Tempo 지속 시간으로 연결'
  }
]

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
      normalizedAreas: [{ areaId: 'left-hamstring', painLevel: null }],
      status: 'monitoring',
      severity: null,
      onsetDate: null,
      lastFlareDate: null,
      lastCheckedAt: null,
      resolvedAt: null,
      checkInHistory: [],
      notes: '과거 이슈. 강훈련/롱런 뒤 뻣뻣함 여부 확인.',
      managementPlan: '통증 단정 없이 피로 누적 신호를 보수적으로 관찰한다.',
      triggers: ['템포/롱런 다음날 뻣뻣함', '볼륨 급증'],
      restrictions: ['통증이 있으면 스트라이드와 템포를 줄인다', '롱런 후 회복 반응을 먼저 확인한다'],
      returnToRunCriteria: '다음날 뻣뻣함이나 통증 신호 없이 Easy 조깅이 편하게 느껴질 때 강도를 올린다.',
      strengthPlan: ['둔근 브리지 8~10회 x 2세트', '힙힌지 패턴 연습', '통증이 있으면 빠른 가속/스트라이드 생략'],
      strengthPlanDetails: createConservativeStrengthPlanDetails([{ areaId: 'left-hamstring', painLevel: null }]),
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
    personalBests: [],
    runnerLevel: 'auto',
    maxHeartRate: null,
    restingHeartRate: null,
    lactateThresholdHr: null,
    heartRateMode: 'auto',
    vo2Max: null,
    vo2MaxSampleDate: null,
    vo2MaxSource: null
  },
  adaptiveTrainingProfile: {
    methodologyVersion: 'pacelab-2026-05-v1',
    updatedAt: null,
    trainingPhase: defaultTrainingPhase,
    progressionCriteria: defaultProgressionCriteria,
    prescriptionTemplates: defaultPrescriptionTemplates,
    compliancePatterns: [],
    sessionGuides: []
  },
  runnerIdentity: {
    strengths: [
      {
        label: 'Easy 기반을 꾸준히 쌓는 러너',
        evidence: ['기본 루틴이 Easy, Tempo, Long Run 조합으로 구성되어 있음'],
        confidence: 0.62,
        source: 'coach',
        updatedAt: null
      }
    ],
    weaknesses: [
      {
        label: '강훈련/롱런 뒤 햄스트링 반응을 보수적으로 확인해야 함',
        evidence: ['좌측 근위부 햄스트링 monitoring 항목이 있음'],
        confidence: 0.72,
        source: 'user',
        updatedAt: null
      }
    ],
    riskFactors: [
      {
        label: '더위에서 심박이 쉽게 오를 수 있음',
        evidence: ['knownIssues와 heatStrategy에 더위 대응 기준이 있음'],
        confidence: 0.7,
        source: 'user',
        updatedAt: null
      }
    ],
    coachingStyle: ['부상 예방 우선', '장기 성장 중심', '페이스보다 심박/RPE 우선']
  },
  coachBeliefs: [],
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
      ...(memory?.athleteProfile ?? {}),
      runnerLevel: normalizeRunnerLevelSetting(memory?.athleteProfile?.runnerLevel),
      maxHeartRate: normalizeHeartRateInput(memory?.athleteProfile?.maxHeartRate),
      restingHeartRate: normalizeHeartRateInput(memory?.athleteProfile?.restingHeartRate),
      lactateThresholdHr: normalizeHeartRateInput(memory?.athleteProfile?.lactateThresholdHr),
      heartRateMode: normalizeHeartRateMode(memory?.athleteProfile?.heartRateMode),
      vo2Max: normalizeVo2Max(memory?.athleteProfile?.vo2Max),
      vo2MaxSampleDate: normalizeIsoDateOrNull(memory?.athleteProfile?.vo2MaxSampleDate),
      vo2MaxSource: normalizeVo2MaxSource(memory?.athleteProfile?.vo2MaxSource)
    },
    adaptiveTrainingProfile: normalizeAdaptiveTrainingProfile(memory?.adaptiveTrainingProfile),
    runnerIdentity: normalizeRunnerIdentity(memory?.runnerIdentity ?? base.runnerIdentity, memory ?? base),
    coachBeliefs: normalizeCoachBeliefs(memory?.coachBeliefs ?? base.coachBeliefs)
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
    weeklyPattern: stripStaleHeartRateCeilingsList(merged.weeklyPattern ?? []),
    goals,
    activeGoalId,
    injuryItems,
    activeInjuryItemId,
    goal: activeGoal.title
  }
}

function normalizeRunnerLevelSetting(value: unknown): RunnerLevelSetting {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced' ? value : 'auto'
}

function normalizeHeartRateMode(value: unknown): 'auto' | 'manual' {
  return value === 'manual' ? 'manual' : 'auto'
}

// 처방/루틴 텍스트에 과거 개발자 상수로 박힌 심박 상한 숫자(회복 130 / 이지 145 / 템포 165·168)를 일반 표현으로 치환한다.
// 처방·루틴은 항상 최신본만 저장되므로(이력 없음) 안전하게 정규화한다. 실제 숫자는 표시/코칭 시 개인 heartRateModel에서 가져온다.
const STALE_HEART_RATE_CEILINGS = new Map<string, string>([
  ['130', '회복 상한'],
  ['145', '이지 상한'],
  ['165', '템포 상한'],
  ['168', '템포 상한']
])
export function stripStaleHeartRateCeilings(text: string): string {
  if (!text || !/\d/.test(text)) return text
  return text
    // "165bpm", "최대 심박 145bpm" 등 → bpm 동반 숫자
    .replace(/(\d{2,3})\s*bpm/gi, (match, num: string) => STALE_HEART_RATE_CEILINGS.get(num) ?? match)
    // "심박 165", "최대 심박 145", "max HR 130"
    .replace(/((?:최대\s*)?심박|max\s*hr)\s*(\d{2,3})/gi, (match, keyword: string, num: string) =>
      STALE_HEART_RATE_CEILINGS.has(num) ? `${keyword} ${STALE_HEART_RATE_CEILINGS.get(num)}` : match)
    // "165 이하", "165 초과", "165 상한", "165를 넘", "165 넘기지"
    .replace(/(\d{2,3})(\s*(?:이하|초과|상한)|\s*를?\s*넘기?지?)/g, (match, num: string, rest: string) =>
      STALE_HEART_RATE_CEILINGS.has(num) ? `${STALE_HEART_RATE_CEILINGS.get(num)}${rest}` : match)
}

function stripStaleHeartRateCeilingsList(items: string[]): string[] {
  return items.map((item) => stripStaleHeartRateCeilings(item))
}

// 개인 심박 입력은 30~240bpm 범위의 유한한 양수만 허용하고, 그 외(빈 문자열/0/비정상값)는 미입력(null)으로 본다.
function normalizeHeartRateInput(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.round(num)
  return rounded >= 30 && rounded <= 240 ? rounded : null
}

// VO2max는 mL/kg·min. 사람 러너의 현실 범위(약 15~95)만 허용하고, 그 외/비정상은 미입력(null)으로 본다.
// 소수 한 자리까지 유지한다(Apple Watch는 42.5 같은 값을 보고).
function normalizeVo2Max(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  const rounded = Math.round(num * 10) / 10
  return rounded >= 15 && rounded <= 95 ? rounded : null
}

function normalizeVo2MaxSource(value: unknown): 'healthkit' | 'manual' | null {
  return value === 'healthkit' || value === 'manual' ? value : null
}

// ISO 날짜/시각 문자열만 통과시키고, 파싱 불가하면 null.
function normalizeIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : value
}

function normalizeRunnerIdentity(value: unknown, memory: Partial<TrainingMemory> | null | undefined): RunnerIdentity {
  const raw = value && typeof value === 'object' ? value as Partial<RunnerIdentity> : {}
  const strengths = normalizeRunnerIdentityTraits(raw.strengths, 10)
  const weaknesses = normalizeRunnerIdentityTraits(raw.weaknesses, 10)
  const riskFactors = normalizeRunnerIdentityTraits(raw.riskFactors, 10)
  const legacyRisks = normalizeStringArray(memory?.knownIssues)
    .map((label) => createRunnerIdentityTrait(label, 'user', 0.68))
  const legacyStyles = normalizeStringArray(memory?.runningStyle)
    .map((label) => createRunnerIdentityTrait(label, 'user', 0.66))
  const heatStyle = normalizeStringArray(memory?.heatStrategy)

  return {
    strengths: mergeRunnerIdentityTraits(strengths, legacyStyles, 10),
    weaknesses,
    riskFactors: mergeRunnerIdentityTraits(riskFactors, legacyRisks, 10),
    coachingStyle: mergeUniqueStrings(normalizeStringArray(raw.coachingStyle), heatStyle, 12)
  }
}

function normalizeRunnerIdentityTraits(value: unknown, limit: number): RunnerIdentityTrait[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return createRunnerIdentityTrait(item, 'coach', 0.62)
      if (!item || typeof item !== 'object') return null
      const raw = item as Partial<RunnerIdentityTrait>
      const label = typeof raw.label === 'string' ? raw.label.trim() : ''
      if (!label) return null
      return {
        label,
        evidence: normalizeStringArray(raw.evidence).slice(0, 6),
        confidence: normalizeConfidence(raw.confidence, 0.65),
        source: normalizeMemorySource(raw.source),
        updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
      }
    })
    .filter((item): item is RunnerIdentityTrait => Boolean(item))
    .slice(0, limit)
}

function createRunnerIdentityTrait(label: string, source: RunnerIdentityTrait['source'], confidence: number): RunnerIdentityTrait {
  return {
    label: label.trim(),
    evidence: [],
    confidence,
    source,
    updatedAt: null
  }
}

function mergeRunnerIdentityTraits(next: RunnerIdentityTrait[], current: RunnerIdentityTrait[], limit: number) {
  const byKey = new Map<string, RunnerIdentityTrait>()
  for (const trait of [...current, ...next]) {
    const key = trait.label.replace(/\s+/g, '').toLowerCase()
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing || trait.confidence >= existing.confidence) {
      byKey.set(key, {
        ...trait,
        evidence: mergeUniqueStrings(trait.evidence, existing?.evidence ?? [], 6),
        confidence: Math.max(trait.confidence, existing?.confidence ?? 0)
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

function normalizeCoachBeliefs(value: unknown): CoachBelief[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeCoachBelief)
    .filter((item): item is CoachBelief => Boolean(item))
    .filter((belief) => belief.status !== 'retired')
    .sort((a, b) => b.confidence - a.confidence || b.supportCount - a.supportCount)
    .slice(0, 30)
}

function normalizeCoachBelief(value: unknown): CoachBelief | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<CoachBelief>
  const belief = typeof raw.belief === 'string' ? raw.belief.trim() : ''
  if (!belief) return null
  const supportCount = Number.isFinite(raw.supportCount) ? Math.max(0, Math.round(Number(raw.supportCount))) : 1
  const confidence = normalizeConfidence(raw.confidence, supportCount >= 2 ? 0.68 : 0.58)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `belief-${belief.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase().slice(0, 48)}`,
    belief,
    category: normalizeBeliefCategory(raw.category),
    confidence,
    supportCount,
    contradictionCount: Number.isFinite(raw.contradictionCount) ? Math.max(0, Math.round(Number(raw.contradictionCount))) : 0,
    evidenceRunIds: normalizeStringArray(raw.evidenceRunIds).slice(0, 10),
    status: normalizeBeliefStatus(raw.status, confidence, supportCount),
    source: normalizeMemorySource(raw.source),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null
  }
}

function normalizeConfidence(value: unknown, fallback: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(0, Math.min(1, Math.round(numberValue * 100) / 100))
}

function normalizeMemorySource(value: unknown): RunnerIdentityTrait['source'] {
  return value === 'engine' || value === 'coach' || value === 'user' || value === 'mixed' ? value : 'coach'
}

function normalizeBeliefCategory(value: unknown): CoachBelief['category'] {
  return value === 'recovery' ||
    value === 'injury' ||
    value === 'load' ||
    value === 'pacing' ||
    value === 'routine' ||
    value === 'weather' ||
    value === 'preference' ||
    value === 'other'
    ? value
    : 'other'
}

function normalizeBeliefStatus(value: unknown, confidence: number, supportCount: number): CoachBelief['status'] {
  if (value === 'retired') return 'retired'
  if (value === 'confirmed' || confidence >= 0.82 || supportCount >= 3) return 'confirmed'
  return 'candidate'
}

function mergeUniqueStrings(next: string[], current: string[], limit: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of [...next, ...current]) {
    const text = item.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= limit) break
  }
  return result
}

function normalizeAdaptiveTrainingProfile(value: unknown): AdaptiveTrainingProfile {
  const raw = value && typeof value === 'object' ? value as Partial<AdaptiveTrainingProfile> : {}
  const sessionGuides = Array.isArray(raw.sessionGuides)
    ? raw.sessionGuides
        .map((guide) => normalizeAdaptiveSessionGuide(guide as Partial<AdaptiveSessionGuide>))
        .filter((guide): guide is AdaptiveSessionGuide => Boolean(guide))
        .slice(0, 12)
    : []

  return {
    methodologyVersion: typeof raw.methodologyVersion === 'string' && raw.methodologyVersion ? raw.methodologyVersion : 'pacelab-2026-05-v1',
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : null,
    trainingPhase: normalizeTrainingPhase(raw.trainingPhase),
    progressionCriteria: normalizeProgressionCriteria(raw.progressionCriteria),
    prescriptionTemplates: normalizePrescriptionTemplates(raw.prescriptionTemplates),
    compliancePatterns: Array.isArray(raw.compliancePatterns)
      ? raw.compliancePatterns.filter((item) => typeof item === 'string' && item.trim()).map((item) => stripStaleHeartRateCeilings(item.trim())).slice(0, 20)
      : [],
    sessionGuides
  }
}

function normalizeTrainingPhase(value: unknown): TrainingPhasePlan {
  const raw = value && typeof value === 'object' ? value as Partial<TrainingPhasePlan> : {}
  const currentPhase = normalizeTrainingPhaseName(raw.currentPhase, defaultTrainingPhase.currentPhase) ?? defaultTrainingPhase.currentPhase
  return {
    currentPhase,
    startedAt: typeof raw.startedAt === 'string' && raw.startedAt ? raw.startedAt : null,
    goal: typeof raw.goal === 'string' && raw.goal.trim() ? raw.goal.trim() : defaultTrainingPhase.goal,
    focus: normalizeStringArray(raw.focus).slice(0, 8).length ? normalizeStringArray(raw.focus).slice(0, 8) : [...defaultTrainingPhase.focus],
    nextPhase: normalizeTrainingPhaseName(raw.nextPhase, defaultTrainingPhase.nextPhase),
    reviewAfter: typeof raw.reviewAfter === 'string' && raw.reviewAfter.trim() ? raw.reviewAfter.trim() : defaultTrainingPhase.reviewAfter
  }
}

function normalizeTrainingPhaseName(value: unknown, fallback: TrainingPhaseName | null): TrainingPhaseName | null {
  return value === 'Base' || value === 'Build' || value === 'Threshold' || value === 'Race Specific' || value === 'Taper' || value === 'Recovery'
    ? value
    : fallback
}

function normalizeProgressionCriteria(value: unknown): ProgressionCriterion[] {
  if (!Array.isArray(value)) return cloneMemory(defaultProgressionCriteria)
  const items = value
    .map((item, index) => normalizeProgressionCriterion(item as Partial<ProgressionCriterion>, index))
    .filter((item): item is ProgressionCriterion => Boolean(item))
    .slice(0, 12)
  return items.length ? items : cloneMemory(defaultProgressionCriteria)
}

function normalizeProgressionCriterion(value: Partial<ProgressionCriterion>, index: number): ProgressionCriterion | null {
  const label = typeof value.label === 'string' ? value.label.trim() : ''
  const evidence = typeof value.evidence === 'string' ? value.evidence.trim() : ''
  const action = typeof value.action === 'string' ? value.action.trim() : ''
  if (!label || !evidence || !action) return null
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `criterion-${index + 1}`,
    label,
    status: normalizeProgressionStatus(value.status),
    evidence: stripStaleHeartRateCeilings(evidence),
    action: stripStaleHeartRateCeilings(action)
  }
}

function normalizeProgressionStatus(value: unknown): ProgressionCriterion['status'] {
  return value === 'ready' || value === 'blocked' || value === 'watch' ? value : 'watch'
}

function normalizePrescriptionTemplates(value: unknown): PrescriptionTemplate[] {
  if (!Array.isArray(value)) return cloneMemory(defaultPrescriptionTemplates)
  const items = value
    .map((item, index) => normalizePrescriptionTemplate(item as Partial<PrescriptionTemplate>, index))
    .filter((item): item is PrescriptionTemplate => Boolean(item))
    .slice(0, 20)
  return items.length ? items : cloneMemory(defaultPrescriptionTemplates)
}

function normalizePrescriptionTemplate(value: Partial<PrescriptionTemplate>, index: number): PrescriptionTemplate | null {
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const sessionType = typeof value.sessionType === 'string' ? value.sessionType.trim() : ''
  const purpose = typeof value.purpose === 'string' ? value.purpose.trim() : ''
  if (!name || !sessionType || !purpose) return null
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `template-${index + 1}`,
    name,
    phase: normalizePrescriptionTemplatePhase(value.phase),
    sessionType,
    purpose: stripStaleHeartRateCeilings(purpose),
    workout: stripStaleHeartRateCeilingsList(normalizeStringArray(value.workout).slice(0, 8)),
    useWhen: normalizeStringArray(value.useWhen).slice(0, 8),
    avoidWhen: stripStaleHeartRateCeilingsList(normalizeStringArray(value.avoidWhen).slice(0, 8)),
    progressionTrigger: stripStaleHeartRateCeilings(typeof value.progressionTrigger === 'string' ? value.progressionTrigger.trim() : '')
  }
}

function normalizePrescriptionTemplatePhase(value: unknown): PrescriptionTemplate['phase'] {
  return value === 'Any' ? value : normalizeTrainingPhaseName(value, 'Base') ?? 'Base'
}

function normalizeAdaptiveSessionGuide(value: Partial<AdaptiveSessionGuide>): AdaptiveSessionGuide | null {
  const type = typeof value.type === 'string' ? value.type.trim() : ''
  const boundary = typeof value.boundary === 'string' ? value.boundary.trim() : ''
  const evidence = typeof value.evidence === 'string' ? value.evidence.trim() : ''
  if (!type || !boundary || !evidence) return null
  return {
    type,
    boundary: stripStaleHeartRateCeilings(boundary),
    adjustment: normalizeAdaptiveAdjustment(value.adjustment),
    evidence: stripStaleHeartRateCeilings(evidence),
    nextCheck: stripStaleHeartRateCeilings(typeof value.nextCheck === 'string' ? value.nextCheck.trim() : '')
  }
}

function normalizeAdaptiveAdjustment(value: unknown): AdaptiveSessionGuide['adjustment'] {
  return value === 'raise' || value === 'lower' || value === 'watch' || value === 'maintain' ? value : 'watch'
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
  const legacyArea = typeof item.area === 'string' ? item.area : ''
  const normalizedAreas = normalizeInjuryAreaSelections(item.normalizedAreas, legacyArea)
  const area = summarizeInjuryAreas(normalizedAreas) || legacyArea
  const strengthPlan = normalizeStringArray(item.strengthPlan)
  const strengthPlanDetails = normalizeStrengthPlanDetails(
    (item as { strengthPlanDetails?: unknown }).strengthPlanDetails,
    normalizedAreas,
    strengthPlan
  )
  const checkInHistory = normalizeInjuryCheckIns((item as { checkInHistory?: unknown }).checkInHistory, normalizedAreas)
  const lastCheckedAt = normalizeNullableDate((item as { lastCheckedAt?: unknown }).lastCheckedAt)
    ?? checkInHistory[0]?.checkedAt
    ?? null
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `injury-${index + 1}`,
    title,
    area,
    normalizedAreas,
    status: normalizeInjuryStatus(item.status),
    severity: deriveInjurySeverity(normalizedAreas, item.severity),
    onsetDate: typeof item.onsetDate === 'string' && item.onsetDate ? item.onsetDate : null,
    lastFlareDate: typeof item.lastFlareDate === 'string' && item.lastFlareDate ? item.lastFlareDate : null,
    lastCheckedAt,
    resolvedAt: normalizeNullableDate((item as { resolvedAt?: unknown }).resolvedAt),
    checkInHistory,
    notes: typeof item.notes === 'string' ? item.notes : '',
    managementPlan: typeof item.managementPlan === 'string' && item.managementPlan.trim() ? item.managementPlan : createInjuryManagementPlan(normalizedAreas),
    triggers: normalizeStringArray(item.triggers),
    restrictions: normalizeStringArray(item.restrictions).length ? normalizeStringArray(item.restrictions) : createInjuryRestrictions(normalizedAreas),
    returnToRunCriteria: typeof item.returnToRunCriteria === 'string' && item.returnToRunCriteria.trim() ? item.returnToRunCriteria : createReturnToRunCriteria(normalizedAreas),
    strengthPlan: strengthPlan.length ? strengthPlan : createConservativeStrengthPlan(normalizedAreas),
    strengthPlanDetails,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now
  }
}

function normalizeInjuryStatus(value: unknown): TrainingInjuryItem['status'] {
  return value === 'active' || value === 'resolved' || value === 'archived' || value === 'monitoring' ? value : 'monitoring'
}

function normalizeNullableNumber(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeInjuryCheckIns(value: unknown, fallbackAreas: InjuryAreaSelection[]): TrainingInjuryCheckIn[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index) => normalizeInjuryCheckIn(item, index, fallbackAreas))
    .filter((item): item is TrainingInjuryCheckIn => Boolean(item))
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    .slice(0, 30)
}

function normalizeInjuryCheckIn(value: unknown, index: number, fallbackAreas: InjuryAreaSelection[]): TrainingInjuryCheckIn | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<TrainingInjuryCheckIn>
  const checkedAt = normalizeNullableDate(raw.checkedAt)
  if (!checkedAt) return null
  const areaPainLevels = normalizeInjuryAreaSelections(raw.areaPainLevels)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `check-in-${index + 1}`,
    checkedAt,
    painLevel: normalizePainLevel(raw.painLevel),
    areaPainLevels: areaPainLevels.length ? areaPainLevels : fallbackAreas,
    worsenedDuringOrAfterRun: normalizeNullableBoolean(raw.worsenedDuringOrAfterRun),
    dailyActivityPain: normalizeNullableBoolean(raw.dailyActivityPain),
    readyForQualitySession: normalizeNullableBoolean(raw.readyForQualitySession),
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    source: normalizeCheckInSource(raw.source)
  }
}

function normalizeStrengthPlanDetails(value: unknown, normalizedAreas: InjuryAreaSelection[], legacyPlan: string[]): TrainingStrengthPlanDetail[] {
  if (Array.isArray(value)) {
    const items = value
      .map((item, index) => normalizeStrengthPlanDetail(item, index))
      .filter((item): item is TrainingStrengthPlanDetail => Boolean(item))
      .slice(0, 12)
    if (items.length) return items
  }

  if (legacyPlan.length) {
    return legacyPlan.slice(0, 12).map((instruction, index) => ({
      id: `legacy-strength-${index + 1}`,
      title: instruction.split(':')[0]?.trim() || `보강운동 ${index + 1}`,
      targetAreaIds: normalizedAreas.map((area) => area.areaId),
      purpose: '기존 문자열 보강운동 처방을 구조화 계약에 맞춰 보존한다.',
      instruction,
      useWhen: '통증 0~2/5이고 다음날 악화가 없을 때',
      stopWhen: '통증이 커지거나 일상 보행 통증, 저림, 붓기, 날카로운 통증이 있을 때',
      progression: '사용자 체크인에서 악화가 없을 때만 세트 수나 강도를 소폭 조정한다.',
      sources: [internalStrengthPlanSource]
    }))
  }

  return createConservativeStrengthPlanDetails(normalizedAreas)
}

function normalizeStrengthPlanDetail(value: unknown, index: number): TrainingStrengthPlanDetail | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<TrainingStrengthPlanDetail>
  const instruction = typeof raw.instruction === 'string' ? raw.instruction.trim() : ''
  if (!instruction) return null
  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .map((source) => normalizeStrengthPlanSource(source))
        .filter((source): source is TrainingStrengthPlanSource => Boolean(source))
        .slice(0, 5)
    : []
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `strength-${index + 1}`,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `보강운동 ${index + 1}`,
    targetAreaIds: normalizeStringArray(raw.targetAreaIds).slice(0, 12),
    purpose: typeof raw.purpose === 'string' ? raw.purpose.trim() : '',
    instruction,
    useWhen: typeof raw.useWhen === 'string' ? raw.useWhen.trim() : '',
    stopWhen: typeof raw.stopWhen === 'string' ? raw.stopWhen.trim() : '',
    progression: typeof raw.progression === 'string' ? raw.progression.trim() : '',
    sources: sources.length ? sources : [internalStrengthPlanSource]
  }
}

function normalizeStrengthPlanSource(value: unknown): TrainingStrengthPlanSource | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<TrainingStrengthPlanSource>
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return null
  return {
    type: normalizeStrengthPlanSourceType(raw.type),
    title,
    organization: typeof raw.organization === 'string' ? raw.organization.trim() : '',
    url: typeof raw.url === 'string' ? raw.url.trim() : '',
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    trainingKnowledgeId: typeof raw.trainingKnowledgeId === 'string' && raw.trainingKnowledgeId.trim() ? raw.trainingKnowledgeId.trim() : null
  }
}

function normalizeStrengthPlanSourceType(value: unknown): TrainingStrengthPlanSource['type'] {
  return value === 'training_knowledge' || value === 'external_reference' || value === 'user_note' || value === 'internal_baseline'
    ? value
    : 'internal_baseline'
}

function normalizeCheckInSource(value: unknown): TrainingInjuryCheckIn['source'] {
  return value === 'coach_suggestion' || value === 'manual_edit' || value === 'user_check_in' ? value : 'user_check_in'
}

function normalizePainLevel(value: unknown): number | null {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return null
  return Math.min(5, Math.max(0, Math.round(numberValue)))
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function normalizeNullableDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

const internalStrengthPlanSource: TrainingStrengthPlanSource = {
  type: 'internal_baseline',
  title: 'PaceLAB 보수적 러닝 부하 조절 기준',
  organization: 'PaceLAB',
  url: '',
  summary: '의료 처방이 아니라 통증 0~2/5 범위에서만 보강운동을 허용하고 악화 시 축소/중단하는 앱 내부 안전 기준이다.',
  trainingKnowledgeId: null
}

function cloneMemory<T>(memory: T): T {
  return JSON.parse(JSON.stringify(memory))
}

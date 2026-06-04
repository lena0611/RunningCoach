<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import type { TrainingGoal, TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import {
  createConservativeStrengthPlan,
  createConservativeStrengthPlanDetails,
  createInjuryManagementPlan,
  createReturnToRunCriteria,
  createInjuryRestrictions,
  deriveInjurySeverity,
  summarizeInjuryAreas,
  type InjuryAreaSelection
} from '@/entities/training-memory/injuryAreas'
import type { TrainingKnowledgeCatalog, TrainingKnowledgeRequest, TrainingMethod } from '@/entities/training-knowledge/model'
import { formatDateWithWeekday, formatDuration } from '@/shared/lib/format'
import { RUNNER_LEVEL_LABEL, resolveRunnerLevel } from '@/shared/lib/runnerLevel'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import { createTrainingKnowledgeRequest, fetchTrainingKnowledgeCatalog } from '@/shared/api/trainingKnowledgeRepository'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import DateField from '@/shared/ui/DateField.vue'
import FormGrid from '@/shared/ui/FormGrid.vue'
import InfoPairGrid from '@/shared/ui/InfoPairGrid.vue'
import InjuryBodySelector from '@/shared/ui/InjuryBodySelector.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import SchedulingHelpSheet from '@/shared/ui/SchedulingHelpSheet.vue'

type MemoryPanel = 'overview' | 'goals' | 'goal-edit' | 'goal-new' | 'injuries' | 'injury-edit' | 'injury-new' | 'knowledge' | 'knowledge-request'

const memoryStore = useMemoryStore()
const runStore = useRunStore()
const route = useRoute()
const draft = reactive<TrainingMemory>(JSON.parse(JSON.stringify(memoryStore.memory)))
const stack = ref<MemoryPanel[]>([])
const stackContentRef = ref<HTMLElement | null>(null)
const stackScroll = reactive<Record<string, number>>({})
const editingGoalId = ref('')
const editingInjuryId = ref('')
const memorySnapshot = ref(JSON.stringify(draft))
const saving = ref(false)
const error = ref('')
const pendingDelete = ref<{ kind: 'goal' | 'injury'; id: string; title: string } | null>(null)
const schedulingHelpOpen = ref(false)
const stackTransitionName = ref('stack-slide-forward')
const knowledge = ref<TrainingKnowledgeCatalog>({ sources: [], methods: [], rules: [], requests: [] })
const knowledgeLoading = ref(false)
const knowledgeError = ref('')
const knowledgeRequestSaved = ref(false)
const newGoal = reactive({
  title: '',
  category: 'race' as TrainingGoal['category'],
  startDate: null as string | null,
  targetDate: null as string | null,
  distanceKm: null as number | null,
  targetDurationSec: null as number | null,
  priority: 1,
  successCriteria: '',
  strategyNotes: '',
  notes: ''
})
const newInjury = reactive({
  title: '',
  area: '',
  normalizedAreas: [] as InjuryAreaSelection[],
  status: 'monitoring' as TrainingInjuryItem['status'],
  severity: null as number | null,
  onsetDate: null as string | null,
  lastFlareDate: null as string | null,
  lastCheckedAt: null as string | null,
  resolvedAt: null as string | null,
  checkInHistory: [] as TrainingInjuryItem['checkInHistory'],
  notes: '',
  managementPlan: '',
  triggers: [] as string[],
  restrictions: [] as string[],
  returnToRunCriteria: '',
  strengthPlan: [] as string[],
  strengthPlanDetails: [] as TrainingInjuryItem['strengthPlanDetails']
})
const newKnowledgeRequest = reactive({
  title: '',
  sourceUrl: '',
  inputText: ''
})
const deleteSheetDrag = useBottomSheetDrag(() => {
  pendingDelete.value = null
})

const goalCategoryOptions = [
  { value: 'race', label: '기록 목표' },
  { value: 'fitness', label: '체력 목표' },
  { value: 'health', label: '건강/부상관리' },
  { value: 'habit', label: '습관 목표' },
  { value: 'maintenance', label: '유지 목표' }
]
const goalStatusOptions = [
  { value: 'active', label: '진행 중' },
  { value: 'paused', label: '보류' },
  { value: 'completed', label: '완료' },
  { value: 'archived', label: '보관' }
]
const injuryStatusOptions = [
  { value: 'active', label: '현재 관리 중' },
  { value: 'monitoring', label: '관찰 중' },
  { value: 'resolved', label: '해소됨' },
  { value: 'archived', label: '보관' }
]

const activeGoal = computed(() => draft.goals.find((goal) => goal.id === draft.activeGoalId) ?? draft.goals[0] ?? null)
const editingGoal = computed(() => draft.goals.find((goal) => goal.id === editingGoalId.value) ?? null)
const activeInjury = computed(() => {
  if (!draft.activeInjuryItemId) return draft.injuryItems.find((item) => item.status === 'active' || item.status === 'monitoring') ?? draft.injuryItems[0] ?? null
  return draft.injuryItems.find((item) => item.id === draft.activeInjuryItemId) ?? null
})
const editingInjury = computed(() => draft.injuryItems.find((item) => item.id === editingInjuryId.value) ?? null)
const secondaryGoals = computed(() => draft.goals
  .filter((goal) => goal.id !== activeGoal.value?.id && goal.status !== 'archived')
  .sort((a, b) => a.priority - b.priority)
)
const managedInjuries = computed(() => draft.injuryItems.filter((item) => item.status === 'active' || item.status === 'monitoring'))
const activeGoalMeta = computed(() => {
  if (!activeGoal.value) return '목표 없음'
  return [activeGoal.value.category, activeGoal.value.targetDate ? `${formatDateWithWeekday(activeGoal.value.targetDate)}까지` : '목표일 미정'].join(' · ')
})
const activeInjuryMeta = computed(() => {
  if (!activeInjury.value) return '관리 항목 없음'
  return [activeInjury.value.status, activeInjury.value.severity !== null ? `${activeInjury.value.severity}/5` : '강도 미입력'].join(' · ')
})
const panel = computed<MemoryPanel>(() => stack.value.at(-1) ?? 'overview')
const isStackOpen = computed(() => panel.value !== 'overview')
const isDirty = computed(() => JSON.stringify(draft) !== memorySnapshot.value)
const stackTitle = computed(() => {
  switch (panel.value) {
    case 'goals':
      return '목표 관리'
    case 'goal-new':
      return '새 목표'
    case 'goal-edit':
      return '목표 편집'
    case 'injuries':
      return '부상 관리'
    case 'injury-new':
      return '새 부상/주의사항'
    case 'injury-edit':
      return '부상/주의사항 편집'
    case 'knowledge':
      return '훈련 지식'
    case 'knowledge-request':
      return '지식화 검토 요청'
    default:
      return '코칭 메모리'
  }
})
const rulesByMethod = computed(() => {
  const groups = new Map<string, typeof knowledge.value.rules>()
  for (const rule of knowledge.value.rules) {
    if (!rule.methodId) continue
    groups.set(rule.methodId, [...(groups.get(rule.methodId) ?? []), rule])
  }
  return groups
})
const weeklyRoutineGuides = computed(() => draft.weeklyPattern.map((item) => ({
  item,
  ...getWeeklyRoutineGuide(item)
})))
const trainingPhase = computed(() => draft.adaptiveTrainingProfile.trainingPhase)
const progressionCriteria = computed(() => draft.adaptiveTrainingProfile.progressionCriteria)
const prescriptionTemplates = computed(() => draft.adaptiveTrainingProfile.prescriptionTemplates)
const runnerLevelFact = computed(() => {
  const derived = resolveRunnerLevel(draft.athleteProfile, runStore.sortedRuns)
  const label = RUNNER_LEVEL_LABEL[derived.level]
  return derived.source === 'manual' ? `${label} (직접 설정)` : `${label} (자동)`
})
const HEART_RATE_SOURCE_LABEL: Record<string, string> = {
  lthr: '역치심박(직접 입력)',
  measured_max: '측정 최대심박(직접 입력)',
  observed_data: '누적 기록 추정',
  age_estimated: '나이 추정',
  age_data_corrected: '나이 + 누적 기록 보정',
  insufficient: '미설정'
}
const heartRateModelFact = computed(() => {
  const observed = deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  const model = deriveHeartRateModel(draft.athleteProfile, new Date().getFullYear(), observed)
  if (model.tempoCeilingBpm === null) return '미설정 (나이 또는 심박 입력 필요)'
  return `템포 ${model.tempoCeilingBpm} · 이지 ${model.easyCeilingBpm}bpm (${HEART_RATE_SOURCE_LABEL[model.source] ?? model.source})`
})
const profileFacts = computed(() => [
  { label: '러너', value: memoryStore.selectedUser.name || '기본 사용자' },
  { label: '출생연도', value: draft.athleteProfile.birthYear ? `${draft.athleteProfile.birthYear}` : '미입력' },
  { label: '성별', value: sexLabel(draft.athleteProfile.sex) },
  { label: '러닝 경력', value: formatExperience(draft.athleteProfile.runningExperienceMonths) },
  { label: '러너 레벨', value: runnerLevelFact.value },
  { label: '주간 목표', value: draft.athleteProfile.weeklyRunDaysTarget ? `${draft.athleteProfile.weeklyRunDaysTarget}회` : '미입력' },
  { label: '롱런 요일', value: draft.athleteProfile.preferredLongRunDay || '미입력' },
  { label: '템포 상한', value: heartRateModelFact.value }
])
const personalBestPreview = computed(() => draft.athleteProfile.personalBests
  .slice(0, 4)
  .map((pb) => `${pb.distanceKm}km · ${formatDuration(pb.durationSec)} · ${formatDateWithWeekday(pb.date)}`)
)
const aiMemoryCount = computed(() => draft.knownIssues.length + draft.runningStyle.length + draft.heatStrategy.length + draft.aiNotes.length)

watch(
  () => memoryStore.selectedUserId,
  () => {
    syncDraftFromStore()
    stack.value = []
    editingGoalId.value = ''
    editingInjuryId.value = ''
  }
)

watch(
  () => memoryStore.selectedUser.updatedAt,
  () => {
    if (isDirty.value) return
    syncDraftFromStore()
  }
)

watch(
  () => route.query.panel,
  () => openRoutePanel(),
  { immediate: true }
)

watch(isStackOpen, (open) => {
  document.body.classList.toggle('memory-stack-open', open)
})

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
})

function join(items: string[]) {
  return items.join('\n')
}

function syncDraftFromStore() {
  Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
  memorySnapshot.value = JSON.stringify(draft)
}

function sexLabel(value: TrainingMemory['athleteProfile']['sex']) {
  switch (value) {
    case 'male':
      return '남성'
    case 'female':
      return '여성'
    case 'other':
      return '기타'
    default:
      return '미입력'
  }
}

function formatExperience(months: number | null) {
  if (months === null) return '미입력'
  if (months < 12) return '1년 미만'
  const years = Math.floor(months / 12)
  return `${years}년`
}

function goalDateMeta(goal: TrainingGoal) {
  return goal.targetDate ? ` · ${formatDateWithWeekday(goal.targetDate)}까지` : ''
}

function injuryDateMeta(item: TrainingInjuryItem) {
  if (item.lastCheckedAt) return ` · 체크 ${formatDateWithWeekday(item.lastCheckedAt.slice(0, 10))}`
  if (item.lastFlareDate) return ` · 최근 ${formatDateWithWeekday(item.lastFlareDate)}`
  if (item.onsetDate) return ` · 시작 ${formatDateWithWeekday(item.onsetDate)}`
  return ''
}

function injuryAreaMeta(item: TrainingInjuryItem) {
  if (item.normalizedAreas?.length) return summarizeInjuryAreas(item.normalizedAreas)
  return item.area || '부위 미지정'
}

function split(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function syncLegacyGoal() {
  if (activeGoal.value) draft.goal = activeGoal.value.title
}

function openGoals() {
  pushPanel('goals')
}

function openRoutePanel() {
  const target = route.query.panel
  if (target === 'goals' && panel.value !== 'goals') {
    stack.value = ['goals']
    return
  }
  if (target === 'injuries' && panel.value !== 'injuries') {
    if (route.query.new === '1') {
      stack.value = ['injuries']
      openInjuryNew()
      return
    }
    stack.value = ['injuries']
  }
}

function openGoalEdit(goalId: string) {
  saveCurrentStackScroll()
  editingGoalId.value = goalId
  pushPanel('goal-edit')
}

function openGoalNew() {
  Object.assign(newGoal, {
    title: '',
    category: 'race',
    startDate: null,
    targetDate: null,
    distanceKm: null,
    targetDurationSec: null,
    priority: draft.goals.length + 1,
    successCriteria: '',
    strategyNotes: '',
    notes: ''
  })
  pushPanel('goal-new')
}

function addGoal() {
  const title = newGoal.title.trim()
  if (!title) return
  const now = new Date().toISOString()
  const goal: TrainingGoal = {
    id: crypto.randomUUID(),
    title,
    category: newGoal.category,
    startDate: newGoal.startDate || null,
    targetDate: newGoal.targetDate || null,
    distanceKm: newGoal.distanceKm,
    targetDurationSec: newGoal.targetDurationSec,
    priority: newGoal.priority || draft.goals.length + 1,
    status: 'active',
    successCriteria: newGoal.successCriteria,
    strategyNotes: newGoal.strategyNotes,
    notes: newGoal.notes,
    createdAt: now,
    updatedAt: now
  }
  draft.goals.push(goal)
  draft.activeGoalId = goal.id
  draft.goal = goal.title
  editingGoalId.value = goal.id
  replaceTopPanel('goal-edit')
}

function updateGoal(goal: TrainingGoal) {
  goal.updatedAt = new Date().toISOString()
  syncLegacyGoal()
}

function setActiveGoal(goalId: string) {
  if (!draft.goals.some((goal) => goal.id === goalId)) return
  draft.activeGoalId = goalId
  syncLegacyGoal()
}

function removeGoal(goalId: string) {
  if (draft.goals.length <= 1) return
  draft.goals = draft.goals.filter((goal) => goal.id !== goalId)
  if (draft.activeGoalId === goalId) draft.activeGoalId = draft.goals[0]?.id ?? null
  syncLegacyGoal()
  replaceTopPanel('goals')
}

function askRemoveGoal(goal: TrainingGoal) {
  if (draft.goals.length <= 1) return
  pendingDelete.value = { kind: 'goal', id: goal.id, title: goal.title }
}

function openInjuries() {
  pushPanel('injuries')
}

function openKnowledge() {
  pushPanel('knowledge')
  void loadKnowledge()
}

function openKnowledgeRequest() {
  knowledgeRequestSaved.value = false
  Object.assign(newKnowledgeRequest, {
    title: '',
    sourceUrl: '',
    inputText: ''
  })
  pushPanel('knowledge-request')
}

async function loadKnowledge() {
  knowledgeLoading.value = true
  knowledgeError.value = ''
  try {
    knowledge.value = await fetchTrainingKnowledgeCatalog()
  } catch (err) {
    knowledgeError.value = err instanceof Error ? err.message : '훈련 지식을 불러오지 못했습니다.'
  } finally {
    knowledgeLoading.value = false
  }
}

async function submitKnowledgeRequest() {
  knowledgeLoading.value = true
  knowledgeError.value = ''
  knowledgeRequestSaved.value = false
  try {
    const request = await createTrainingKnowledgeRequest(newKnowledgeRequest)
    knowledge.value = {
      ...knowledge.value,
      requests: [request, ...knowledge.value.requests].slice(0, 20)
    }
    knowledgeRequestSaved.value = true
    replaceTopPanel('knowledge')
    void loadKnowledge()
  } catch (err) {
    knowledgeError.value = err instanceof Error ? err.message : '지식화 검토 요청을 저장하지 못했습니다.'
  } finally {
    knowledgeLoading.value = false
  }
}

function methodMeta(method: TrainingMethod) {
  const distances = method.targetDistances.length ? method.targetDistances.join(', ') : '거리 미지정'
  const days = method.weeklyDaysMin && method.weeklyDaysMax ? `주 ${method.weeklyDaysMin}~${method.weeklyDaysMax}회` : '주간 횟수 미지정'
  return `${distances} · ${days}`
}

function getWeeklyRoutineGuide(item: string) {
  const value = item.toLowerCase()
  if (value.includes('easy + strides') || value.includes('strides') || value.includes('스트라이드')) {
    return {
      title: 'Easy + Strides',
      metric: '현재: 145bpm 이하 + 짧은 가속',
      details: [
        '워밍업 10분',
        '20초 가속 + 1분40초 회복 x 8',
        '쿨다운 15분',
        '가속은 선명하게, 회복은 호흡이 내려오게',
        '데이터가 안정되면 AI가 횟수/강도를 조정'
      ]
    }
  }
  if (value.includes('tempo') || value.includes('템포')) {
    return {
      title: 'Tempo',
      metric: '현재: max 165bpm 넘기지 않기',
      details: [
        '페이스보다 최대 심박 상한 우선',
        '랩별 심박이 165를 넘는지 확인',
        '넘기면 다음 템포는 초반 진입을 낮춤',
        '잘 지키면 지속 시간/품질을 소폭 상향 검토'
      ]
    }
  }
  if (value.includes('recovery') || value.includes('회복')) {
    return {
      title: 'Recovery',
      metric: '현재: 130bpm 전후로 아주 낮게',
      details: [
        '거리 욕심 없이 회복 반응 확인',
        '전날 롱런/템포 피로를 풀어주는 목적',
        '통증/착지감이 조용한지 체크'
      ]
    }
  }
  if (value.includes('lsd') || value.includes('long') || value.includes('롱런')) {
    return {
      title: value.includes('steady') ? 'Steady Long' : 'Long Run',
      metric: '현재: 후반 심박 드리프트 관리',
      details: [
        '초반 억제',
        '후반 급락 없이 유지',
        '다음날 회복주 또는 휴식으로 반응 확인'
      ]
    }
  }
  if (value.includes('easy') || value.includes('이지')) {
    return {
      title: 'Easy',
      metric: '현재: 145bpm 넘기지 않기',
      details: [
        '페이스보다 심박 우선',
        '대화 가능한 강도',
        '다음날 피로/통증이 남지 않아야 함'
      ]
    }
  }
  return {
    title: '세부 지침 미정',
    metric: 'AI 코칭에서 처방 필요',
    details: ['다음 코칭 때 목표와 최근 기록을 보고 세부 기준을 정합니다.']
  }
}

function requestStatusLabel(status: TrainingKnowledgeRequest['status']) {
  switch (status) {
    case 'requested':
      return '검토 대기'
    case 'reviewing':
      return '검토 중'
    case 'approved':
      return '승인됨'
    case 'rejected':
      return '반려됨'
    default:
      return status
  }
}

function openInjuryEdit(itemId: string) {
  saveCurrentStackScroll()
  editingInjuryId.value = itemId
  pushPanel('injury-edit')
}

function openInjuryNew() {
  Object.assign(newInjury, {
    title: '',
    area: '',
    normalizedAreas: [],
    status: 'monitoring',
    severity: null,
    onsetDate: null,
    lastFlareDate: null,
    lastCheckedAt: null,
    resolvedAt: null,
    checkInHistory: [],
    notes: '',
    managementPlan: '',
    triggers: [],
    restrictions: [],
    returnToRunCriteria: '',
    strengthPlan: [],
    strengthPlanDetails: []
  })
  pushPanel('injury-new')
}

function applyNewInjuryAreas(value: InjuryAreaSelection[]) {
  newInjury.normalizedAreas = value
  newInjury.area = summarizeInjuryAreas(value)
  newInjury.severity = deriveInjurySeverity(value, newInjury.severity)
  newInjury.strengthPlan = createConservativeStrengthPlan(value)
  newInjury.strengthPlanDetails = createConservativeStrengthPlanDetails(value)
  if (!newInjury.managementPlan.trim()) newInjury.managementPlan = createInjuryManagementPlan(value)
  if (!newInjury.restrictions.length) newInjury.restrictions = createInjuryRestrictions(value)
  if (!newInjury.returnToRunCriteria.trim()) newInjury.returnToRunCriteria = createReturnToRunCriteria(value)
}

function addInjury() {
  const title = newInjury.title.trim()
  if (!title) return
  applyNewInjuryAreas(newInjury.normalizedAreas)
  const now = new Date().toISOString()
  const item: TrainingInjuryItem = {
    id: crypto.randomUUID(),
    title,
    area: newInjury.area,
    normalizedAreas: newInjury.normalizedAreas,
    status: newInjury.status,
    severity: newInjury.severity,
    onsetDate: newInjury.onsetDate || null,
    lastFlareDate: newInjury.lastFlareDate || null,
    lastCheckedAt: newInjury.lastCheckedAt || null,
    resolvedAt: newInjury.resolvedAt || null,
    checkInHistory: newInjury.checkInHistory,
    notes: newInjury.notes,
    managementPlan: newInjury.managementPlan,
    triggers: newInjury.triggers,
    restrictions: newInjury.restrictions,
    returnToRunCriteria: newInjury.returnToRunCriteria,
    strengthPlan: newInjury.strengthPlan,
    strengthPlanDetails: newInjury.strengthPlanDetails,
    createdAt: now,
    updatedAt: now
  }
  draft.injuryItems.push(item)
  draft.activeInjuryItemId = item.id
  editingInjuryId.value = item.id
  replaceTopPanel('injury-edit')
}

function updateInjury(item: TrainingInjuryItem) {
  item.updatedAt = new Date().toISOString()
}

function updateInjuryAreas(item: TrainingInjuryItem, value: InjuryAreaSelection[]) {
  item.normalizedAreas = value
  item.area = summarizeInjuryAreas(value)
  item.severity = deriveInjurySeverity(value, item.severity)
  item.strengthPlan = createConservativeStrengthPlan(value)
  item.strengthPlanDetails = createConservativeStrengthPlanDetails(value)
  item.managementPlan = item.managementPlan.trim() ? item.managementPlan : createInjuryManagementPlan(value)
  item.restrictions = item.restrictions.length ? item.restrictions : createInjuryRestrictions(value)
  item.returnToRunCriteria = item.returnToRunCriteria.trim() ? item.returnToRunCriteria : createReturnToRunCriteria(value)
  updateInjury(item)
}

function setActiveInjury(itemId: string) {
  if (!draft.injuryItems.some((item) => item.id === itemId)) return
  draft.activeInjuryItemId = itemId
}

function removeInjury(itemId: string) {
  draft.injuryItems = draft.injuryItems.filter((item) => item.id !== itemId)
  if (draft.activeInjuryItemId === itemId) {
    draft.activeInjuryItemId = draft.injuryItems.find((item) => item.status === 'active' || item.status === 'monitoring')?.id ?? draft.injuryItems[0]?.id ?? null
  }
  replaceTopPanel('injuries')
}

function askRemoveInjury(item: TrainingInjuryItem) {
  pendingDelete.value = { kind: 'injury', id: item.id, title: item.title }
}

function confirmDelete() {
  const target = pendingDelete.value
  if (!target) return
  if (target.kind === 'goal') removeGoal(target.id)
  if (target.kind === 'injury') removeInjury(target.id)
  pendingDelete.value = null
}

function goBack() {
  saveCurrentStackScroll()
  stackTransitionName.value = 'stack-slide-back'
  stack.value = stack.value.slice(0, -1)
  restoreCurrentStackScroll()
}

function closeStack() {
  saveCurrentStackScroll()
  stackTransitionName.value = 'stack-slide-back'
  stack.value = []
}

function stackKey(value = panel.value) {
  if (value === 'goal-edit') return `${value}:${editingGoalId.value}`
  if (value === 'injury-edit') return `${value}:${editingInjuryId.value}`
  return value
}

function saveCurrentStackScroll() {
  const key = stackKey()
  if (key === 'overview') return
  stackScroll[key] = stackContentRef.value?.scrollTop ?? 0
}

function restoreCurrentStackScroll() {
  const key = stackKey()
  requestAnimationFrame(() => {
    if (stackContentRef.value) stackContentRef.value.scrollTop = stackScroll[key] ?? 0
  })
}

function pushPanel(nextPanel: MemoryPanel) {
  saveCurrentStackScroll()
  stackTransitionName.value = 'stack-slide-forward'
  stack.value = [...stack.value, nextPanel]
  nextTick(() => {
    if (stackContentRef.value) stackContentRef.value.scrollTop = 0
  })
}

function replaceTopPanel(nextPanel: MemoryPanel) {
  saveCurrentStackScroll()
  stackTransitionName.value = 'stack-slide-forward'
  stack.value = [...stack.value.slice(0, -1), nextPanel]
  nextTick(() => {
    if (stackContentRef.value) stackContentRef.value.scrollTop = 0
  })
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    syncLegacyGoal()
    await memoryStore.update(JSON.parse(JSON.stringify(draft)))
    Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
    memorySnapshot.value = JSON.stringify(draft)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageLayout variant="memory">
    <SectionGroup class="memory-overview-card" title="목표" :surface="false">
      <template #actions>
        <button type="button" :disabled="saving || !isDirty" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </template>
      <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>

      <button class="memory-hero memory-hero-button" type="button" @click="openGoals">
        <span class="context-chip">활성 목표</span>
        <strong>{{ activeGoal?.title || '목표 없음' }}</strong>
        <small>{{ activeGoalMeta }}</small>
        <small v-if="activeGoal?.successCriteria">{{ activeGoal.successCriteria }}</small>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>

      <div v-if="secondaryGoals.length" class="memory-compact-list">
        <div v-for="goal in secondaryGoals.slice(0, 3)" :key="goal.id">
          <span>{{ goal.status }}</span>
          <strong>{{ goal.title }}</strong>
          <small>{{ goal.category }}{{ goalDateMeta(goal) }}</small>
        </div>
      </div>
    </SectionGroup>

    <SectionGroup title="몸 상태" :surface="false">
      <button class="memory-nav-card memory-nav-card-standalone" type="button" @click="openInjuries">
        <span>
          <strong>{{ activeInjury?.title || '관리 항목 없음' }}</strong>
          <small>{{ activeInjury ? `${injuryAreaMeta(activeInjury)} · ${activeInjuryMeta}` : '부상/주의사항 없음' }}</small>
        </span>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      <div v-if="activeInjury" class="memory-context-block">
        <strong>복귀 기준</strong>
        <p>{{ activeInjury.returnToRunCriteria || 'Easy 후 다음날 반응을 기준으로 조정합니다.' }}</p>
      </div>
      <div v-if="managedInjuries.length > 1" class="memory-compact-list">
        <div v-for="item in managedInjuries.slice(0, 3)" :key="item.id">
          <span>{{ item.status }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ injuryAreaMeta(item) }}{{ injuryDateMeta(item) }}</small>
        </div>
      </div>
    </SectionGroup>

    <SectionGroup title="러너 프로필" :surface="false">
      <InfoPairGrid :items="profileFacts" />
      <div v-if="personalBestPreview.length" class="memory-context-block">
        <strong>PB</strong>
        <ul>
          <li v-for="pb in personalBestPreview" :key="pb">{{ pb }}</li>
        </ul>
      </div>
      <p class="helper">프로필과 PB 수정은 우상단 계정 메뉴에서 관리합니다.</p>
    </SectionGroup>

    <SectionGroup title="훈련 기준" :surface="false">
      <template #actions>
        <button class="help-icon-button" type="button" aria-label="AI 스케줄링 기준 보기" @click="schedulingHelpOpen = true">?</button>
      </template>
      <div class="training-phase-card">
        <span class="context-chip">현재 단계</span>
        <strong>{{ trainingPhase.currentPhase }} · {{ trainingPhase.goal }}</strong>
        <small>다음 후보: {{ trainingPhase.nextPhase || '미정' }} · 검토: {{ trainingPhase.reviewAfter }}</small>
        <div class="phase-focus-list">
          <span v-for="focus in trainingPhase.focus" :key="focus">{{ focus }}</span>
        </div>
      </div>

      <div class="memory-note-grid">
        <label>
          장거리 전략
          <ClearableField v-model="draft.longRunStrategy" as="textarea" rows="3" />
        </label>
        <label>
          현재 볼륨 노트
          <ClearableField v-model="draft.currentVolumeNote" as="textarea" rows="3" />
        </label>
      </div>

      <div class="memory-subsection">
        <strong>주간 루틴</strong>
        <ul class="routine-guide-list">
          <li v-for="guide in weeklyRoutineGuides" :key="guide.item">
            <div class="routine-guide-head">
              <strong>{{ guide.item }}</strong>
              <span>{{ guide.metric }}</span>
            </div>
            <small>{{ guide.title }}</small>
            <ul>
              <li v-for="detail in guide.details" :key="detail">{{ detail }}</li>
            </ul>
          </li>
        </ul>
      </div>
    </SectionGroup>

    <SectionGroup title="AI 기억" :surface="false">
      <div class="memory-ai-summary">
        <span class="context-chip">장기 메모 {{ aiMemoryCount }}개</span>
        <button class="memory-link-button" type="button" @click="openKnowledge">훈련 지식 보관소</button>
      </div>

      <div class="memory-subsection">
        <strong>승급 조건</strong>
        <ul class="progression-criteria-list">
          <li v-for="criterion in progressionCriteria" :key="criterion.id">
            <div>
              <span class="context-chip" :class="`criterion-${criterion.status}`">{{ criterion.status }}</span>
              <strong>{{ criterion.label }}</strong>
            </div>
            <small>{{ criterion.evidence }}</small>
            <p>{{ criterion.action }}</p>
          </li>
        </ul>
      </div>

      <div class="memory-subsection">
        <strong>처방 템플릿</strong>
        <div class="prescription-template-list">
          <article v-for="template in prescriptionTemplates.slice(0, 4)" :key="template.id">
            <span class="context-chip">{{ template.phase }}</span>
            <strong>{{ template.name }}</strong>
            <small>{{ template.sessionType }} · {{ template.purpose }}</small>
            <ul>
              <li v-for="step in template.workout.slice(0, 3)" :key="step">{{ step }}</li>
            </ul>
          </article>
        </div>
      </div>

      <FormGrid class="memory-ai-fields">
        <label class="full">
          기타 주의사항
          <ClearableField :model-value="join(draft.knownIssues)" as="textarea" rows="5" @update:model-value="draft.knownIssues = split(String($event ?? ''))" />
        </label>
        <label class="full">
          러닝 스타일
          <ClearableField :model-value="join(draft.runningStyle)" as="textarea" rows="6" @update:model-value="draft.runningStyle = split(String($event ?? ''))" />
        </label>
        <label class="full">
          여름 전략
          <ClearableField :model-value="join(draft.heatStrategy)" as="textarea" rows="5" @update:model-value="draft.heatStrategy = split(String($event ?? ''))" />
        </label>
        <label class="full">
          코칭 메모
          <ClearableField :model-value="join(draft.aiNotes)" as="textarea" rows="5" @update:model-value="draft.aiNotes = split(String($event ?? ''))" />
        </label>
      </FormGrid>
    </SectionGroup>

    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="isStackOpen" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page" :class="{ 'memory-stack-detail': panel.includes('edit') || panel.includes('new') }">
          <header class="memory-stack-header">
            <button v-if="stack.length > 1" class="stack-icon-button" type="button" aria-label="뒤로" @click="goBack">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>{{ stackTitle }}</h2>
            </div>
            <button v-if="stack.length <= 1" class="stack-icon-button" type="button" aria-label="닫기" @click="closeStack">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </header>

          <main ref="stackContentRef" class="memory-stack-content">
            <Transition :name="stackTransitionName" mode="out-in">
              <div :key="stackKey()" class="memory-stack-screen">
                <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>

                <div v-if="panel === 'goals'" class="memory-stack">
              <SectionHeader title="목표 목록" compact>
                <button type="button" @click="openGoalNew">새 목표</button>
              </SectionHeader>
              <div class="memory-card-list">
                <button v-for="goal in draft.goals" :key="goal.id" class="memory-list-card" type="button" @click="openGoalEdit(goal.id)">
                  <span>
                    <strong>{{ goal.title }}</strong>
                    <small>{{ goal.id === draft.activeGoalId ? '활성 목표 · ' : '' }}{{ goal.category }} · {{ goal.status }}{{ goalDateMeta(goal) }}</small>
                  </span>
                  <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
                </div>

                <FormGrid v-else-if="panel === 'goal-new'">
              <div class="form-section-title full">새 목표 생성</div>
              <label class="full">
                목표명
                <ClearableField v-model="newGoal.title" placeholder="예: 2026년 11월 10km 59:59" />
              </label>
              <BottomSheetSelect v-model="newGoal.category" label="목표 유형" :options="goalCategoryOptions" />
              <DateField v-model="newGoal.startDate" label="시작일" />
              <DateField v-model="newGoal.targetDate" label="목표 날짜" />
              <label>
                목표 거리(km)
                <ClearableField v-model="newGoal.distanceKm" type="number" inputmode="decimal" placeholder="예: 10" number />
              </label>
              <label>
                목표 기록(초)
                <ClearableField v-model="newGoal.targetDurationSec" type="number" inputmode="numeric" placeholder="예: 3599" number />
              </label>
              <label>
                우선순위
                <ClearableField v-model="newGoal.priority" type="number" inputmode="numeric" min="1" number />
              </label>
              <label class="full">
                성공 기준
                <ClearableField v-model="newGoal.successCriteria" as="textarea" rows="3" placeholder="예: 10km를 59:59 이내로 완주" />
              </label>
              <label class="full">
                목표 전략
                <ClearableField v-model="newGoal.strategyNotes" as="textarea" rows="3" placeholder="예: Easy 기반 + 목요일 Tempo + 토요일 격주 롱런" />
              </label>
              <label class="full">
                목표 메모
                <ClearableField v-model="newGoal.notes" as="textarea" rows="3" />
              </label>
              <ActionGroup full>
                <button type="button" @click="addGoal">생성</button>
              </ActionGroup>
                </FormGrid>

                <FormGrid v-else-if="panel === 'goal-edit' && editingGoal">
              <div class="form-section-title full">목표 편집</div>
              <label class="full">
                목표명
                <ClearableField v-model="editingGoal.title" @update:model-value="updateGoal(editingGoal)" />
              </label>
              <BottomSheetSelect v-model="editingGoal.category" label="목표 유형" :options="goalCategoryOptions" @update:model-value="updateGoal(editingGoal)" />
              <BottomSheetSelect v-model="editingGoal.status" label="상태" :options="goalStatusOptions" @update:model-value="updateGoal(editingGoal)" />
              <DateField v-model="editingGoal.startDate" label="시작일" @update:model-value="updateGoal(editingGoal)" />
              <DateField v-model="editingGoal.targetDate" label="목표 날짜" @update:model-value="updateGoal(editingGoal)" />
              <label>
                목표 거리(km)
                <ClearableField v-model="editingGoal.distanceKm" type="number" inputmode="decimal" placeholder="예: 10" number @update:model-value="updateGoal(editingGoal)" />
              </label>
              <label>
                목표 기록(초)
                <ClearableField v-model="editingGoal.targetDurationSec" type="number" inputmode="numeric" placeholder="예: 3599" number @update:model-value="updateGoal(editingGoal)" />
              </label>
              <label>
                우선순위
                <ClearableField v-model="editingGoal.priority" type="number" inputmode="numeric" min="1" number @update:model-value="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                성공 기준
                <ClearableField v-model="editingGoal.successCriteria" as="textarea" rows="3" placeholder="예: 10km를 59:59 이내로 완주" @update:model-value="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                목표 전략
                <ClearableField v-model="editingGoal.strategyNotes" as="textarea" rows="3" placeholder="예: Easy 기반 + 목요일 Tempo + 토요일 격주 롱런" @update:model-value="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                목표 메모
                <ClearableField v-model="editingGoal.notes" as="textarea" rows="3" @update:model-value="updateGoal(editingGoal)" />
              </label>
              <ActionGroup full>
                <button class="ghost" type="button" @click="setActiveGoal(editingGoal.id)">활성 목표로 지정</button>
                <button class="danger" type="button" :disabled="draft.goals.length <= 1" @click="askRemoveGoal(editingGoal)">삭제</button>
              </ActionGroup>
                </FormGrid>

                <div v-else-if="panel === 'injuries'" class="memory-stack">
              <SectionHeader title="부상 관리 목록" compact>
                <button type="button" @click="openInjuryNew">새 항목</button>
              </SectionHeader>
              <div class="memory-card-list">
                <button v-for="item in draft.injuryItems" :key="item.id" class="memory-list-card" type="button" @click="openInjuryEdit(item.id)">
                  <span>
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.id === draft.activeInjuryItemId ? '현재 기준 · ' : '' }}{{ item.status }}{{ item.severity !== null ? ` · ${item.severity}/5` : '' }}{{ injuryDateMeta(item) }}</small>
                    <small>{{ injuryAreaMeta(item) }}</small>
                  </span>
                  <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
                </div>

                <FormGrid v-else-if="panel === 'injury-new'">
              <div class="form-section-title full">새 부상/주의사항 생성</div>
              <label class="full">
                항목명
                <ClearableField v-model="newInjury.title" placeholder="예: 오른쪽 무릎 바깥쪽 불편감" />
              </label>
              <InjuryBodySelector :model-value="newInjury.normalizedAreas" @update:model-value="applyNewInjuryAreas" />
              <BottomSheetSelect v-model="newInjury.status" label="상태" :options="injuryStatusOptions" />
              <DateField v-model="newInjury.onsetDate" label="시작일" />
              <DateField v-model="newInjury.lastFlareDate" label="최근 신호일" />
              <div v-if="newInjury.strengthPlan.length" class="strength-plan-card full">
                <strong>보강운동 처방</strong>
                <small>러닝 부하 조절을 돕는 참고용 기본값입니다. 의료 진단이나 치료 처방이 아닙니다.</small>
                <div class="strength-plan-detail-list">
                  <article v-for="plan in newInjury.strengthPlanDetails" :key="plan.id">
                    <strong>{{ plan.title }}</strong>
                    <p>{{ plan.instruction }}</p>
                    <small>{{ plan.useWhen }} · 중단: {{ plan.stopWhen }}</small>
                  </article>
                </div>
              </div>
              <label class="full">
                악화 트리거
                <ClearableField :model-value="join(newInjury.triggers)" as="textarea" rows="3" placeholder="예: 템포 다음날 뻣뻣함&#10;볼륨 급증" @update:model-value="newInjury.triggers = split(String($event ?? ''))" />
              </label>
              <label class="full">
                훈련 제한
                <ClearableField :model-value="join(newInjury.restrictions)" as="textarea" rows="3" placeholder="예: 통증이 있으면 스트라이드 생략&#10;롱런 후 하루 회복 우선" @update:model-value="newInjury.restrictions = split(String($event ?? ''))" />
              </label>
              <label class="full">
                복귀 기준
                <ClearableField v-model="newInjury.returnToRunCriteria" as="textarea" rows="3" placeholder="예: 다음날 뻣뻣함 없이 Easy가 편할 때 강도 복귀" />
              </label>
              <label class="full">
                메모
                <ClearableField v-model="newInjury.notes" as="textarea" rows="3" placeholder="예: 템포 다음날 뻣뻣함 확인 필요" />
              </label>
              <label class="full">
                관리 계획
                <ClearableField v-model="newInjury.managementPlan" as="textarea" rows="3" placeholder="예: 통증 단정 없이 강훈련 후 반응 확인" />
              </label>
              <ActionGroup full>
                <button type="button" @click="addInjury">생성</button>
              </ActionGroup>
                </FormGrid>

                <FormGrid v-else-if="panel === 'injury-edit' && editingInjury">
              <div class="form-section-title full">부상/주의사항 편집</div>
              <label class="full">
                항목명
                <ClearableField v-model="editingInjury.title" placeholder="예: 좌측 햄스트링" @update:model-value="updateInjury(editingInjury)" />
              </label>
              <InjuryBodySelector :model-value="editingInjury.normalizedAreas" @update:model-value="updateInjuryAreas(editingInjury, $event)" />
              <BottomSheetSelect v-model="editingInjury.status" label="상태" :options="injuryStatusOptions" @update:model-value="updateInjury(editingInjury)" />
              <DateField v-model="editingInjury.onsetDate" label="시작일" @update:model-value="updateInjury(editingInjury)" />
              <DateField v-model="editingInjury.lastFlareDate" label="최근 신호일" @update:model-value="updateInjury(editingInjury)" />
              <div v-if="editingInjury.strengthPlan.length" class="strength-plan-card full">
                <strong>보강운동 처방</strong>
                <small>부위와 통증 레벨을 기준으로 만든 참고용 처방입니다. 통증이 커지거나 보행 통증이 있으면 축소/중단을 우선합니다.</small>
                <div class="strength-plan-detail-list">
                  <article v-for="plan in editingInjury.strengthPlanDetails" :key="plan.id">
                    <strong>{{ plan.title }}</strong>
                    <p>{{ plan.instruction }}</p>
                    <small>{{ plan.useWhen }} · 출처: {{ plan.sources[0]?.title || 'PaceLAB 내부 기준' }}</small>
                  </article>
                </div>
              </div>
              <label class="full">
                악화 트리거
                <ClearableField :model-value="join(editingInjury.triggers)" as="textarea" rows="3" placeholder="예: 템포 다음날 뻣뻣함&#10;볼륨 급증" @update:model-value="editingInjury.triggers = split(String($event ?? '')); updateInjury(editingInjury)" />
              </label>
              <label class="full">
                훈련 제한
                <ClearableField :model-value="join(editingInjury.restrictions)" as="textarea" rows="3" placeholder="예: 통증이 있으면 스트라이드 생략&#10;롱런 후 하루 회복 우선" @update:model-value="editingInjury.restrictions = split(String($event ?? '')); updateInjury(editingInjury)" />
              </label>
              <label class="full">
                복귀 기준
                <ClearableField v-model="editingInjury.returnToRunCriteria" as="textarea" rows="3" placeholder="예: 다음날 뻣뻣함 없이 Easy가 편할 때 강도 복귀" @update:model-value="updateInjury(editingInjury)" />
              </label>
              <label class="full">
                메모
                <ClearableField v-model="editingInjury.notes" as="textarea" rows="3" placeholder="예: 템포 다음날 뻣뻣함 확인 필요" @update:model-value="updateInjury(editingInjury)" />
              </label>
              <label class="full">
                관리 계획
                <ClearableField v-model="editingInjury.managementPlan" as="textarea" rows="3" placeholder="예: 통증 단정 없이 강훈련 후 반응 확인" @update:model-value="updateInjury(editingInjury)" />
              </label>
              <ActionGroup full>
                <button class="ghost" type="button" @click="setActiveInjury(editingInjury.id)">현재 기준으로 지정</button>
                <button class="danger" type="button" @click="askRemoveInjury(editingInjury)">삭제</button>
              </ActionGroup>
                </FormGrid>

                <div v-else-if="panel === 'knowledge'" class="memory-stack">
                  <SectionHeader title="지식 보관소" compact>
                    <button type="button" @click="openKnowledgeRequest">검토 요청</button>
                  </SectionHeader>
                  <p class="helper">
                    승인된 훈련법과 처방 규칙만 AI 코칭에 들어갑니다. 원문 전체가 아니라 출처, 적용 조건, 처방 규칙만 저장합니다.
                  </p>
                  <p class="helper">
                    검토 요청은 OpenAI API를 호출하지 않고 Supabase 대기 목록에만 저장됩니다.
                  </p>
                  <p v-if="knowledgeRequestSaved" class="success">지식화 검토 요청을 저장했습니다. 비용이 발생하는 AI 조사는 자동 실행하지 않습니다.</p>
                  <p v-if="knowledgeError" class="error">{{ knowledgeError }}</p>
                  <p v-if="knowledgeLoading" class="helper">훈련 지식을 불러오는 중입니다.</p>

                  <article v-for="method in knowledge.methods" :key="method.id" class="knowledge-card">
                    <div class="knowledge-card-header">
                      <span class="context-chip">{{ method.family }}</span>
                      <strong>{{ method.name }}</strong>
                      <small>{{ methodMeta(method) }}</small>
                    </div>
                    <p>{{ method.summary }}</p>
                    <p v-if="method.cautionNotes" class="helper">{{ method.cautionNotes }}</p>
                    <div v-if="rulesByMethod.get(method.id)?.length" class="knowledge-rule-list">
                      <strong>처방 규칙</strong>
                      <ul>
                        <li v-for="rule in rulesByMethod.get(method.id)?.slice(0, 3)" :key="rule.id">
                          <span>{{ rule.sessionType }} · {{ rule.metric }}</span>
                          <small>{{ rule.prescription }}</small>
                        </li>
                      </ul>
                    </div>
                  </article>

                  <div v-if="knowledge.requests.length" class="sub-panel">
                    <strong>내 검토 요청</strong>
                    <ul class="memory-list">
                      <li v-for="request in knowledge.requests" :key="request.id">
                        {{ request.title }} · {{ requestStatusLabel(request.status) }}
                      </li>
                    </ul>
                  </div>
                </div>

                <FormGrid v-else-if="panel === 'knowledge-request'">
                  <div class="form-section-title full">지식화 검토 요청</div>
                  <p class="helper full">
                    예: MAF 훈련법, Daniels 10K 템포 기준, Hanson Marathon Method. 이 화면은 요청만 저장하며 OpenAI API를 호출하지 않습니다.
                  </p>
                  <p class="helper full">
                    출처 URL이나 네가 참고한 내용을 넣으면 이후 코덱스 검토를 거쳐 구조화 지식으로 승인합니다.
                  </p>
                  <p v-if="knowledgeError" class="error full">{{ knowledgeError }}</p>
                  <label class="full">
                    훈련법 이름
                    <ClearableField v-model="newKnowledgeRequest.title" placeholder="예: MAF 훈련법" />
                  </label>
                  <label class="full">
                    출처 URL
                    <ClearableField v-model="newKnowledgeRequest.sourceUrl" type="url" inputmode="url" placeholder="예: https://philmaffetone.com/180-formula/" />
                  </label>
                  <label class="full">
                    참고 내용
                    <ClearableField
                      v-model="newKnowledgeRequest.inputText"
                      as="textarea"
                      rows="8"
                      placeholder="훈련법 이름, 궁금한 적용 방식, 네가 알고 있는 내용, 목표 거리 등을 적어주세요."
                    />
                  </label>
                  <ActionGroup full>
                    <button type="button" :disabled="knowledgeLoading || !newKnowledgeRequest.title.trim()" @click="submitKnowledgeRequest">
                      {{ knowledgeLoading ? '저장 중' : '검토 요청 저장' }}
                    </button>
                  </ActionGroup>
                </FormGrid>
              </div>
            </Transition>
          </main>

          <footer class="stack-action-bar">
            <button type="button" :disabled="saving || !isDirty" @click="save">{{ saving ? '저장 중' : isDirty ? '변경사항 저장' : '저장됨' }}</button>
          </footer>
        </section>
        </div>
      </Transition>

      <div v-if="pendingDelete" class="bottom-sheet-layer confirm-layer" role="presentation" @click.self="pendingDelete = null">
        <section class="bottom-sheet confirm-sheet" :class="{ 'bottom-sheet-dragging': deleteSheetDrag.dragging.value }" :style="deleteSheetDrag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="삭제 확인">
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="deleteSheetDrag.startDrag" />
          <h2>삭제할까요?</h2>
          <p>{{ pendingDelete.title }} 항목은 저장 전 draft에서 제거됩니다. 최종 반영하려면 저장을 눌러야 합니다.</p>
          <div class="confirm-actions">
            <button class="danger" type="button" @click="confirmDelete">삭제</button>
            <button class="ghost" type="button" @click="pendingDelete = null">취소</button>
          </div>
          </section>
      </div>
      <SchedulingHelpSheet :open="schedulingHelpOpen" @close="schedulingHelpOpen = false" />
    </Teleport>
  </PageLayout>
</template>

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
import { formatDateWithWeekday } from '@/shared/lib/format'
import {
  deleteCoachMemoryItem,
  fetchCoachMemoryItems,
  type CoachMemoryItem
} from '@/shared/api/coachRepository'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import { useToastStore } from '@/app/stores/toastStore'
import { createTrainingKnowledgeRequest, fetchTrainingKnowledgeCatalog } from '@/shared/api/trainingKnowledgeRepository'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import DateField from '@/shared/ui/DateField.vue'
import FormGrid from '@/shared/ui/FormGrid.vue'
import InjuryBodySelector from '@/shared/ui/InjuryBodySelector.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import SchedulingHelpSheet from '@/shared/ui/SchedulingHelpSheet.vue'
import StackPage from '@/shared/ui/StackPage.vue'

// 리디자인 ①c: 러너 프로필·업적은 계정 드로어(AppHeader) 소관. 훈련 기준·AI 기억은 인라인 편집에서 drill-in 패널로 분리.
type MemoryPanel = 'overview' | 'goals' | 'goal-edit' | 'goal-new' | 'injuries' | 'injury-edit' | 'injury-new' | 'training' | 'ai-memory' | 'knowledge' | 'knowledge-request'

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
const pendingDelete = ref<{ kind: 'goal' | 'injury' | 'memory'; id: string; title: string } | null>(null)
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
const panel = computed<MemoryPanel>(() => stack.value.at(-1) ?? 'overview')
const isStackOpen = computed(() => panel.value !== 'overview')
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
    case 'training':
      return '훈련 기준'
    case 'ai-memory':
      return 'AI 기억'
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
// 루틴 카드 심박 숫자는 계정정보·코칭과 동일한 개인화 heartRateModel에서 가져온다(하드코딩 165/145/130 금지).
const routineHeartRateModel = computed(() => {
  const observed = deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
  return deriveHeartRateModel(draft.athleteProfile, new Date().getFullYear(), observed)
})
const trainingPhase = computed(() => draft.adaptiveTrainingProfile.trainingPhase)
const progressionCriteria = computed(() => draft.adaptiveTrainingProfile.progressionCriteria)
/**
 * 코치 장기기억(#806). 이 화면은 그동안 `aiNotes` 만 세어 "장기 메모 0개"라고 표시했는데,
 * 실제 기억은 `coach_memory_items` 에 121건 있었다 — 웹에서 **조회조차 안 했다.**
 * 그 표시가 사람을 오판하게 만들었으므로(이 앱의 개발 판단까지 틀어졌다), 실제를 보여준다.
 */
const coachMemories = ref<CoachMemoryItem[]>([])
const coachMemoryTotal = ref(0)
const coachMemoryHasMore = ref(false)
const coachMemoryLoading = ref(false)
const coachMemoryError = ref('')
const deletingMemoryId = ref('')

const aiMemoryCount = computed(() => coachMemoryTotal.value)

// ── 현재 코칭 기준 요약 카드 + 관리 nav (리디자인 ①c) ─────────────────
const basisGoalMeta = computed(() => {
  if (!activeGoal.value) return '기억 > 목표에서 목표를 만들어 주세요'
  const target = activeGoal.value.targetDate
  if (!target) return `${activeGoal.value.category} · 목표일 미정`
  const dday = Math.ceil((new Date(`${target}T00:00:00`).getTime() - Date.now()) / 86_400_000)
  const ddayText = dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : '목표일 지남'
  return `${ddayText} · ${formatDateWithWeekday(target)}`
})
const basisConstraintTitle = computed(() => {
  if (!activeInjury.value) return '제약 없음'
  const severity = activeInjury.value.severity
  return severity !== null ? `${activeInjury.value.title} Lv.${severity}` : activeInjury.value.title
})
const basisConstraintMeta = computed(() => {
  if (!activeInjury.value) return '부상/주의사항 없음'
  return activeInjury.value.restrictions[0] || injuryStatusLabel(activeInjury.value.status)
})
const hasInjuryAlert = computed(() => draft.injuryItems.some((item) => item.status === 'active'))
const goalsNavMeta = computed(() => `${activeGoal.value ? '활성 1개' : '활성 없음'} · 보조 ${secondaryGoals.value.length}개`)
const injuriesNavMeta = computed(() => (managedInjuries.value.length ? `관리 중 ${managedInjuries.value.length}건` : '관리 항목 없음'))
const trainingNavMeta = computed(() => trainingPhase.value.currentPhase)
const aiNavMeta = computed(() => `기억 ${aiMemoryCount.value}개`)

// ── 항목별 저장(리디자인 ①c): 전역 저장 제거 — 패널 그룹별 dirty 판정·부분 커밋 ──
/**
 * 저장(편집) 섹션. AI 기억·훈련 기준 패널은 **읽는 화면**이라 여기 없다.
 *
 * 훈련 기준의 자유 텍스트 두 칸(장거리 전략·현재 볼륨 노트)은 2026-09-08 제거했다 — 루틴의 정본은
 * 주기화 플랜이고 볼륨은 매 턴 실시간 계산되는데, 손으로 적은 값이 코치 프롬프트에 같이 실려
 * **같은 것에 대한 숫자 두 개**가 가는 구조였다(weeklyPattern·처방 템플릿과 같은 병).
 */
type MemorySection = 'goals' | 'injuries'
const SECTION_KEYS: Record<MemorySection, (keyof TrainingMemory)[]> = {
  goals: ['goals', 'activeGoalId', 'goal'],
  injuries: ['injuryItems', 'activeInjuryItemId']
}
const snapshotMemory = computed<TrainingMemory>(() => JSON.parse(memorySnapshot.value))
const panelSection = computed<MemorySection | null>(() => {
  if (panel.value.startsWith('goal')) return 'goals'
  if (panel.value.startsWith('injur')) return 'injuries'
  return null
})
const isSectionDirty = computed(() => {
  const section = panelSection.value
  if (!section) return false
  return SECTION_KEYS[section].some((key) => JSON.stringify(draft[key]) !== JSON.stringify(snapshotMemory.value[key]))
})

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
  () => mergeStoreIntoDraft()
)

/**
 * 기억 탭에 들어오면 바로 읽는다.
 *
 * 처음엔 "AI 기억 패널을 열 때만" 으로 뒀는데, 그러면 **바깥 목록의 "기억 N개"가 0으로 남는다** —
 * 그게 정확히 이 이슈(#806)에서 고치려던 거짓말이다. 첫 페이지 20건은 짧은 문장이라 부담이 없다.
 */
void loadCoachMemories()

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

/**
 * 스토어가 새 값을 들고 오면 **사용자가 손대지 않은 키만** 갈아끼운다(2026-09-07 데이터 유실 교정).
 *
 * 예전엔 "아무 키라도 수정 중이면(isDirty) 재동기화를 통째로 건너뛴다"였다. 그래서 로드 전(빈 값)에
 * 화면이 뜨고 어딘가 한 글자만 건드리면 draft 가 **영구히 빈 상태로 고정**됐고, 그 뒤 섹션 저장이
 * 그 섹션 키를 통째로 빈 값으로 덮었다 — 실사고: 코칭 메모·러닝 스타일·여름 전략·기타 주의사항과
 * 장거리 전략·볼륨 노트가 한꺼번에 지워졌다(지워진 키 = AI·훈련 섹션 키와 정확히 일치).
 * 키 단위로 보면 편집 중인 칸은 지키면서 나머지는 최신 값을 받는다.
 */
function mergeStoreIntoDraft() {
  const fresh = JSON.parse(JSON.stringify(memoryStore.memory)) as TrainingMemory
  const snapshot = JSON.parse(memorySnapshot.value) as TrainingMemory
  const nextSnapshot = { ...snapshot } as Record<string, unknown>
  for (const key of Object.keys(fresh) as (keyof TrainingMemory)[]) {
    const untouched = JSON.stringify(draft[key]) === JSON.stringify(snapshot[key])
    if (!untouched) continue
    ;(draft as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(fresh[key]))
    nextSnapshot[key] = fresh[key]
  }
  memorySnapshot.value = JSON.stringify(nextSnapshot)
}

function injuryStatusLabel(status: TrainingInjuryItem['status']) {
  return injuryStatusOptions.find((option) => option.value === status)?.label ?? status
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
  if (!title) {
    // addInjury 와 같은 조용한 무반응 방지 — 같은 화면의 같은 패턴이라 함께 고친다.
    useToastStore().error('목표명을 입력해주세요', { placement: 'top' })
    return
  }
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

function openTraining() {
  pushPanel('training')
}

function openAiMemory() {
  pushPanel('ai-memory')
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

function getWeeklyRoutineGuide(item: string, hr: ReturnType<typeof deriveHeartRateModel>) {
  const value = item.toLowerCase()
  // 심박 숫자는 개인화 heartRateModel에서만 가져온다. 상한이 null이면 고정 숫자 대신 페이스/RPE 표현.
  const tempo = hr.tempoCeilingBpm
  const easy = hr.easyCeilingBpm
  const recovery = hr.recoveryCeilingBpm
  if (value.includes('easy + strides') || value.includes('strides') || value.includes('스트라이드')) {
    return {
      title: 'Easy + Strides',
      metric: easy !== null ? `현재: ${easy}bpm 이하 + 짧은 가속` : '현재: 페이스·RPE로 이지 유지 + 짧은 가속',
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
      metric: tempo !== null ? `현재: max ${tempo}bpm 넘기지 않기` : '현재: 페이스·심박 드리프트로 관리',
      details: [
        '페이스보다 최대 심박 상한 우선',
        tempo !== null ? `구간 심박이 ${tempo}를 넘는지 확인` : '구간 심박이 흔들리는지 확인',
        '넘기면 다음 템포는 초반 진입을 낮춤',
        '잘 지키면 지속 시간/품질을 소폭 상향 검토'
      ]
    }
  }
  if (value.includes('recovery') || value.includes('회복')) {
    return {
      title: 'Recovery',
      metric: recovery !== null ? `현재: ${recovery}bpm 전후로 아주 낮게` : '현재: 아주 낮은 강도로 회복',
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
      metric: easy !== null ? `현재: ${easy}bpm 넘기지 않기` : '현재: 페이스보다 심박·RPE 우선',
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
  if (!title) {
    // 조용한 return 이면 버튼이 고장난 것처럼 보인다(2026-08-25 실사용: 부위·상태를 다 채우고
    // 생성을 눌렀는데 무반응 — 항목명만 비어 있었다). 왜 안 되는지 말해준다.
    useToastStore().error('항목명을 입력해주세요', { placement: 'top' })
    return
  }
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
  // 기억 삭제만 즉시 DB 반영이다 — draft/저장 흐름을 타지 않는다(아래 확인 시트 문구가 그래서 갈린다).
  if (target.kind === 'memory') void removeCoachMemory(target.id)
  pendingDelete.value = null
}

/** AI 기억 패널을 열 때 첫 페이지를 읽는다. 전부 그리지 않는다(대화 스레드와 같은 이유, #805). */
async function loadCoachMemories() {
  if (coachMemoryLoading.value) return
  coachMemoryLoading.value = true
  coachMemoryError.value = ''
  try {
    const page = await fetchCoachMemoryItems({})
    coachMemories.value = page.items
    coachMemoryHasMore.value = page.hasMore
    coachMemoryTotal.value = page.total
  } catch (err) {
    coachMemoryError.value = err instanceof Error ? err.message : '기억을 불러오지 못했습니다.'
  } finally {
    coachMemoryLoading.value = false
  }
}

async function loadMoreCoachMemories() {
  if (coachMemoryLoading.value || !coachMemoryHasMore.value) return
  const before = coachMemories.value.at(-1)?.createdAt
  if (!before) return
  coachMemoryLoading.value = true
  try {
    const page = await fetchCoachMemoryItems({ before })
    const known = new Set(coachMemories.value.map((item) => item.id))
    coachMemories.value = [...coachMemories.value, ...page.items.filter((item) => !known.has(item.id))]
    coachMemoryHasMore.value = page.hasMore
    coachMemoryTotal.value = page.total
  } catch (err) {
    coachMemoryError.value = err instanceof Error ? err.message : '기억을 더 불러오지 못했습니다.'
  } finally {
    coachMemoryLoading.value = false
  }
}

/**
 * 기억 한 건 삭제(#806). 되돌릴 수 없어 확인 시트를 거친다(목표·부상 삭제와 같은 규약).
 * 지운 내용을 사용자가 다시 말하면 코치는 다시 배운다 — 그게 맞는 동작이라 막지 않는다.
 */
function askRemoveMemory(item: CoachMemoryItem) {
  pendingDelete.value = { kind: 'memory', id: item.id, title: item.content }
}

async function removeCoachMemory(id: string) {
  deletingMemoryId.value = id
  coachMemoryError.value = ''
  try {
    await deleteCoachMemoryItem(id)
    coachMemories.value = coachMemories.value.filter((item) => item.id !== id)
    coachMemoryTotal.value = Math.max(0, coachMemoryTotal.value - 1)
  } catch (err) {
    coachMemoryError.value = err instanceof Error ? err.message : '기억을 지우지 못했습니다.'
  } finally {
    deletingMemoryId.value = ''
  }
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

// 항목별 저장(리디자인 ①c): 열려 있는 패널 그룹의 키만 스토어 기준 위에 얹어 커밋한다.
// 다른 패널의 미저장 편집은 draft·스냅샷 양쪽에 그대로 남아 함께 저장되지 않는다.
async function saveSection(section: MemorySection) {
  saving.value = true
  error.value = ''
  try {
    if (section === 'goals') syncLegacyGoal()
    const payload = JSON.parse(JSON.stringify(memoryStore.memory)) as TrainingMemory
    for (const key of SECTION_KEYS[section]) {
      ;(payload as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(draft[key]))
    }
    await memoryStore.update(payload)
    const saved = JSON.parse(JSON.stringify(memoryStore.memory)) as TrainingMemory
    const nextSnapshot = JSON.parse(memorySnapshot.value) as TrainingMemory
    for (const key of SECTION_KEYS[section]) {
      ;(draft as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(saved[key]))
      ;(nextSnapshot as Record<string, unknown>)[key] = saved[key]
    }
    memorySnapshot.value = JSON.stringify(nextSnapshot)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageLayout variant="memory">
    <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>

    <!-- 현재 코칭 기준 요약(리디자인 ①c): 코칭이 무엇을 기준으로 삼는지 한눈에 — 활성 목표 + 제약 -->
    <SectionCard class="memory-basis-card">
      <span class="memory-basis-eyebrow">현재 코칭 기준</span>
      <div class="memory-basis-row">
        <span class="memory-basis-pill memory-basis-pill-goal">목표</span>
        <div class="memory-basis-body">
          <strong>{{ activeGoal?.title || '목표 없음' }}</strong>
          <small>{{ basisGoalMeta }}</small>
        </div>
      </div>
      <div class="memory-basis-row">
        <span class="memory-basis-pill memory-basis-pill-constraint" :class="{ 'memory-basis-pill-none': !activeInjury }">제약</span>
        <div class="memory-basis-body">
          <strong>{{ basisConstraintTitle }}</strong>
          <small>{{ basisConstraintMeta }}</small>
        </div>
      </div>
    </SectionCard>

    <!-- 관리 항목 nav: 목표 · 몸 상태 · 훈련 기준 · AI 기억 — 편집은 전부 drill-in, 항목별 저장 -->
    <nav class="memory-manage-list" aria-label="코칭 기억 관리">
      <button type="button" class="memory-manage-row" @click="openGoals">
        <span class="memory-manage-main">
          <strong>목표</strong>
          <small>{{ goalsNavMeta }}</small>
        </span>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      <button type="button" class="memory-manage-row" @click="openInjuries">
        <span class="memory-manage-main">
          <strong>몸 상태</strong>
          <small>{{ injuriesNavMeta }}</small>
        </span>
        <span v-if="hasInjuryAlert" class="memory-manage-badge">주의</span>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      <button type="button" class="memory-manage-row" @click="openTraining">
        <span class="memory-manage-main">
          <strong>훈련 기준</strong>
          <small>{{ trainingNavMeta }}</small>
        </span>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      <button type="button" class="memory-manage-row" @click="openAiMemory">
        <span class="memory-manage-main">
          <strong>AI 기억</strong>
          <small>{{ aiNavMeta }}</small>
        </span>
        <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </nav>

    <p class="helper memory-account-hint">프로필 · 업적은 우상단 계정 메뉴에서 관리합니다.</p>

    <StackPage
      :open="isStackOpen"
      :title="stackTitle"
      :back="stack.length > 1"
      :page-class="panel.includes('edit') || panel.includes('new') ? 'memory-stack-detail' : ''"
      bare
      @close="stack.length > 1 ? goBack() : closeStack()"
    >
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
          <!-- 상세 텍스트 5종은 전부 선택 입력이라 접는다(2026-08-26 사용자 피드백: "입력창이 너무 많아
               눈에 안 들어오고 쓸데없이 느껴져"). 생성의 필수 흐름은 항목명·부위·상태·날짜까지다.
               접기 패턴은 같은 화면의 '이름으로 찾기'(InjuryBodySelector)와 동일한 <details>. -->
          <details class="injury-detail-fold full">
            <summary>자세한 관리 메모 (선택)</summary>
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
          </details>
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

            <div v-else-if="panel === 'training'" class="memory-stack">
              <SectionHeader title="훈련 단계" compact>
                <button class="help-icon-button" type="button" aria-label="AI 스케줄링 기준 보기" @click="schedulingHelpOpen = true">?</button>
              </SectionHeader>
              <div class="training-phase-card">
                <span class="context-chip">현재 단계</span>
                <strong>{{ trainingPhase.currentPhase }} · {{ trainingPhase.goal }}</strong>
                <small>다음 후보: {{ trainingPhase.nextPhase || '미정' }} · 검토: {{ trainingPhase.reviewAfter }}</small>
                <div class="phase-focus-list">
                  <span v-for="focus in trainingPhase.focus" :key="focus">{{ focus }}</span>
                </div>
              </div>

            </div>

            <div v-else-if="panel === 'ai-memory'" class="memory-stack">
              <div class="memory-ai-summary">
                <span class="context-chip">기억 {{ aiMemoryCount }}개</span>
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
                <strong>코치가 기억하는 나</strong>
                <small>대화에서 코치가 스스로 골라 남긴 것들이에요. 틀린 게 있으면 지우면 됩니다.</small>
                <p v-if="coachMemoryError" class="error">{{ coachMemoryError }}</p>
                <ul v-if="coachMemories.length" class="coach-memory-list">
                  <li v-for="item in coachMemories" :key="item.id">
                    <p>{{ item.content }}</p>
                    <div class="coach-memory-meta">
                      <small>{{ formatDateWithWeekday(item.createdAt.slice(0, 10)) }}</small>
                      <button
                        type="button"
                        class="coach-memory-remove"
                        :disabled="deletingMemoryId === item.id"
                        @click="askRemoveMemory(item)"
                      >
                        {{ deletingMemoryId === item.id ? '지우는 중' : '지우기' }}
                      </button>
                    </div>
                  </li>
                </ul>
                <p v-else-if="!coachMemoryLoading" class="helper">아직 기억이 없어요. 코치와 대화하면 쌓입니다.</p>
                <button
                  v-if="coachMemoryHasMore"
                  type="button"
                  class="memory-link-button"
                  :disabled="coachMemoryLoading"
                  @click="loadMoreCoachMemories"
                >
                  {{ coachMemoryLoading ? '불러오는 중…' : '더 보기' }}
                </button>
              </div>

              <div class="memory-subsection">
                <strong>코칭 메모</strong>
                <small>코치가 장기적으로 기억할 계획 변경 근거를 스스로 남기는 칸이에요. 직접 쓰는 칸이 아니에요.</small>
                <ul v-if="draft.aiNotes.length" class="ai-note-list">
                  <li v-for="note in draft.aiNotes" :key="note">{{ note }}</li>
                </ul>
                <p v-else class="helper">아직 남긴 메모가 없어요.</p>
              </div>
            </div>

            <div v-else-if="panel === 'knowledge'" class="memory-stack">
              <SectionHeader title="지식 보관소" compact>
                <button type="button" @click="openKnowledgeRequest">검토 요청</button>
              </SectionHeader>
              <p class="helper">
                승인된 훈련법과 처방 규칙만 AI 코칭에 들어갑니다. 원문 전체가 아니라 출처, 적용 조건, 처방 규칙만 저장합니다.
              </p>
              <p class="helper">
                검토 요청은 AI API를 호출하지 않고 Supabase 대기 목록에만 저장됩니다.
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
                예: MAF 훈련법, Daniels 10K 템포 기준, Hanson Marathon Method. 이 화면은 요청만 저장하며 AI API를 호출하지 않습니다.
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
      <!-- 항목별 저장(리디자인 ①c): 열린 패널 그룹만 저장 — knowledge 계열은 자체 저장이라 footer 없음 -->
      <template v-if="panelSection" #footer>
        <!-- 로드 전에는 저장하지 않는다 — 아직 안 받은 값을 빈 값으로 덮는 사고(2026-09-07)의 두 번째 자물쇠. -->
        <button type="button" :disabled="saving || !isSectionDirty || !memoryStore.loaded" @click="panelSection && saveSection(panelSection)">
          {{ saving ? '저장 중' : isSectionDirty ? '변경사항 저장' : '저장됨' }}
        </button>
      </template>
    </StackPage>

    <Teleport to="body">
      <Transition name="bottom-sheet">
      <div v-if="pendingDelete" class="bottom-sheet-layer confirm-layer" role="presentation" @click.self="pendingDelete = null">
        <section class="bottom-sheet confirm-sheet" :class="{ 'bottom-sheet-dragging': deleteSheetDrag.dragging.value }" :style="deleteSheetDrag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="삭제 확인">
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="deleteSheetDrag.startDrag" />
          <h2>삭제할까요?</h2>
          <p v-if="pendingDelete.kind === 'memory'">“{{ pendingDelete.title }}”</p>
          <p v-if="pendingDelete.kind === 'memory'" class="helper">바로 지워지고 되돌릴 수 없어요. 다시 말씀하시면 코치가 다시 기억합니다.</p>
          <p v-else>{{ pendingDelete.title }} 항목은 저장 전 draft에서 제거됩니다. 최종 반영하려면 저장을 눌러야 합니다.</p>
          <div class="confirm-actions">
            <button class="danger" type="button" @click="confirmDelete">삭제</button>
            <button class="ghost" type="button" @click="pendingDelete = null">취소</button>
          </div>
          </section>
      </div>
      </Transition>
      <SchedulingHelpSheet :open="schedulingHelpOpen" @close="schedulingHelpOpen = false" />
    </Teleport>
  </PageLayout>
</template>

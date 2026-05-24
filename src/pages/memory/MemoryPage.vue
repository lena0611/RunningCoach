<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import type { TrainingGoal, TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

type MemoryPanel = 'overview' | 'goals' | 'goal-edit' | 'goal-new' | 'injuries' | 'injury-edit' | 'injury-new'

const memoryStore = useMemoryStore()
const draft = reactive<TrainingMemory>(JSON.parse(JSON.stringify(memoryStore.memory)))
const panel = ref<MemoryPanel>('overview')
const editingGoalId = ref('')
const editingInjuryId = ref('')
const saving = ref(false)
const error = ref('')
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
  status: 'monitoring' as TrainingInjuryItem['status'],
  severity: null as number | null,
  onsetDate: null as string | null,
  lastFlareDate: null as string | null,
  notes: '',
  managementPlan: '',
  triggers: [] as string[],
  restrictions: [] as string[],
  returnToRunCriteria: ''
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
const activeGoalMeta = computed(() => {
  if (!activeGoal.value) return '목표 없음'
  return [activeGoal.value.category, activeGoal.value.targetDate ? `${activeGoal.value.targetDate}까지` : '목표일 미정'].join(' · ')
})
const activeInjuryMeta = computed(() => {
  if (!activeInjury.value) return '관리 항목 없음'
  return [activeInjury.value.status, activeInjury.value.severity ? `${activeInjury.value.severity}/5` : '강도 미입력'].join(' · ')
})
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
    default:
      return '코칭 메모리'
  }
})

watch(
  () => memoryStore.selectedUserId,
  () => {
    Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
    panel.value = 'overview'
    editingGoalId.value = ''
    editingInjuryId.value = ''
  }
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

function split(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function syncLegacyGoal() {
  if (activeGoal.value) draft.goal = activeGoal.value.title
}

function openGoals() {
  panel.value = 'goals'
}

function openGoalEdit(goalId: string) {
  editingGoalId.value = goalId
  panel.value = 'goal-edit'
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
  panel.value = 'goal-new'
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
  openGoalEdit(goal.id)
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
  panel.value = 'goals'
}

function openInjuries() {
  panel.value = 'injuries'
}

function openInjuryEdit(itemId: string) {
  editingInjuryId.value = itemId
  panel.value = 'injury-edit'
}

function openInjuryNew() {
  Object.assign(newInjury, {
    title: '',
    area: '',
    status: 'monitoring',
    severity: null,
    onsetDate: null,
    lastFlareDate: null,
    notes: '',
    managementPlan: '',
    triggers: [],
    restrictions: [],
    returnToRunCriteria: ''
  })
  panel.value = 'injury-new'
}

function addInjury() {
  const title = newInjury.title.trim()
  if (!title) return
  const now = new Date().toISOString()
  const item: TrainingInjuryItem = {
    id: crypto.randomUUID(),
    title,
    area: newInjury.area,
    status: newInjury.status,
    severity: newInjury.severity,
    onsetDate: newInjury.onsetDate || null,
    lastFlareDate: newInjury.lastFlareDate || null,
    notes: newInjury.notes,
    managementPlan: newInjury.managementPlan,
    triggers: newInjury.triggers,
    restrictions: newInjury.restrictions,
    returnToRunCriteria: newInjury.returnToRunCriteria,
    createdAt: now,
    updatedAt: now
  }
  draft.injuryItems.push(item)
  draft.activeInjuryItemId = item.id
  openInjuryEdit(item.id)
}

function updateInjury(item: TrainingInjuryItem) {
  item.updatedAt = new Date().toISOString()
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
  panel.value = 'injuries'
}

function goBack() {
  if (panel.value === 'goal-edit' || panel.value === 'goal-new') {
    panel.value = 'goals'
    return
  }
  if (panel.value === 'injury-edit' || panel.value === 'injury-new') {
    panel.value = 'injuries'
    return
  }
  panel.value = 'overview'
}

function closeStack() {
  panel.value = 'overview'
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    syncLegacyGoal()
    await memoryStore.update(JSON.parse(JSON.stringify(draft)))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="page memory-page">
    <SectionCard>
      <div class="section-heading">
        <h2>코칭 메모리</h2>
        <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </div>
      <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>
      <p class="helper">계정 이름, 출생연도, 성별, PB 같은 개인정보는 우상단 계정 메뉴에서 수정합니다.</p>

      <div class="memory-stack">
        <div class="memory-hero">
          <span class="context-chip">현재 코칭 기준</span>
          <strong>{{ activeGoal?.title || '목표 없음' }}</strong>
          <small>{{ activeGoalMeta }}</small>
          <small v-if="activeInjury">부상관리: {{ activeInjury.title }} · {{ activeInjuryMeta }}</small>
        </div>
        <button class="memory-nav-card" type="button" @click="openGoals">
          <span>
            <strong>목표 관리</strong>
            <small>{{ activeGoal?.title || '목표 없음' }}</small>
          </span>
          <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <button class="memory-nav-card" type="button" @click="openInjuries">
          <span>
            <strong>부상 관리</strong>
            <small>{{ activeInjury?.title || '관리 항목 없음' }}</small>
          </span>
          <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
        </button>

        <div class="form-section-title">AI 관리 훈련 루틴</div>
        <div class="sub-panel">
          <strong>주간 루틴</strong>
          <p class="helper">주간 루틴은 AI 코칭이 목표와 누적 데이터를 보고 유지하거나 수정합니다.</p>
          <ul class="memory-list">
            <li v-for="item in draft.weeklyPattern" :key="item">{{ item }}</li>
          </ul>
        </div>
        <form class="form-grid">
          <label class="full">
            장거리 전략
            <textarea v-model="draft.longRunStrategy" rows="3" />
          </label>
          <label class="full">
            현재 볼륨 노트
            <textarea v-model="draft.currentVolumeNote" rows="3" />
          </label>
          <div class="form-section-title full">개인화 메모</div>
          <label class="full">
            기타 주의사항
            <textarea :value="join(draft.knownIssues)" rows="5" @input="draft.knownIssues = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <label class="full">
            러닝 스타일
            <textarea :value="join(draft.runningStyle)" rows="6" @input="draft.runningStyle = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <label class="full">
            여름 전략
            <textarea :value="join(draft.heatStrategy)" rows="5" @input="draft.heatStrategy = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
          <label class="full">
            코칭 메모
            <textarea :value="join(draft.aiNotes)" rows="5" @input="draft.aiNotes = split(($event.target as HTMLTextAreaElement).value)" />
          </label>
        </form>
      </div>
    </SectionCard>

    <Teleport to="body">
      <div v-if="isStackOpen" class="memory-stack-layer" data-no-swipe>
        <section class="memory-stack-page" :class="{ 'memory-stack-detail': panel.includes('edit') || panel.includes('new') }">
          <header class="memory-stack-header">
            <button class="ghost stack-back" type="button" @click="goBack">뒤로</button>
            <div>
              <p class="eyebrow">Memory</p>
              <h2>{{ stackTitle }}</h2>
            </div>
            <button class="icon-action" type="button" @click="closeStack">닫기</button>
          </header>

          <main class="memory-stack-content">
            <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>
            <div class="stack-save-row">
              <span>변경 후 저장을 눌러야 코칭 기준에 반영됩니다.</span>
              <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
            </div>

            <div v-if="panel === 'goals'" class="memory-stack">
              <div class="section-heading compact-heading">
                <h3>목표 목록</h3>
                <button type="button" @click="openGoalNew">새 목표</button>
              </div>
              <button v-for="goal in draft.goals" :key="goal.id" class="memory-list-card" type="button" @click="openGoalEdit(goal.id)">
                <span>
                  <strong>{{ goal.title }}</strong>
                  <small>{{ goal.id === draft.activeGoalId ? '활성 목표 · ' : '' }}{{ goal.category }} · {{ goal.status }}</small>
                </span>
                <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            </div>

            <form v-else-if="panel === 'goal-new'" class="form-grid">
              <div class="form-section-title full">새 목표 생성</div>
              <label class="full">
                목표명
                <input v-model="newGoal.title" placeholder="예: 2026년 11월 10km 59:59" />
              </label>
              <BottomSheetSelect v-model="newGoal.category" label="목표 유형" :options="goalCategoryOptions" />
              <label>
                시작일
                <input v-model="newGoal.startDate" type="date" />
              </label>
              <label>
                목표 날짜
                <input v-model="newGoal.targetDate" type="date" />
              </label>
              <label>
                목표 거리(km)
                <input v-model.number="newGoal.distanceKm" type="number" inputmode="decimal" placeholder="예: 10" />
              </label>
              <label>
                목표 기록(초)
                <input v-model.number="newGoal.targetDurationSec" type="number" inputmode="numeric" placeholder="예: 3599" />
              </label>
              <label>
                우선순위
                <input v-model.number="newGoal.priority" type="number" inputmode="numeric" min="1" />
              </label>
              <label class="full">
                성공 기준
                <textarea v-model="newGoal.successCriteria" rows="3" placeholder="예: 10km를 59:59 이내로 완주" />
              </label>
              <label class="full">
                목표 전략
                <textarea v-model="newGoal.strategyNotes" rows="3" placeholder="예: Easy 기반 + 목요일 Tempo + 토요일 격주 롱런" />
              </label>
              <label class="full">
                목표 메모
                <textarea v-model="newGoal.notes" rows="3" />
              </label>
              <div class="actions full">
                <button type="button" @click="addGoal">생성</button>
              </div>
            </form>

            <form v-else-if="panel === 'goal-edit' && editingGoal" class="form-grid">
              <div class="form-section-title full">목표 편집</div>
              <label class="full">
                목표명
                <input v-model="editingGoal.title" @input="updateGoal(editingGoal)" />
              </label>
              <BottomSheetSelect v-model="editingGoal.category" label="목표 유형" :options="goalCategoryOptions" @update:model-value="updateGoal(editingGoal)" />
              <BottomSheetSelect v-model="editingGoal.status" label="상태" :options="goalStatusOptions" @update:model-value="updateGoal(editingGoal)" />
              <label>
                시작일
                <input v-model="editingGoal.startDate" type="date" @input="updateGoal(editingGoal)" />
              </label>
              <label>
                목표 날짜
                <input v-model="editingGoal.targetDate" type="date" @input="updateGoal(editingGoal)" />
              </label>
              <label>
                목표 거리(km)
                <input v-model.number="editingGoal.distanceKm" type="number" inputmode="decimal" placeholder="예: 10" @input="updateGoal(editingGoal)" />
              </label>
              <label>
                목표 기록(초)
                <input v-model.number="editingGoal.targetDurationSec" type="number" inputmode="numeric" placeholder="예: 3599" @input="updateGoal(editingGoal)" />
              </label>
              <label>
                우선순위
                <input v-model.number="editingGoal.priority" type="number" inputmode="numeric" min="1" @input="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                성공 기준
                <textarea v-model="editingGoal.successCriteria" rows="3" placeholder="예: 10km를 59:59 이내로 완주" @input="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                목표 전략
                <textarea v-model="editingGoal.strategyNotes" rows="3" placeholder="예: Easy 기반 + 목요일 Tempo + 토요일 격주 롱런" @input="updateGoal(editingGoal)" />
              </label>
              <label class="full">
                목표 메모
                <textarea v-model="editingGoal.notes" rows="3" @input="updateGoal(editingGoal)" />
              </label>
              <div class="actions full">
                <button class="ghost" type="button" @click="setActiveGoal(editingGoal.id)">활성 목표로 지정</button>
                <button class="danger" type="button" :disabled="draft.goals.length <= 1" @click="removeGoal(editingGoal.id)">삭제</button>
              </div>
            </form>

            <div v-else-if="panel === 'injuries'" class="memory-stack">
              <div class="section-heading compact-heading">
                <h3>부상 관리 목록</h3>
                <button type="button" @click="openInjuryNew">새 항목</button>
              </div>
              <button v-for="item in draft.injuryItems" :key="item.id" class="memory-list-card" type="button" @click="openInjuryEdit(item.id)">
                <span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.id === draft.activeInjuryItemId ? '현재 기준 · ' : '' }}{{ item.status }}{{ item.severity ? ` · ${item.severity}/5` : '' }}</small>
                </span>
                <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
              </button>
            </div>

            <form v-else-if="panel === 'injury-new'" class="form-grid">
              <div class="form-section-title full">새 부상/주의사항 생성</div>
              <label class="full">
                항목명
                <input v-model="newInjury.title" placeholder="예: 오른쪽 무릎 바깥쪽 불편감" />
              </label>
              <label>
                부위
                <input v-model="newInjury.area" placeholder="예: 좌측 햄스트링" />
              </label>
              <BottomSheetSelect v-model="newInjury.status" label="상태" :options="injuryStatusOptions" />
              <label>
                심각도(1~5)
                <input v-model.number="newInjury.severity" type="number" inputmode="numeric" min="1" max="5" placeholder="미입력" />
              </label>
              <label>
                시작일
                <input v-model="newInjury.onsetDate" type="date" />
              </label>
              <label>
                최근 신호일
                <input v-model="newInjury.lastFlareDate" type="date" />
              </label>
              <label class="full">
                악화 트리거
                <textarea :value="join(newInjury.triggers)" rows="3" placeholder="예: 템포 다음날 뻣뻣함&#10;볼륨 급증" @input="newInjury.triggers = split(($event.target as HTMLTextAreaElement).value)" />
              </label>
              <label class="full">
                훈련 제한
                <textarea :value="join(newInjury.restrictions)" rows="3" placeholder="예: 통증이 있으면 스트라이드 생략&#10;롱런 후 하루 회복 우선" @input="newInjury.restrictions = split(($event.target as HTMLTextAreaElement).value)" />
              </label>
              <label class="full">
                복귀 기준
                <textarea v-model="newInjury.returnToRunCriteria" rows="3" placeholder="예: 다음날 뻣뻣함 없이 Easy가 편할 때 강도 복귀" />
              </label>
              <label class="full">
                메모
                <textarea v-model="newInjury.notes" rows="3" placeholder="예: 템포 다음날 뻣뻣함 확인 필요" />
              </label>
              <label class="full">
                관리 계획
                <textarea v-model="newInjury.managementPlan" rows="3" placeholder="예: 통증 단정 없이 강훈련 후 반응 확인" />
              </label>
              <div class="actions full">
                <button type="button" @click="addInjury">생성</button>
              </div>
            </form>

            <form v-else-if="panel === 'injury-edit' && editingInjury" class="form-grid">
              <div class="form-section-title full">부상/주의사항 편집</div>
              <label class="full">
                항목명
                <input v-model="editingInjury.title" placeholder="예: 좌측 햄스트링" @input="updateInjury(editingInjury)" />
              </label>
              <label>
                부위
                <input v-model="editingInjury.area" placeholder="예: 좌측 햄스트링" @input="updateInjury(editingInjury)" />
              </label>
              <BottomSheetSelect v-model="editingInjury.status" label="상태" :options="injuryStatusOptions" @update:model-value="updateInjury(editingInjury)" />
              <label>
                심각도(1~5)
                <input v-model.number="editingInjury.severity" type="number" inputmode="numeric" min="1" max="5" placeholder="미입력" @input="updateInjury(editingInjury)" />
              </label>
              <label>
                시작일
                <input v-model="editingInjury.onsetDate" type="date" @input="updateInjury(editingInjury)" />
              </label>
              <label>
                최근 신호일
                <input v-model="editingInjury.lastFlareDate" type="date" @input="updateInjury(editingInjury)" />
              </label>
              <label class="full">
                악화 트리거
                <textarea :value="join(editingInjury.triggers)" rows="3" placeholder="예: 템포 다음날 뻣뻣함&#10;볼륨 급증" @input="editingInjury.triggers = split(($event.target as HTMLTextAreaElement).value); updateInjury(editingInjury)" />
              </label>
              <label class="full">
                훈련 제한
                <textarea :value="join(editingInjury.restrictions)" rows="3" placeholder="예: 통증이 있으면 스트라이드 생략&#10;롱런 후 하루 회복 우선" @input="editingInjury.restrictions = split(($event.target as HTMLTextAreaElement).value); updateInjury(editingInjury)" />
              </label>
              <label class="full">
                복귀 기준
                <textarea v-model="editingInjury.returnToRunCriteria" rows="3" placeholder="예: 다음날 뻣뻣함 없이 Easy가 편할 때 강도 복귀" @input="updateInjury(editingInjury)" />
              </label>
              <label class="full">
                메모
                <textarea v-model="editingInjury.notes" rows="3" placeholder="예: 템포 다음날 뻣뻣함 확인 필요" @input="updateInjury(editingInjury)" />
              </label>
              <label class="full">
                관리 계획
                <textarea v-model="editingInjury.managementPlan" rows="3" placeholder="예: 통증 단정 없이 강훈련 후 반응 확인" @input="updateInjury(editingInjury)" />
              </label>
              <div class="actions full">
                <button class="ghost" type="button" @click="setActiveInjury(editingInjury.id)">현재 기준으로 지정</button>
                <button class="danger" type="button" @click="removeInjury(editingInjury.id)">삭제</button>
              </div>
            </form>
          </main>
        </section>
      </div>
    </Teleport>
  </section>
</template>

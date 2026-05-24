<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import type { TrainingGoal, TrainingMemory } from '@/entities/training-memory/model'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

const memoryStore = useMemoryStore()
const draft = reactive<TrainingMemory>(JSON.parse(JSON.stringify(memoryStore.memory)))
const saving = ref(false)
const error = ref('')
const newGoalTitle = ref('')
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
const activeGoal = computed(() => draft.goals.find((goal) => goal.id === draft.activeGoalId) ?? draft.goals[0])
const goalOptions = computed(() => draft.goals.map((goal) => ({ value: goal.id, label: goal.title, description: goal.status === 'active' ? '진행 중' : goal.status })))

watch(
  () => memoryStore.selectedUserId,
  () => {
    Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
  }
)

function join(items: string[]) {
  return items.join('\n')
}

function split(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function syncLegacyGoal() {
  const goal = activeGoal.value
  if (goal) draft.goal = goal.title
}

function selectActiveGoal(goalId: string) {
  if (!draft.goals.some((goal) => goal.id === goalId)) return
  draft.activeGoalId = goalId
  syncLegacyGoal()
}

function addGoal() {
  const title = newGoalTitle.value.trim()
  if (!title) return
  const now = new Date().toISOString()
  const goal: TrainingGoal = {
    id: crypto.randomUUID(),
    title,
    category: 'race',
    targetDate: null,
    distanceKm: null,
    targetDurationSec: null,
    priority: draft.goals.length + 1,
    status: 'active',
    notes: '',
    createdAt: now,
    updatedAt: now
  }
  draft.goals.push(goal)
  draft.activeGoalId = goal.id
  draft.goal = goal.title
  newGoalTitle.value = ''
}

function updateActiveGoal() {
  if (!activeGoal.value) return
  activeGoal.value.updatedAt = new Date().toISOString()
  syncLegacyGoal()
}

function removeActiveGoal() {
  if (draft.goals.length <= 1 || !activeGoal.value) return
  const goalId = activeGoal.value.id
  draft.goals = draft.goals.filter((goal) => goal.id !== goalId)
  draft.activeGoalId = draft.goals[0].id
  syncLegacyGoal()
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
      <form class="form-grid">
        <div class="form-section-title full">목표 관리</div>
        <div class="sub-panel full">
          <strong>활성 목표</strong>
          <p class="helper">AI 코칭은 활성 목표를 중심으로 판단하고, 다른 목표는 보조 관점으로 참고합니다.</p>
          <BottomSheetSelect :model-value="draft.activeGoalId" label="활성 목표" :options="goalOptions" @update:model-value="selectActiveGoal" />
        </div>

        <template v-if="activeGoal">
          <label class="full">
            목표명
            <input v-model="activeGoal.title" @input="updateActiveGoal" />
          </label>
          <BottomSheetSelect v-model="activeGoal.category" label="목표 유형" :options="goalCategoryOptions" />
          <BottomSheetSelect v-model="activeGoal.status" label="상태" :options="goalStatusOptions" />
          <label>
            목표 날짜
            <input v-model="activeGoal.targetDate" type="date" @input="updateActiveGoal" />
          </label>
          <label>
            목표 거리(km)
            <input v-model.number="activeGoal.distanceKm" type="number" inputmode="decimal" placeholder="예: 10" @input="updateActiveGoal" />
          </label>
          <label>
            목표 기록(초)
            <input v-model.number="activeGoal.targetDurationSec" type="number" inputmode="numeric" placeholder="예: 3599" @input="updateActiveGoal" />
          </label>
          <label>
            우선순위
            <input v-model.number="activeGoal.priority" type="number" inputmode="numeric" min="1" @input="updateActiveGoal" />
          </label>
          <label class="full">
            목표 메모
            <textarea v-model="activeGoal.notes" rows="3" @input="updateActiveGoal" />
          </label>
        </template>

        <label class="full">
          새 목표 추가
          <input v-model="newGoalTitle" placeholder="예: 2026년 11월 10km 59:59" />
        </label>
        <div class="actions full">
          <button class="ghost" type="button" @click="addGoal">목표 추가</button>
          <button class="danger" type="button" :disabled="draft.goals.length <= 1" @click="removeActiveGoal">활성 목표 삭제</button>
        </div>

        <div class="sub-panel full">
          <strong>전체 목표</strong>
          <ul class="memory-list">
            <li v-for="goal in draft.goals" :key="goal.id">
              {{ goal.id === draft.activeGoalId ? '활성 · ' : '' }}{{ goal.title }} · {{ goal.category }} · {{ goal.status }}
            </li>
          </ul>
        </div>
        <div class="form-section-title full">AI 관리 훈련 루틴</div>
        <div class="sub-panel full">
          <strong>주간 루틴</strong>
          <p class="helper">주간 루틴은 AI 코칭이 목표와 누적 데이터를 보고 유지하거나 수정합니다.</p>
          <ul class="memory-list">
            <li v-for="item in draft.weeklyPattern" :key="item">{{ item }}</li>
          </ul>
        </div>
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
          부상/이슈
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
    </SectionCard>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import type { PersonalBest, TrainingMemory } from '@/entities/training-memory/model'
import SectionCard from '@/shared/ui/SectionCard.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

const memoryStore = useMemoryStore()
const draft = reactive<TrainingMemory>(JSON.parse(JSON.stringify(memoryStore.memory)))
const selectedUserName = ref(memoryStore.selectedUser.name)
const newUserName = ref('')
const newUserGoal = ref('10km 59:59 달성')
const saving = ref(false)
const error = ref('')
const sexOptions = [
  { value: 'unknown', label: '미입력' },
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other', label: '기타' }
]

watch(
  () => memoryStore.selectedUserId,
  () => {
    Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
    selectedUserName.value = memoryStore.selectedUser.name
  }
)

function join(items: string[]) {
  return items.join('\n')
}

function split(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function parsePersonalBests(value: string) {
  return value
    .split('\n')
    .map((line) => {
      const [distanceText, durationText, date = '', source = 'race'] = line.split(',').map((item) => item.trim())
      const distanceKm = Number(distanceText)
      const durationSec = parseDuration(durationText)
      if (!Number.isFinite(distanceKm) || !durationSec) return null
      const pbSource: PersonalBest['source'] = source === 'time_trial' || source === 'estimated' ? source : 'race'
      return {
        distanceKm,
        durationSec,
        date,
        source: pbSource
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

function formatPersonalBests() {
  return draft.athleteProfile.personalBests
    .map((pb) => `${pb.distanceKm}, ${formatDuration(pb.durationSec)}, ${pb.date}, ${pb.source}`)
    .join('\n')
}

function parseDuration(value: string) {
  if (!value) return null
  const parts = value.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    memoryStore.updateSelectedUserName(selectedUserName.value)
    await memoryStore.update(JSON.parse(JSON.stringify(draft)))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}

function addUser() {
  memoryStore.addUser(newUserName.value, newUserGoal.value)
  newUserName.value = ''
  newUserGoal.value = '10km 59:59 달성'
}
</script>

<template>
  <section class="page memory-page">
    <SectionCard>
      <div class="section-heading">
        <h2>사용자와 TrainingMemory</h2>
        <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </div>
      <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>
      <form class="form-grid">
        <div class="form-section-title full">사용자</div>
        <BottomSheetSelect
          :model-value="memoryStore.selectedUserId"
          label="선택 사용자"
          :options="memoryStore.users.map((user) => ({ value: user.id, label: user.name }))"
          @update:model-value="memoryStore.selectUser"
        />
        <label>
          사용자 이름
          <input v-model="selectedUserName" />
        </label>
        <label>
          새 사용자 이름
          <input v-model="newUserName" placeholder="예: 홍길동" />
        </label>
        <label>
          새 사용자 목표
          <input v-model="newUserGoal" placeholder="예: 10km 59:59 달성" />
        </label>
        <div class="actions full">
          <button class="ghost" type="button" @click="addUser">사용자 등록</button>
        </div>
        <div class="form-section-title full">목표와 프로필</div>
        <label class="full">
          선택 사용자 목표
          <input v-model="draft.goal" />
        </label>
        <label>
          출생연도
          <input v-model.number="draft.athleteProfile.birthYear" type="number" inputmode="numeric" placeholder="예: 1989" />
        </label>
        <BottomSheetSelect v-model="draft.athleteProfile.sex" label="성별" :options="sexOptions" />
        <label>
          러닝 경력(개월)
          <input v-model.number="draft.athleteProfile.runningExperienceMonths" type="number" inputmode="numeric" placeholder="예: 18" />
        </label>
        <label>
          목표 주간 러닝 횟수
          <input v-model.number="draft.athleteProfile.weeklyRunDaysTarget" type="number" inputmode="numeric" min="1" max="7" />
        </label>
        <label class="full">
          선호 롱런 요일
          <input v-model="draft.athleteProfile.preferredLongRunDay" />
        </label>
        <label class="full">
          거리별 PB
          <textarea :value="formatPersonalBests()" rows="4" placeholder="5, 28:30, 2026-05-01, race" @input="draft.athleteProfile.personalBests = parsePersonalBests(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <div class="form-section-title full">훈련 루틴</div>
        <label class="full">
          주간 루틴
          <textarea :value="join(draft.weeklyPattern)" rows="5" @input="draft.weeklyPattern = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
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

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { getActiveGoal, getActiveInjuryItem, type PersonalBest, type TrainingMemory } from '@/entities/training-memory/model'
import { formatDateWithWeekday } from '@/shared/lib/format'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

defineProps<{ isAuthenticated: boolean }>()
const emit = defineEmits<{ signOut: [] }>()

const authStore = useAuthStore()
const memoryStore = useMemoryStore()
const drawerOpen = ref(false)
const editOpen = ref(false)
const saving = ref(false)
const error = ref('')
const draftName = ref(memoryStore.selectedUser.name)
const draft = reactive<TrainingMemory>(clone(memoryStore.memory))
const sexOptions = [
  { value: 'unknown', label: '미입력' },
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other', label: '기타' }
]

const accountLabel = computed(() => {
  return memoryStore.selectedUser.name || authStore.user?.email || '계정'
})

const accountEmail = computed(() => authStore.user?.email || '로그인 정보 없음')
const activeGoalTitle = computed(() => getActiveGoal(memoryStore.memory).title)
const activeInjuryTitle = computed(() => getActiveInjuryItem(memoryStore.memory)?.title ?? '관리 항목 없음')

watch(
  () => [memoryStore.selectedUserId, memoryStore.selectedUser.updatedAt],
  () => resetDraft()
)

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function resetDraft() {
  draftName.value = memoryStore.selectedUser.name
  Object.assign(draft, clone(memoryStore.memory))
  error.value = ''
}

function openDrawer() {
  resetDraft()
  drawerOpen.value = true
  editOpen.value = false
}

function closeDrawer() {
  drawerOpen.value = false
  editOpen.value = false
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
        date: normalizeDateInput(date),
        source: pbSource
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

function normalizeDateInput(value: string) {
  return value.replace(/\([^)]+\)/g, '').trim()
}

function formatPersonalBests() {
  return draft.athleteProfile.personalBests
    .map((pb) => `${pb.distanceKm}, ${formatDuration(pb.durationSec)}, ${formatDateWithWeekday(pb.date)}, ${pb.source}`)
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

async function saveProfile() {
  saving.value = true
  error.value = ''
  try {
    memoryStore.updateSelectedUserName(draftName.value)
    await memoryStore.update(clone(draft))
    editOpen.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '정보 저장 실패'
  } finally {
    saving.value = false
  }
}

function signOutAndClose() {
  closeDrawer()
  emit('signOut')
}
</script>

<template>
  <header class="app-header">
    <div>
      <p class="eyebrow">RunContext</p>
      <h1>러닝 기록 코치</h1>
    </div>
    <button v-if="isAuthenticated" class="account-chip" type="button" aria-label="계정 메뉴 열기" @click="openDrawer">
      <span>{{ accountLabel }}</span>
      <strong>☰</strong>
    </button>
  </header>

  <Teleport to="body">
    <div v-if="drawerOpen" class="side-drawer-layer" @click.self="closeDrawer">
      <aside class="side-drawer" :class="{ 'side-drawer-editing': editOpen }" aria-label="계정 정보">
        <section class="side-drawer-panel account-panel">
          <div class="drawer-heading">
            <div>
              <h2>계정 정보</h2>
            </div>
            <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeDrawer">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </div>

          <div class="account-summary">
            <div class="account-avatar">{{ accountLabel.slice(0, 1).toUpperCase() }}</div>
            <div>
              <strong>{{ accountLabel }}</strong>
              <span>{{ accountEmail }}</span>
            </div>
          </div>

          <dl class="account-details">
            <div>
              <dt>목표</dt>
              <dd>{{ activeGoalTitle }}</dd>
            </div>
            <div>
              <dt>러닝 경력</dt>
              <dd>{{ memoryStore.memory.athleteProfile.runningExperienceMonths ?? '미입력' }}개월</dd>
            </div>
            <div>
              <dt>선호 롱런</dt>
              <dd>{{ memoryStore.memory.athleteProfile.preferredLongRunDay || '미입력' }}</dd>
            </div>
            <div>
              <dt>부상관리</dt>
              <dd>{{ activeInjuryTitle }}</dd>
            </div>
          </dl>

          <div class="drawer-actions">
            <button type="button" @click="editOpen = true">정보수정</button>
            <button class="ghost" type="button" @click="signOutAndClose">로그아웃</button>
          </div>
        </section>

        <section class="side-drawer-panel edit-panel">
          <div class="drawer-heading">
            <button class="stack-icon-button" type="button" aria-label="계정 정보로 돌아가기" @click="editOpen = false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>개인정보 수정</h2>
            </div>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <form class="form-grid" @submit.prevent="saveProfile">
            <label class="full">
              계정 표시 이름
              <input v-model="draftName" autocomplete="name" />
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
              <textarea
                :value="formatPersonalBests()"
                rows="4"
                placeholder="5, 28:30, 2026-05-01, race"
                @input="draft.athleteProfile.personalBests = parsePersonalBests(($event.target as HTMLTextAreaElement).value)"
              />
            </label>
            <button class="full" type="submit" :disabled="saving">{{ saving ? '저장 중' : '저장' }}</button>
          </form>
        </section>
      </aside>
    </div>
  </Teleport>
</template>

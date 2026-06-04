<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useSettingsStore, type ManualThemeMode, type NotificationSettings } from '@/app/stores/settingsStore'
import { getActiveGoal, getActiveInjuryItem, type PersonalBest, type TrainingMemory } from '@/entities/training-memory/model'
import { syncNativeNotifications } from '@/features/sync-native-notifications/notificationBridge'
import { formatDateWithWeekday } from '@/shared/lib/format'
import { RUNNER_LEVEL_LABEL, resolveRunnerLevel } from '@/shared/lib/runnerLevel'
import { deriveHeartRateModel, deriveObservedMaxHr, deriveRecommendedHeartRateModel } from '@/shared/lib/heartRateZones'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import FormGrid from '@/shared/ui/FormGrid.vue'
import HeartRateHelpSheet from '@/shared/ui/HeartRateHelpSheet.vue'

defineProps<{ isAuthenticated: boolean }>()
const emit = defineEmits<{ signOut: [] }>()

const authStore = useAuthStore()
const memoryStore = useMemoryStore()
const runStore = useRunStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const drawerOpen = ref(false)
const heartRateHelpOpen = ref(false)
const drawerPanel = ref<'account' | 'profile' | 'settings'>('account')
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
const themeModeOptions = [
  { value: 'light', label: '라이트', description: '밝은 배경과 선명한 텍스트를 사용합니다.' },
  { value: 'dark', label: '다크', description: '어두운 배경과 낮은 눈부심을 사용합니다.' }
]
const weekdayOptions = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'].map((day) => ({ value: day, label: day }))
const birthYearOptions = [
  { value: '', label: '미입력' },
  ...Array.from({ length: 81 }, (_, index) => {
    const year = new Date().getFullYear() - 10 - index
    return { value: String(year), label: String(year) }
  })
]
const runningExperienceOptions = [
  { value: '', label: '미입력' },
  { value: '0', label: '1년 미만' },
  ...Array.from({ length: 30 }, (_, index) => {
    const years = index + 1
    return { value: String(years * 12), label: `${years}년` }
  })
]
const weeklyRunDaysTargetOptions = [
  { value: '', label: '미입력' },
  ...Array.from({ length: 14 }, (_, index) => {
    const count = index + 1
    return { value: String(count), label: `${count}회` }
  })
]
const runnerLevelOptions = [
  { value: 'auto', label: '자동 판정', description: '경력·볼륨·PB로 코치가 자동 판정합니다.' },
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' }
]
const notificationRows = [
  {
    key: 'workoutMorning',
    title: '훈련 당일 아침',
    detail: '예정 훈련이 있는 날 오전 7시에 알려줍니다.'
  },
  {
    key: 'scheduledWorkout',
    title: '스케줄 훈련 준비',
    detail: '예정 세션 당일 저녁에 한 번 더 알려줍니다.'
  },
  {
    key: 'healthKitNewRun',
    title: 'HealthKit 새 러닝',
    detail: '앱이 새 러닝을 저장하면 알림을 보냅니다.'
  }
] as const

const accountLabel = computed(() => {
  return memoryStore.selectedUser.name || authStore.user?.email || '계정'
})

const accountEmail = computed(() => authStore.user?.email || '로그인 정보 없음')
const activeGoalTitle = computed(() => getActiveGoal(memoryStore.memory).title)
const activeInjuryTitle = computed(() => getActiveInjuryItem(memoryStore.memory)?.title ?? '관리 항목 없음')
const runnerLevelDisplay = computed(() => {
  const derived = resolveRunnerLevel(memoryStore.memory.athleteProfile, runStore.sortedRuns)
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
const heartRateModeOptions = [
  { label: '추천 (자동)', value: 'auto' },
  { label: '직접 입력', value: 'manual' }
]
const observedMaxHr = computed(() =>
  deriveObservedMaxHr(runStore.sortedRuns.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })))
)
// 편집 중 draft 기준으로 계산해 토글/입력이 즉시 반영되게 한다(draft는 drawer 열 때 memory에서 동기화).
const activeHeartRateModel = computed(() =>
  deriveHeartRateModel(draft.athleteProfile, new Date().getFullYear(), observedMaxHr.value)
)
const recommendedHeartRateModel = computed(() =>
  deriveRecommendedHeartRateModel(draft.athleteProfile, new Date().getFullYear(), observedMaxHr.value)
)
function describeHeartRateModel(model: ReturnType<typeof deriveHeartRateModel>): string {
  if (model.tempoCeilingBpm === null) return '미설정 (나이 또는 심박 입력 필요)'
  return `템포 ${model.tempoCeilingBpm} · 이지 ${model.easyCeilingBpm} · 회복 ${model.recoveryCeilingBpm}bpm (${HEART_RATE_SOURCE_LABEL[model.source] ?? model.source})`
}
const heartRateModeValue = computed({
  get: () => draft.athleteProfile.heartRateMode === 'manual' ? 'manual' : 'auto',
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.heartRateMode = value === 'manual' ? 'manual' : 'auto'
  }
})
const activeHeartRateDisplay = computed(() => describeHeartRateModel(activeHeartRateModel.value))
const recommendedHeartRateDisplay = computed(() => describeHeartRateModel(recommendedHeartRateModel.value))
const birthYearValue = computed({
  get: () => draft.athleteProfile.birthYear === null ? '' : String(draft.athleteProfile.birthYear),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.birthYear = value ? Number(value) : null
  }
})
const runningExperienceValue = computed({
  get: () => draft.athleteProfile.runningExperienceMonths === null ? '' : String(draft.athleteProfile.runningExperienceMonths),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.runningExperienceMonths = value === '' ? null : Number(value)
  }
})
const weeklyRunDaysTargetValue = computed({
  get: () => draft.athleteProfile.weeklyRunDaysTarget === null ? '' : String(draft.athleteProfile.weeklyRunDaysTarget),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.weeklyRunDaysTarget = value === '' ? null : Number(value)
  }
})
const maxHeartRateValue = computed({
  get: () => draft.athleteProfile.maxHeartRate === null ? '' : String(draft.athleteProfile.maxHeartRate),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.maxHeartRate = value === '' ? null : Number(value)
  }
})
const restingHeartRateValue = computed({
  get: () => draft.athleteProfile.restingHeartRate === null ? '' : String(draft.athleteProfile.restingHeartRate),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.restingHeartRate = value === '' ? null : Number(value)
  }
})
const lactateThresholdHrValue = computed({
  get: () => draft.athleteProfile.lactateThresholdHr === null ? '' : String(draft.athleteProfile.lactateThresholdHr),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.lactateThresholdHr = value === '' ? null : Number(value)
  }
})

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
  drawerPanel.value = 'account'
}

function closeDrawer() {
  drawerOpen.value = false
  drawerPanel.value = 'account'
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

function formatExperience(months: number | null) {
  if (months === null) return '미입력'
  if (months < 12) return '1년 미만'
  const years = Math.floor(months / 12)
  return `${years}년`
}

async function saveProfile() {
  saving.value = true
  error.value = ''
  try {
    memoryStore.updateSelectedUserName(draftName.value)
    await memoryStore.update(clone(draft))
    drawerPanel.value = 'account'
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

function setThemeMode(value: string | string[]) {
  if (Array.isArray(value)) return
  if (value === 'light' || value === 'dark') settingsStore.setManualTheme(value as ManualThemeMode)
}

function setAllNotifications(enabled: boolean) {
  settingsStore.setAllNotifications(enabled)
  syncNotifications({
    ...settingsStore.notificationSettings,
    allEnabled: enabled
  })
}

function setNotification(key: typeof notificationRows[number]['key'], enabled: boolean) {
  settingsStore.setNotificationSetting(key, enabled)
  syncNotifications({
    ...settingsStore.notificationSettings,
    [key]: enabled
  })
}

function syncNotifications(settings: NotificationSettings = settingsStore.notificationSettings) {
  syncNativeNotifications(settings, memoryStore.memory.weeklyPattern)
}

function goDashboard() {
  router.push('/')
}

function goGlossary() {
  closeDrawer()
  router.push('/glossary')
}
</script>

<template>
  <header class="app-header">
    <div class="app-header-brand">
      <button class="brand-lockup" type="button" aria-label="요약으로 이동" @click="goDashboard">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M21 17c3-5 10-6 16-3" />
            <path d="M36 14h8" />
            <circle cx="31" cy="20" r="5" />
            <path d="M32 28l-5 9 9 4" />
            <path d="M29 34l-9 1" />
            <path d="M36 41l-5 10" />
            <path d="M37 41l11 4" />
            <path d="M32 29l10 2" />
            <path d="M42 31l6-6" />
          </svg>
        </span>
        <span class="brand-word">PACE<strong>LAB</strong></span>
      </button>
    </div>
    <button v-if="isAuthenticated" class="account-menu-button" type="button" aria-label="계정 메뉴 열기" @click="openDrawer">
      <span class="account-avatar-mini" aria-hidden="true">{{ accountLabel.slice(0, 1).toUpperCase() }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </svg>
    </button>
  </header>

  <Teleport to="body">
    <div v-if="drawerOpen" class="side-drawer-layer" @click.self="closeDrawer">
      <aside class="side-drawer" aria-label="계정 정보">
        <section class="side-drawer-panel account-panel">
          <div class="drawer-heading">
            <div>
              <h2>계정 정보</h2>
            </div>
            <div class="drawer-heading-actions">
              <button class="stack-icon-button" type="button" aria-label="설정 열기" @click="drawerPanel = 'settings'">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                  <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.5 1Z" />
                </svg>
              </button>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeDrawer">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </div>
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
              <dd>{{ formatExperience(memoryStore.memory.athleteProfile.runningExperienceMonths) }}</dd>
            </div>
            <div>
              <dt>러너 레벨</dt>
              <dd>{{ runnerLevelDisplay }}</dd>
            </div>
            <div>
              <dt>선호 롱런</dt>
              <dd>{{ memoryStore.memory.athleteProfile.preferredLongRunDay || '미입력' }}</dd>
            </div>
            <div>
              <dt>심박 상한</dt>
              <dd>{{ activeHeartRateDisplay }}</dd>
            </div>
            <div>
              <dt>부상관리</dt>
              <dd>{{ activeInjuryTitle }}</dd>
            </div>
          </dl>

          <button class="drawer-link-row" type="button" @click="goGlossary">
            <span class="drawer-link-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.2 1-1.2 1.9" /><path d="M12 16.5h.01" /></svg>
            </span>
            <span class="drawer-link-text">
              <strong>용어 안내</strong>
              <span>러닝·코칭 용어를 한곳에서 찾아보기</span>
            </span>
            <svg class="drawer-link-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>

          <ActionGroup class="drawer-actions">
            <button type="button" @click="drawerPanel = 'profile'">정보수정</button>
            <button class="ghost" type="button" @click="signOutAndClose">로그아웃</button>
          </ActionGroup>
        </section>

        <section v-if="drawerPanel === 'profile'" class="side-drawer-panel edit-panel">
          <div class="drawer-heading">
            <button class="stack-icon-button" type="button" aria-label="계정 정보로 돌아가기" @click="drawerPanel = 'account'">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>개인정보 수정</h2>
            </div>
          </div>

          <p v-if="error" class="error">{{ error }}</p>
          <FormGrid as="form" @submit.prevent="saveProfile">
            <label class="full">
              계정 표시 이름
              <ClearableField v-model="draftName" autocomplete="name" />
            </label>
            <BottomSheetSelect v-model="birthYearValue" label="출생연도" :options="birthYearOptions" />
            <BottomSheetSelect v-model="draft.athleteProfile.sex" label="성별" :options="sexOptions" />
            <BottomSheetSelect v-model="runningExperienceValue" label="러닝 경력" :options="runningExperienceOptions" />
            <BottomSheetSelect v-model="draft.athleteProfile.runnerLevel" label="러너 레벨" :options="runnerLevelOptions" />
            <BottomSheetSelect v-model="weeklyRunDaysTargetValue" label="목표 주간 러닝 횟수" :options="weeklyRunDaysTargetOptions" />
            <BottomSheetSelect v-model="draft.athleteProfile.preferredLongRunDay" label="선호 롱런 요일" :options="weekdayOptions" />
            <BottomSheetSelect v-model="heartRateModeValue" label="심박 기준" :options="heartRateModeOptions">
              <template #label-suffix>
                <button class="help-icon-button help-icon-button-sm" type="button" aria-label="심박 기준 산출 방식 보기" @click="heartRateHelpOpen = true">?</button>
              </template>
            </BottomSheetSelect>
            <div class="full hr-summary">
              <p><strong>현재 적용</strong> · {{ activeHeartRateDisplay }}</p>
              <p class="hr-recommended">앱 추천 · {{ recommendedHeartRateDisplay }}</p>
            </div>
            <template v-if="heartRateModeValue === 'manual'">
              <label>
                역치심박 LTHR
                <ClearableField v-model="lactateThresholdHrValue" type="number" number inputmode="numeric" placeholder="30분 테스트 평균" />
              </label>
              <label>
                최대심박(측정)
                <ClearableField v-model="maxHeartRateValue" type="number" number inputmode="numeric" placeholder="측정값" />
              </label>
              <label>
                안정심박
                <ClearableField v-model="restingHeartRateValue" type="number" number inputmode="numeric" placeholder="아침 안정 시" />
              </label>
            </template>
            <p class="full hr-hint">
              심박존·상한은 역치심박(LTHR) &gt; 측정 최대심박 &gt; 나이 + 누적 기록 보정 순으로 개인화합니다.
              산출 방식과 근거는 <strong>심박 기준</strong> 옆 <strong>?</strong>를 눌러 확인하세요.
            </p>
            <label class="full">
              거리별 PB
              <ClearableField
                :model-value="formatPersonalBests()"
                as="textarea"
                rows="4"
                placeholder="5, 28:30, 2026-05-01, race"
                @update:model-value="draft.athleteProfile.personalBests = parsePersonalBests(String($event ?? ''))"
              />
            </label>
            <button class="full" type="submit" :disabled="saving">{{ saving ? '저장 중' : '저장' }}</button>
          </FormGrid>
        </section>

        <section v-else-if="drawerPanel === 'settings'" class="side-drawer-panel settings-panel">
          <div class="drawer-heading">
            <button class="stack-icon-button" type="button" aria-label="계정 정보로 돌아가기" @click="drawerPanel = 'account'">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>설정</h2>
            </div>
          </div>

          <section class="settings-section">
            <div class="settings-section-heading">
              <p class="eyebrow">Theme</p>
              <h3>화면 테마</h3>
            </div>

            <div class="settings-row">
              <div>
                <strong>iOS 테마 자동 따라가기</strong>
                <span>기기 appearance가 바뀌면 PaceLAB도 같이 바뀝니다.</span>
              </div>
              <button
                class="switch-control"
                :class="{ on: settingsStore.followsSystem }"
                type="button"
                role="switch"
                :aria-checked="settingsStore.followsSystem"
                @click="settingsStore.setFollowSystem(!settingsStore.followsSystem)"
              >
                <span />
              </button>
            </div>

            <BottomSheetSelect
              v-if="!settingsStore.followsSystem"
              :model-value="settingsStore.manualTheme"
              label="수동 테마"
              :options="themeModeOptions"
              @update:model-value="setThemeMode"
            />

            <p class="helper">현재 적용: {{ settingsStore.effectiveTheme === 'light' ? '라이트' : '다크' }}</p>
          </section>

          <section class="settings-section">
            <div class="settings-section-heading">
              <p class="eyebrow">Notifications</p>
              <h3>알림</h3>
            </div>

            <div class="settings-row">
              <div>
                <strong>전체 알림</strong>
                <span>훈련 스케줄과 HealthKit 신규 기록 알림을 한 번에 켜고 끕니다.</span>
              </div>
              <button
                class="switch-control"
                :class="{ on: settingsStore.notificationSettings.allEnabled }"
                type="button"
                role="switch"
                :aria-checked="settingsStore.notificationSettings.allEnabled"
                @click="setAllNotifications(!settingsStore.notificationSettings.allEnabled)"
              >
                <span />
              </button>
            </div>

            <div class="notification-list" :class="{ disabled: !settingsStore.notificationSettings.allEnabled }">
              <div v-for="row in notificationRows" :key="row.key" class="settings-row compact">
                <div>
                  <strong>{{ row.title }}</strong>
                  <span>{{ row.detail }}</span>
                </div>
                <button
                  class="switch-control"
                  :class="{ on: settingsStore.notificationSettings.allEnabled && settingsStore.notificationSettings[row.key] }"
                  type="button"
                  role="switch"
                  :aria-checked="settingsStore.notificationSettings.allEnabled && settingsStore.notificationSettings[row.key]"
                  :disabled="!settingsStore.notificationSettings.allEnabled"
                  @click="setNotification(row.key, !settingsStore.notificationSettings[row.key])"
                >
                  <span />
                </button>
              </div>
            </div>

            <p class="helper">iPhone에서는 알림 권한을 허용해야 배너가 표시됩니다. 루틴 변경 후에는 가까운 2주 알림을 다시 예약합니다.</p>
          </section>
        </section>
      </aside>
    </div>
  </Teleport>

  <HeartRateHelpSheet :open="heartRateHelpOpen" @close="heartRateHelpOpen = false" />
</template>

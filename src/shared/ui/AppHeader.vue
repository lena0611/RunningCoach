<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { notificationSettingRows, useSettingsStore, type NotificationSettingKey, type NotificationSettings, type SettingsPanelFocus } from '@/app/stores/settingsStore'
import { useGlossaryStore } from '@/app/stores/glossaryStore'
import { getActiveGoal, getActiveInjuryItem, type PersonalBest, type TrainingMemory } from '@/entities/training-memory/model'
import { isHealthKitBridgeAvailable } from '@/features/import-healthkit-run/healthKitBridge'
import { syncNativeNotifications } from '@/features/sync-native-notifications/notificationBridge'
import { formatDateWithWeekday } from '@/shared/lib/format'
import { RUNNER_LEVEL_LABEL, resolveRunnerLevel } from '@/shared/lib/runnerLevel'
import { resolveRunnerProgress, runnerProgressLabel } from '@/shared/lib/level/levelModel'
import { resolvePaceModel, formatPaceSec } from '@/shared/lib/vdotPaces'
import { deriveHeartRateModel, deriveObservedMaxHr, deriveRecommendedHeartRateModel } from '@/shared/lib/heartRateZones'
import { computeTempoCeilingAdaptation, describeTempoCeilingMeta } from '@/shared/lib/coaching/tempoAdaptation'
import ActionGroup from '@/shared/ui/ActionGroup.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import ClearableField from '@/shared/ui/ClearableField.vue'
import FormGrid from '@/shared/ui/FormGrid.vue'
import GlossarySheet from '@/shared/ui/GlossarySheet.vue'
import HeartRateHelpSheet from '@/shared/ui/HeartRateHelpSheet.vue'
import HeartRateTestGuideSheet from '@/shared/ui/HeartRateTestGuideSheet.vue'
import StackPage from '@/shared/ui/StackPage.vue'

defineProps<{ isAuthenticated: boolean }>()
// openAchievements: 업적 스택은 App 레벨이 호스팅(#397 래칫 — shared 가 entities 도메인 컴포넌트를 직접 들지 않는다)
const emit = defineEmits<{ signOut: []; openAchievements: [] }>()

const authStore = useAuthStore()
const healthKitSyncStore = useHealthKitSyncStore()
const levelStore = useLevelStore()
const memoryStore = useMemoryStore()
const runStore = useRunStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const drawerOpen = ref(false)
const heartRateHelpOpen = ref(false)
const heartRateTestGuideOpen = ref(false)
const glossaryOpen = ref(false)
const glossaryFocusSlug = ref('')
const glossaryStore = useGlossaryStore()
// 다른 화면(세션 카드 등)이 특정 용어로 용어집 열기를 요청하면 연다(deep-link).
watch(
  () => glossaryStore.pendingOpenSlug,
  (slug) => {
    if (slug === null) return
    glossaryFocusSlug.value = slug
    glossaryOpen.value = true
    glossaryStore.clearPendingOpen()
  }
)
const drawerPanel = ref<'account' | 'profile' | 'settings'>('account')
watch(
  () => settingsStore.settingsPanelRequestId,
  (requestId) => {
    if (!requestId) return
    openSettingsPanel(settingsStore.settingsPanelFocus)
  }
)
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
const notificationRows = notificationSettingRows

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
// 헤더 러너 레벨 칩(리디자인 ①b): LevelCard 와 동일 모델(runnerProgress — App.vue syncRewards 계산과 같은 소스).
// ⚠ 위 runnerLevelDisplay(초급/중급 판정 모델)와 다른 축 — 혼동 금지. 탭하면 코치 탭(전체 레벨 카드)으로.
const headerRunnerProgress = computed(() =>
  resolveRunnerProgress(memoryStore.memory.athleteProfile, runStore.sortedRuns, new Date(), {
    maxDistanceM: levelStore.selfReportedMaxDistanceM
  })
)
const headerLevelLabel = computed(() => runnerProgressLabel(headerRunnerProgress.value))
function goCoachLevel() {
  router.push('/coach')
}
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
// Tempo 상한 적응(#301): 추정 base 위에 검증된 상향만 얹는다. active 표시는 effective + 출처·신뢰도.
const activeHeartRateAdaptation = computed(() =>
  computeTempoCeilingAdaptation(runStore.sortedRuns, activeHeartRateModel.value.tempoCeilingBpm, {
    injuryActive: Boolean(getActiveInjuryItem(memoryStore.memory)),
    adoptedCeilingBpm: memoryStore.memory.adaptiveTrainingProfile.tempoCeiling?.adoptedBpm ?? null
  })
)
const activeHeartRateDisplay = computed(() => {
  const model = activeHeartRateModel.value
  if (model.tempoCeilingBpm === null) return '미설정 (나이 또는 심박 입력 필요)'
  const { effectiveBpm, suffix } = describeTempoCeilingMeta(activeHeartRateAdaptation.value, model.tempoCeilingBpm, HEART_RATE_SOURCE_LABEL[model.source] ?? model.source)
  return `템포 ${effectiveBpm} · 이지 ${model.easyCeilingBpm} · 회복 ${model.recoveryCeilingBpm}bpm ${suffix}`
})
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
const weightKgValue = computed({
  get: () => draft.athleteProfile.weightKg === null ? '' : String(draft.athleteProfile.weightKg),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    draft.athleteProfile.weightKg = value === '' ? null : Number(value)
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

// VO2max(심폐 체력). HealthKit '갱신' 또는 수동 입력으로 채운다. 수동 편집 시 source는 manual로 둔다.
const vo2MaxValue = computed({
  get: () => draft.athleteProfile.vo2Max === null ? '' : String(draft.athleteProfile.vo2Max),
  set: (value: string | string[]) => {
    if (Array.isArray(value)) return
    if (value === '') {
      draft.athleteProfile.vo2Max = null
      draft.athleteProfile.vo2MaxSampleDate = null
      draft.athleteProfile.vo2MaxSource = null
      return
    }
    draft.athleteProfile.vo2Max = Number(value)
    draft.athleteProfile.vo2MaxSource = 'manual'
    draft.athleteProfile.vo2MaxSampleDate = null
  }
})
const healthKitBridgeAvailable = isHealthKitBridgeAvailable()
const vo2MaxSourceLabel = computed(() => {
  switch (draft.athleteProfile.vo2MaxSource) {
    case 'healthkit':
      return 'HealthKit'
    case 'manual':
      return '직접 입력'
    default:
      return ''
  }
})
const vo2MaxSampleDateLabel = computed(() => {
  const raw = draft.athleteProfile.vo2MaxSampleDate
  if (!raw) return ''
  return raw.slice(0, 10)
})
// 페이스 모델(보조). PB 환산 > VO2max 추정 > 없음. 심박 상한이 게이트이고 페이스는 보조 표시.
const paceModel = computed(() => resolvePaceModel(draft.athleteProfile))
const paceModelSummary = computed(() => {
  const m = paceModel.value
  if (m.source === 'insufficient') return ''
  const tempo = formatPaceSec(m.thresholdPaceSec)
  const easyRange = m.easyPaceRangeSec
    ? `${formatPaceSec(m.easyPaceRangeSec[0])} ~ ${formatPaceSec(m.easyPaceRangeSec[1])}`
    : '-'
  return `템포 ${tempo} · 이지 ${easyRange}`
})
const paceModelBasis = computed(() => {
  const m = paceModel.value
  if (m.source === 'insufficient') return ''
  const confidence = m.confidence === 'measured' ? '정확' : '추정'
  return `${m.basis ?? ''} · 신뢰도 ${confidence}`
})
function refreshVo2Max() {
  if (!healthKitBridgeAvailable) return
  healthKitSyncStore.requestVo2Max()
}
// HealthKit '갱신' 응답은 store state에 들어온다. 값이 있으면 draft에 채우고(저장 시 영속화),
// 없으면(기록 없음) draft는 그대로 둔다.
watch(
  () => healthKitSyncStore.lastVo2MaxAt,
  () => {
    if (!drawerOpen.value) return
    const sample = healthKitSyncStore.lastVo2MaxSample
    if (!sample || sample.value === null) return
    draft.athleteProfile.vo2Max = sample.value
    draft.athleteProfile.vo2MaxSampleDate = sample.sampleDate
    draft.athleteProfile.vo2MaxSource = 'healthkit'
  }
)

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
  document.body.classList.add('memory-stack-open')
}

function closeDrawer() {
  drawerOpen.value = false
  drawerPanel.value = 'account'
  document.body.classList.remove('memory-stack-open')
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

function setAllNotifications(enabled: boolean) {
  settingsStore.setAllNotifications(enabled)
  syncNotifications({
    ...settingsStore.notificationSettings,
    allEnabled: enabled
  })
}

function setNotification(key: NotificationSettingKey, enabled: boolean) {
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
  // 계정 정보 드로어를 닫지 않고 그 위에 스택을 띄운다(--z-stack > 드로어).
  // 파생 스택의 뒤로(←)가 계정 정보로 복귀하도록 부모 surface를 유지한다.
  glossaryOpen.value = true
}

function openSettingsPanel(focus: SettingsPanelFocus | null = null) {
  drawerOpen.value = true
  drawerPanel.value = 'settings'
  if (focus !== 'notifications') return
  void nextTick(() => {
    document.querySelector('[data-settings-section="notifications"]')?.scrollIntoView({ block: 'start' })
  })
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
    <div v-if="isAuthenticated" class="app-header-side">
      <button class="header-level-chip" type="button" aria-label="내 레벨 — 코치 탭에서 보기" @click="goCoachLevel">
        {{ headerLevelLabel }}
      </button>
      <button class="account-menu-button" type="button" aria-label="계정 메뉴 열기" @click="openDrawer">
        <span class="account-avatar-mini" aria-hidden="true">{{ accountLabel.slice(0, 1).toUpperCase() }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>
    </div>
  </header>

  <StackPage :open="drawerOpen" title="계정 정보" wide-actions>
    <template #actions>
      <div class="stack-header-actions">
        <button class="stack-icon-button" type="button" aria-label="설정 열기" @click="openSettingsPanel()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.5 1Z" /></svg>
        </button>
        <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeDrawer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        </button>
      </div>
    </template>
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

    <!-- 업적(리디자인 ①c): 기억 탭에서 계정 메뉴로 이전 — PB·마일스톤·꾸준함. 스택 호스팅은 App 레벨 -->
    <button class="drawer-link-row" type="button" @click="emit('openAchievements')">
      <span class="drawer-link-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4a3 3 0 0 0 3 4" /><path d="M17 6h3a3 3 0 0 1-3 4" /></svg>
      </span>
      <span class="drawer-link-text">
        <strong>업적</strong>
        <span>PB · 마일스톤 · 꾸준함 기록 모아보기</span>
      </span>
      <svg class="drawer-link-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>

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
  </StackPage>

  <StackPage
    :open="drawerOpen && drawerPanel === 'profile'"
    title="개인정보 수정"
    back
    dismiss-label="계정 정보로 돌아가기"
    layer-class="stack-layer-top"
    @close="drawerPanel = 'account'"
  >
    <p v-if="error" class="error">{{ error }}</p>
    <FormGrid as="form" @submit.prevent="saveProfile">
    <label class="full">
      계정 표시 이름
      <ClearableField v-model="draftName" autocomplete="name" />
    </label>
    <BottomSheetSelect v-model="birthYearValue" label="출생연도" :options="birthYearOptions" />
    <BottomSheetSelect v-model="draft.athleteProfile.sex" label="성별" :options="sexOptions" />
    <BottomSheetSelect v-model="runningExperienceValue" label="러닝 경력" :options="runningExperienceOptions" />
    <label>
      체중(kg)
      <ClearableField v-model="weightKgValue" type="number" number inputmode="decimal" placeholder="예: 63.5" />
    </label>
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
        <span class="hr-field-label-row">역치심박 LTHR
          <button type="button" class="hr-measure-link" @click="heartRateTestGuideOpen = true">측정 방법</button>
        </span>
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
    <div class="full vo2-card">
      <div class="vo2-card-head">
        <h3>심폐 체력 (VO2max)</h3>
        <button
          v-if="healthKitBridgeAvailable"
          type="button"
          class="vo2-refresh"
          :disabled="healthKitSyncStore.vo2MaxRequesting"
          @click="refreshVo2Max"
        >{{ healthKitSyncStore.vo2MaxRequesting ? '불러오는 중' : 'HealthKit 갱신' }}</button>
      </div>
      <p v-if="draft.athleteProfile.vo2Max !== null" class="vo2-value">
        {{ draft.athleteProfile.vo2Max }} <span class="vo2-unit">mL/kg·min</span>
        <span v-if="vo2MaxSourceLabel" class="vo2-meta">{{ vo2MaxSourceLabel }}<template v-if="vo2MaxSampleDateLabel"> · {{ vo2MaxSampleDateLabel }}</template></span>
      </p>
      <label>
        직접 입력 (HealthKit 값이 없을 때)
        <ClearableField v-model="vo2MaxValue" type="number" number inputmode="decimal" placeholder="예: 48.5" />
      </label>
      <div v-if="paceModelSummary" class="vo2-pace">
        <p class="vo2-pace-title">추정 페이스 <span class="vo2-pace-tag">보조</span></p>
        <p class="vo2-pace-line">{{ paceModelSummary }}</p>
        <p class="vo2-pace-basis">{{ paceModelBasis }}</p>
      </div>
      <p class="full hr-hint">
        심폐 체력은 심박 상한을 만들지 않습니다. 페이스 추정의 보조 신호로만 쓰며, 실제 강도 기준은 심박 상한입니다.
        <template v-if="!healthKitBridgeAvailable"> HealthKit 자동 갱신은 iOS 앱에서만 동작합니다.</template>
      </p>
    </div>
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
  </StackPage>

  <StackPage
    :open="drawerOpen && drawerPanel === 'settings'"
    title="설정"
    back
    dismiss-label="계정 정보로 돌아가기"
    layer-class="stack-layer-top"
    @close="drawerPanel = 'account'"
  >
    <section class="settings-section" data-settings-section="notifications">
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
  </StackPage>

  <HeartRateHelpSheet :open="heartRateHelpOpen" @close="heartRateHelpOpen = false" />

  <HeartRateTestGuideSheet :open="heartRateTestGuideOpen" @close="heartRateTestGuideOpen = false" />

  <GlossarySheet :open="glossaryOpen" :focus-slug="glossaryFocusSlug" @close="glossaryOpen = false; glossaryFocusSlug = ''" />
</template>

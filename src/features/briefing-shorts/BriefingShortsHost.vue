<script setup lang="ts">
/**
 * 오늘 훈련 브리핑 쇼츠(#898) — 띄울지 판정하고 팝업을 올린다(App 레벨, 탭 자식 아님).
 *
 * 띄우는 조건(전부, 앱 부팅 때 한 번만 판정):
 * - 로그인 + 시작 설정(온보딩) 끝남
 * - 요약 탭이 판정한 오늘 상태가 'today'(예정 훈련 있음 + 오늘 훈련 런 없음)
 * - 앱이면 HealthKit 첫 동기화가 끝남 — 아침에 뛴 런이 아직 안 들어온 채 "다녀와요"를 틀면 안 된다
 * - 오늘 이미 본 적 없음(하루 한 번, 사용자 결정)
 * 아니라고 판정되면 바로 인트로를 걷는다. 판정이 BOOT_DECISION_DEADLINE_MS 안에 안 나면 이번 실행은 띄우지 않는다.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAuthStore } from '@/app/stores/authStore'
import { useBriefingShortsStore, type TodayBriefingPayload } from '@/app/stores/briefingShortsStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { briefingVerdict, type BriefingVerdict } from './briefingGate'
import { closeNativeIntro } from './introBridge'
import { buildSceneOptions } from './sceneOptions'
import type { BriefingSceneOptions } from './scene/briefingScene'
import BriefingShortsPopup from './BriefingShortsPopup.vue'

const BOOT_DECISION_DEADLINE_MS = 10_000

const authStore = useAuthStore()
const levelStore = useLevelStore()
const memoryStore = useMemoryStore()
const weatherStore = useWeatherStore()
const healthKitSyncStore = useHealthKitSyncStore()
const store = useBriefingShortsStore()

/** 페이지가 열린 시각 — 이 뒤에 끝난 HealthKit 동기화만 "이번 실행의 첫 동기화"로 본다. */
const bootAt = Date.now() - performance.now()

const decided = ref(false)
const shown = ref<{ payload: TodayBriefingPayload; options: BriefingSceneOptions; weatherChip: string } | null>(null)

const healthKitSettled = computed(() => {
  if (!hasNativeBridge()) return true
  if (healthKitSyncStore.syncing) return false
  return healthKitSyncStore.lastCompletedAt >= bootAt || Boolean(healthKitSyncStore.error) || Boolean(healthKitSyncStore.skipReason)
})

const verdict = computed<BriefingVerdict>(() =>
  briefingVerdict({
    supabaseConfigured: isSupabaseConfigured,
    authInitialized: authStore.initialized,
    authenticated: authStore.isAuthenticated,
    levelLoaded: levelStore.loaded,
    needsOnboarding: levelStore.needsOnboarding,
    todaySettled: store.todaySettled,
    todayState: store.today?.dayState ?? null,
    healthKitSettled: healthKitSettled.value,
    shownToday: store.today ? store.wasShownToday(authStore.user?.id ?? 'local', store.today.date) : false
  })
)

function weatherChipText(): string {
  const current = weatherStore.current
  if (!current) return ''
  const felt = current.apparentTemperatureC ?? current.temperatureC
  const temp = felt === null ? '' : ` ${Math.round(felt)}°`
  return current.condition && current.condition !== '정보 없음' ? `${current.condition}${temp}` : temp.trim()
}

function decide(next: BriefingVerdict) {
  if (decided.value || next === 'wait') return
  decided.value = true
  window.clearTimeout(deadlineTimer)
  if (next === 'skip' || !store.today) {
    closeNativeIntro()
    return
  }
  const payload = store.today
  shown.value = {
    payload,
    options: buildSceneOptions({
      sex: memoryStore.memory.athleteProfile.sex,
      sessionType: payload.sessionType,
      weather: weatherStore.current,
      now: new Date()
    }),
    weatherChip: weatherChipText()
  }
  store.markShown(authStore.user?.id ?? 'local', payload.date)
  store.open = true
}

const deadlineTimer = window.setTimeout(() => {
  if (decided.value) return
  decided.value = true
  closeNativeIntro()
}, BOOT_DECISION_DEADLINE_MS)

watch(verdict, decide, { immediate: true })

// 팝업이 떠 있는 동안 오늘 런이 들어오면(늦은 동기화) 더 볼 이유가 없다 — 닫는다.
watch(
  () => store.today?.dayState ?? null,
  (state) => {
    if (store.open && store.todaySettled && state !== 'today') close()
  }
)

function onReady() {
  // 첫 프레임이 화면에 올라간 뒤 인트로를 걷는다 → 인트로가 걷힐 때 팝업이 이미 그려져 있다.
  closeNativeIntro()
}

function onFailed() {
  closeNativeIntro()
  close()
}

function close() {
  store.open = false
}

onBeforeUnmount(() => window.clearTimeout(deadlineTimer))
</script>

<template>
  <Teleport to="body">
    <Transition name="briefing-shorts-fade" @after-leave="shown = null">
      <BriefingShortsPopup
        v-if="store.open && shown"
        :payload="shown.payload"
        :options="shown.options"
        :weather-chip="shown.weatherChip"
        @ready="onReady"
        @failed="onFailed"
        @done="close"
      />
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 브리핑이 끝나 러너가 멀어지는 동안 팝업 전체가 천천히 사라지고, 다 사라진 뒤 지운다(사용자 결정). */
.briefing-shorts-fade-leave-active {
  transition: opacity 1.2s ease;
}
.briefing-shorts-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .briefing-shorts-fade-leave-active {
    transition-duration: 0.3s;
  }
}
</style>

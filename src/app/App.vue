<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryCheckIn, TrainingMemory } from '@/entities/training-memory/model'
import { createInjuryCheckInDismissKey } from '@/features/injury-check-in/injuryCheckInPrompt'
import DashboardPage from '@/pages/dashboard/DashboardPage.vue'
import RunLogPage from '@/pages/run-log/RunLogPage.vue'
import TrendsPage from '@/pages/trends/TrendsPage.vue'
import MemoryPage from '@/pages/memory/MemoryPage.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import AppShell from '@/shared/ui/AppShell.vue'
import InjuryCheckInSheet from '@/shared/ui/InjuryCheckInSheet.vue'
import ToastHost from '@/shared/ui/ToastHost.vue'
import type { BottomNavItem } from '@/shared/ui/BottomNav.vue'

const authStore = useAuthStore()
const healthKitSyncStore = useHealthKitSyncStore()
const memoryStore = useMemoryStore()
const runStore = useRunStore()
const weatherStore = useWeatherStore()
const router = useRouter()
const navItems: BottomNavItem[] = [
  { to: '/', label: '요약', shortLabel: '요약', icon: 'home' },
  { to: '/runs', label: '기록', shortLabel: '기록', icon: 'log' },
  { to: '/trends', label: '추세', shortLabel: '추세', icon: 'trend' },
  { to: '/memory', label: '기억', shortLabel: '기억', icon: 'memo' }
]
const route = useRoute()
const transitionName = ref('page-slide-forward')
const mainTabRoutes = ['/', '/runs', '/trends', '/memory']
const SWIPE_INTENT_MIN_DISTANCE = 12
const SWIPE_VERTICAL_MIN_DISTANCE = 8
const SWIPE_VERTICAL_DOMINANCE = 0.75
const SWIPE_HORIZONTAL_DOMINANCE = 1.45
const SWIPE_DISTANCE_RATIO = 0.32
const SWIPE_DISTANCE_MAX = 132
const SWIPE_VELOCITY_THRESHOLD = 0.65
const SWIPE_VELOCITY_MIN_DISTANCE = 42
const SWIPE_RELEASE_ANIMATION_MS = 230
const TAB_VIEWPORT_VERTICAL_RESERVE = 170
const tabPanelRefs = ref<HTMLElement[]>([])
const tabViewportHeight = ref(0)
const swipeStartX = ref(0)
const swipeStartY = ref(0)
const swipeStartAt = ref(0)
const swipePointerId = ref<number | null>(null)
const swipeOffset = ref(0)
const swipeLocked = ref<'pending' | 'horizontal' | 'vertical' | null>(null)
const swipeTrackIndex = ref<number | null>(null)
const isTabDragging = ref(false)
const isTabAnimating = ref(false)
const suppressNextTabClick = ref(false)
const injuryCheckInItemId = ref('')
const injuryCheckInSaving = ref(false)
let activePanelObserver: ResizeObserver | null = null
let activePanelMeasureFrame: number | null = null
let activePanelViewportCleanup: (() => void) | null = null
let keyboardInsetCleanup: (() => void) | null = null
let injuryCheckInCleanup: (() => void) | null = null
let swipeReleaseTimer: number | null = null

function getNavIndex(path: string) {
  return navItems.findIndex((item) => item.to === path)
}

const currentTabIndex = computed(() => mainTabRoutes.indexOf(route.path))
const isMainTabRoute = computed(() => currentTabIndex.value !== -1)
const injuryCheckInItem = computed(() => memoryStore.memory.injuryItems.find((item) => item.id === injuryCheckInItemId.value) ?? null)
const tabTrackStyle = computed(() => {
  const index = swipeTrackIndex.value ?? currentTabIndex.value
  return {
    transform: `translate3d(calc(${-index * 100}% + ${swipeOffset.value}px), 0, 0)`
  }
})

watch(
  () => route.path,
  (path, previousPath) => {
    const nextIndex = getNavIndex(path)
    const previousIndex = getNavIndex(previousPath)
    if (nextIndex === -1 || previousIndex === -1) {
      transitionName.value = 'page-fade'
      return
    }
    transitionName.value = nextIndex >= previousIndex ? 'page-slide-forward' : 'page-slide-back'
  }
)

watch(currentTabIndex, () => {
  if (!isTabAnimating.value) resetSwipeState()
  void nextTick(() => {
    observeActivePanel()
    scheduleActivePanelHeightUpdate()
  })
})

watch(
  () => healthKitSyncStore.lastChangedAt,
  () => requestInjuryCheckInPrompt()
)

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (!isAuthenticated) return
    await Promise.all([
      memoryStore.loading ? Promise.resolve() : memoryStore.load(),
      runStore.loaded || runStore.loading ? Promise.resolve() : runStore.load()
    ])
    await healthKitSyncStore.syncAfterActivation()
    await weatherStore.refreshAfterActivation()
    requestInjuryCheckInPrompt()
  },
  { immediate: true }
)

onMounted(() => {
  attachKeyboardInsetTracking()
  attachActivePanelViewportTracking()
  healthKitSyncStore.init()
  healthKitSyncStore.attachActivationListeners()
  weatherStore.init()
  weatherStore.attachActivationListeners()
  attachInjuryCheckInActivationListeners()
  void nextTick(observeActivePanel)
  void resetNativeStartupRoute()
  void healthKitSyncStore.syncAfterActivation()
  void weatherStore.refreshAfterActivation()
  requestInjuryCheckInPrompt()
})

onBeforeUnmount(() => {
  healthKitSyncStore.dispose()
  weatherStore.dispose()
  keyboardInsetCleanup?.()
  keyboardInsetCleanup = null
  injuryCheckInCleanup?.()
  injuryCheckInCleanup = null
  activePanelObserver?.disconnect()
  if (activePanelMeasureFrame !== null) {
    window.cancelAnimationFrame(activePanelMeasureFrame)
    activePanelMeasureFrame = null
  }
  activePanelViewportCleanup?.()
  activePanelViewportCleanup = null
  clearSwipeReleaseTimer()
  document.body.classList.remove('tab-swiping')
})

function attachKeyboardInsetTracking() {
  const updateKeyboardInset = () => {
    const viewport = window.visualViewport
    if (!viewport) {
      document.documentElement.style.setProperty('--keyboard-inset-bottom', '0px')
      return
    }

    const viewportBottom = viewport.offsetTop + viewport.height
    const rawInset = Math.max(0, window.innerHeight - viewportBottom)
    const keyboardInset = rawInset > 80 ? Math.round(rawInset) : 0
    document.documentElement.style.setProperty('--keyboard-inset-bottom', `${keyboardInset}px`)
  }

  updateKeyboardInset()
  window.visualViewport?.addEventListener('resize', updateKeyboardInset)
  window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
  window.addEventListener('orientationchange', updateKeyboardInset)

  keyboardInsetCleanup = () => {
    window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
    window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
    window.removeEventListener('orientationchange', updateKeyboardInset)
    document.documentElement.style.setProperty('--keyboard-inset-bottom', '0px')
  }
}

function attachActivePanelViewportTracking() {
  const schedule = () => scheduleActivePanelHeightUpdate()

  window.visualViewport?.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)

  activePanelViewportCleanup = () => {
    window.visualViewport?.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
  }
}

function attachInjuryCheckInActivationListeners() {
  const request = () => {
    window.setTimeout(requestInjuryCheckInPrompt, 350)
  }
  const requestWhenVisible = () => {
    if (document.visibilityState === 'visible') request()
  }
  window.addEventListener('focus', request)
  window.addEventListener('pageshow', request)
  document.addEventListener('visibilitychange', requestWhenVisible)

  injuryCheckInCleanup = () => {
    window.removeEventListener('focus', request)
    window.removeEventListener('pageshow', request)
    document.removeEventListener('visibilitychange', requestWhenVisible)
  }
}

function requestInjuryCheckInPrompt() {
  if (!authStore.isAuthenticated || injuryCheckInItemId.value || injuryCheckInSaving.value) return
  if (memoryStore.loading || runStore.loading || !runStore.loaded) return
  const item = findDueInjuryCheckIn()
  if (item) injuryCheckInItemId.value = item.id
}

function findDueInjuryCheckIn() {
  const candidates = memoryStore.memory.injuryItems
    .filter((item) => item.status === 'active' || item.status === 'monitoring')
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))

  return candidates.find((item) => {
    if (isInjuryCheckInDismissed(item.id)) return false
    if (isSameLocalDate(item.lastCheckedAt, new Date())) return false
    if (!item.lastCheckedAt) return true
    const latestQualityRun = findLatestQualityRun()
    if (latestQualityRun && compareDateKeys(latestQualityRun.date, item.lastCheckedAt) > 0) return true
    return Date.now() - Date.parse(item.lastCheckedAt) > 72 * 60 * 60 * 1000
  })
}

function findLatestQualityRun() {
  return runStore.sortedRuns.find((run) => isQualitySession(run)) ?? null
}

function isQualitySession(run: RunLog) {
  return ['Easy + Strides', 'Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type) || run.distanceKm >= 10
}

function dismissCurrentInjuryCheckIn() {
  const item = injuryCheckInItem.value
  if (item) localStorage.setItem(injuryCheckInDismissKey(item), '1')
  injuryCheckInItemId.value = ''
}

async function submitInjuryCheckIn(payload: {
  painLevel: number | null
  worsenedDuringOrAfterRun: boolean | null
  dailyActivityPain: boolean | null
  readyForQualitySession: boolean | null
  areaPainLevels: TrainingInjuryCheckIn['areaPainLevels']
  note: string
  markResolved: boolean
}) {
  const current = injuryCheckInItem.value
  if (!current) return
  injuryCheckInSaving.value = true
  try {
    const memory = cloneTrainingMemory(memoryStore.memory)
    const item = memory.injuryItems.find((entry) => entry.id === current.id)
    if (!item) return
    const now = new Date().toISOString()
    const today = localDateKey(new Date())
    const hadPriorQuietCheckIn = (item.checkInHistory ?? []).slice(0, 5).some(isQuietInjuryCheckIn)
    const areaPainLevels = normalizeCheckInAreaPainLevels(item.normalizedAreas, payload.areaPainLevels, payload.painLevel)
    const severity = deriveMaxPainLevel(areaPainLevels) ?? payload.painLevel
    const checkIn: TrainingInjuryCheckIn = {
      id: crypto.randomUUID(),
      checkedAt: now,
      painLevel: severity,
      areaPainLevels,
      worsenedDuringOrAfterRun: payload.worsenedDuringOrAfterRun,
      dailyActivityPain: payload.dailyActivityPain,
      readyForQualitySession: payload.readyForQualitySession,
      note: payload.note,
      source: 'user_check_in'
    }

    item.normalizedAreas = areaPainLevels
    item.severity = severity
    item.lastCheckedAt = now
    item.checkInHistory = [checkIn, ...(item.checkInHistory ?? [])].slice(0, 30)
    if ((severity ?? 0) >= 2 || payload.worsenedDuringOrAfterRun || payload.dailyActivityPain) {
      item.lastFlareDate = today
    }
    if (payload.markResolved && isQuietInjuryCheckInResponse({ ...payload, painLevel: severity, areaPainLevels }) && hadPriorQuietCheckIn) {
      item.status = 'resolved'
      item.resolvedAt = now
      if (memory.activeInjuryItemId === item.id) {
        memory.activeInjuryItemId = memory.injuryItems.find((entry) => entry.id !== item.id && (entry.status === 'active' || entry.status === 'monitoring'))?.id ?? null
      }
    }
    item.updatedAt = now

    await memoryStore.update(memory)
    injuryCheckInItemId.value = ''
  } finally {
    injuryCheckInSaving.value = false
  }
}

function isInjuryCheckInDismissed(itemId: string) {
  const item = memoryStore.memory.injuryItems.find((entry) => entry.id === itemId)
  return item ? localStorage.getItem(injuryCheckInDismissKey(item)) === '1' : false
}

function isQuietInjuryCheckIn(value: TrainingInjuryCheckIn) {
  return isQuietInjuryCheckInResponse(value)
}

function isQuietInjuryCheckInResponse(value: {
  painLevel: number | null
  areaPainLevels?: TrainingInjuryCheckIn['areaPainLevels']
  worsenedDuringOrAfterRun: boolean | null
  dailyActivityPain: boolean | null
  readyForQualitySession: boolean | null
}) {
  const painLevel = deriveMaxPainLevel(value.areaPainLevels ?? []) ?? value.painLevel
  return painLevel !== null && painLevel <= 1 && value.worsenedDuringOrAfterRun === false && value.dailyActivityPain === false && value.readyForQualitySession === true
}

function normalizeCheckInAreaPainLevels(
  currentAreas: TrainingInjuryCheckIn['areaPainLevels'],
  nextAreas: TrainingInjuryCheckIn['areaPainLevels'],
  fallbackPainLevel: number | null
) {
  const nextById = new Map(nextAreas.map((area) => [area.areaId, area.painLevel]))
  if (currentAreas.length) {
    return currentAreas.map((area) => ({
      ...area,
      painLevel: nextById.has(area.areaId) ? nextById.get(area.areaId) ?? null : fallbackPainLevel
    }))
  }
  return nextAreas.map((area) => ({ ...area }))
}

function deriveMaxPainLevel(areas: TrainingInjuryCheckIn['areaPainLevels']) {
  const levels = areas.map((area) => area.painLevel).filter((value): value is number => value !== null)
  return levels.length ? Math.max(...levels) : null
}

function injuryCheckInDismissKey(item: TrainingMemory['injuryItems'][number]) {
  return createInjuryCheckInDismissKey({
    userId: memoryStore.selectedUserId,
    itemId: item.id,
    todayKey: localDateKey(new Date()),
    latestQualityRunDate: findLatestQualityRun()?.date ?? null,
    lastCheckedAt: item.lastCheckedAt
  })
}

function isSameLocalDate(value: string | null, date: Date) {
  if (!value) return false
  return localDateKey(new Date(value)) === localDateKey(date)
}

function compareDateKeys(a: string, b: string) {
  return a.slice(0, 10).localeCompare(b.slice(0, 10))
}

function localDateKey(date: Date) {
  return date.toLocaleDateString('sv-SE')
}

function cloneTrainingMemory(memory: TrainingMemory): TrainingMemory {
  return JSON.parse(JSON.stringify(memory))
}

async function resetNativeStartupRoute() {
  await router.isReady()
  if (!hasNativeBridge()) return
  if (route.path === '/auth' || route.path === '/access' || route.path === '/') return
  await router.replace('/')
}

function setTabPanelRef(element: unknown, index: number) {
  if (element instanceof HTMLElement) {
    tabPanelRefs.value[index] = element
  }
}

function observeActivePanel() {
  activePanelObserver?.disconnect()
  if (!isMainTabRoute.value) return
  const panel = tabPanelRefs.value[currentTabIndex.value]
  if (!panel) return

  const updateHeight = () => updateActivePanelHeight(panel)
  updateHeight()
  scheduleActivePanelHeightUpdate()
  activePanelObserver = new ResizeObserver(updateHeight)
  activePanelObserver.observe(panel)
}

function updateActivePanelHeight(panel = tabPanelRefs.value[currentTabIndex.value]) {
  if (!panel || !isMainTabRoute.value) return
  tabViewportHeight.value = Math.max(panel.getBoundingClientRect().height, window.innerHeight - TAB_VIEWPORT_VERTICAL_RESERVE)
}

function scheduleActivePanelHeightUpdate() {
  if (activePanelMeasureFrame !== null) window.cancelAnimationFrame(activePanelMeasureFrame)
  activePanelMeasureFrame = window.requestAnimationFrame(() => {
    activePanelMeasureFrame = null
    updateActivePanelHeight()
  })
}

function isSwipeBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (
    target.closest(
      'a, button, input, textarea, select, option, label, [role="button"], [role="tab"], [role="slider"], [contenteditable="true"], .bottom-sheet-layer, .side-drawer-layer, .memory-stack-layer, .coach-input-bar, .trend-lens-tabs, .trend-overall-summary-row-action, .trend-chart, .trend-echart, .trend-lens-chart, .trend-lens-echart, [data-horizontal-scroll], [data-no-swipe]'
    )
  ) {
    return true
  }

  let element: Element | null = target
  while (element && !element.classList.contains('tab-swipe-viewport')) {
    if (element instanceof HTMLElement) {
      const style = window.getComputedStyle(element)
      const canScrollX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1
      if (canScrollX) return true
    }
    element = element.parentElement
  }
  return false
}

function onTabPointerDown(event: PointerEvent) {
  if (!isMainTabRoute.value || isTabAnimating.value || !event.isPrimary || isSwipeBlockedTarget(event.target)) return

  swipeStartX.value = event.clientX
  swipeStartY.value = event.clientY
  swipeStartAt.value = Date.now()
  swipePointerId.value = event.pointerId
  swipeTrackIndex.value = currentTabIndex.value
  swipeLocked.value = 'pending'
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onTabPointerMove(event: PointerEvent) {
  if (swipePointerId.value !== event.pointerId || !swipeLocked.value) return

  const deltaX = event.clientX - swipeStartX.value
  const deltaY = event.clientY - swipeStartY.value

  if (swipeLocked.value === 'pending') {
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    if (Math.max(absX, absY) < SWIPE_INTENT_MIN_DISTANCE) return
    if (absY >= SWIPE_VERTICAL_MIN_DISTANCE && absY >= absX * SWIPE_VERTICAL_DOMINANCE) {
      swipeLocked.value = 'vertical'
      return
    }
    if (absX > absY * SWIPE_HORIZONTAL_DOMINANCE) {
      swipeLocked.value = 'horizontal'
    } else {
      return
    }
  }

  if (swipeLocked.value !== 'horizontal') return
  event.preventDefault()
  isTabDragging.value = true
  document.body.classList.add('tab-swiping')

  const isFirst = currentTabIndex.value === 0
  const isLast = currentTabIndex.value === mainTabRoutes.length - 1
  const resistedDelta = (isFirst && deltaX > 0) || (isLast && deltaX < 0) ? deltaX * 0.28 : deltaX
  swipeOffset.value = resistedDelta
}

function onTabPointerEnd(event: PointerEvent) {
  if (swipePointerId.value !== event.pointerId) return

  const deltaX = event.clientX - swipeStartX.value
  const elapsed = Math.max(Date.now() - swipeStartAt.value, 1)
  const viewportWidth = (event.currentTarget as HTMLElement).clientWidth || window.innerWidth || 390
  const absDeltaX = Math.abs(deltaX)
  const distanceThreshold = Math.min(SWIPE_DISTANCE_MAX, viewportWidth * SWIPE_DISTANCE_RATIO)
  const isDistanceNavigation = absDeltaX > distanceThreshold
  const isVelocityNavigation = Math.abs(deltaX / elapsed) > SWIPE_VELOCITY_THRESHOLD && absDeltaX > SWIPE_VELOCITY_MIN_DISTANCE
  const shouldNavigate = swipeLocked.value === 'horizontal' && (isDistanceNavigation || isVelocityNavigation)
  const nextIndex = deltaX < 0 ? currentTabIndex.value + 1 : currentTabIndex.value - 1

  if (swipeLocked.value === 'horizontal') {
    suppressNextTabClick.value = true
    window.setTimeout(() => {
      suppressNextTabClick.value = false
    }, 0)
  }

  if (shouldNavigate && mainTabRoutes[nextIndex]) {
    const targetOffset = nextIndex > currentTabIndex.value ? -viewportWidth : viewportWidth
    animateTabRelease(targetOffset, mainTabRoutes[nextIndex])
    return
  }

  if (swipeLocked.value === 'horizontal') {
    animateTabRelease(0, null)
    return
  }

  resetSwipeState()
}

function onTabClickCapture(event: MouseEvent) {
  if (!suppressNextTabClick.value) return
  event.preventDefault()
  event.stopPropagation()
  suppressNextTabClick.value = false
}

function resetSwipeState() {
  clearSwipeReleaseTimer()
  swipePointerId.value = null
  swipeLocked.value = null
  swipeTrackIndex.value = null
  swipeOffset.value = 0
  swipeStartAt.value = 0
  isTabDragging.value = false
  isTabAnimating.value = false
  document.body.classList.remove('tab-swiping')
}

function clearSwipeReleaseTimer() {
  if (swipeReleaseTimer === null) return
  window.clearTimeout(swipeReleaseTimer)
  swipeReleaseTimer = null
}

function animateTabRelease(targetOffset: number, targetRoute: string | null) {
  clearSwipeReleaseTimer()
  isTabAnimating.value = true
  isTabDragging.value = false
  document.body.classList.remove('tab-swiping')
  swipeOffset.value = targetOffset

  swipeReleaseTimer = window.setTimeout(() => {
    swipeReleaseTimer = null
    if (!targetRoute) {
      resetSwipeState()
      return
    }
    void router.push(targetRoute).catch(() => undefined).finally(resetSwipeState)
  }, SWIPE_RELEASE_ANIMATION_MS)
}
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <ToastHost />
    <InjuryCheckInSheet
      :open="Boolean(injuryCheckInItem)"
      :item="injuryCheckInItem"
      :saving="injuryCheckInSaving"
      @close="dismissCurrentInjuryCheckIn"
      @submit="submitInjuryCheckIn"
    />
    <div
      v-if="isMainTabRoute"
      class="tab-swipe-viewport"
      :class="{ 'is-dragging': isTabDragging }"
      :style="{ height: `${tabViewportHeight}px` }"
      @pointerdown="onTabPointerDown"
      @pointermove="onTabPointerMove"
      @pointerup="onTabPointerEnd"
      @pointercancel="onTabPointerEnd"
      @click.capture="onTabClickCapture"
    >
      <div class="tab-swipe-track" :class="{ 'is-dragging': isTabDragging }" :style="tabTrackStyle">
        <section :ref="(element) => setTabPanelRef(element, 0)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 0" :inert="currentTabIndex !== 0">
          <DashboardPage />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 1)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 1" :inert="currentTabIndex !== 1">
          <RunLogPage />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 2)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 2" :inert="currentTabIndex !== 2">
          <TrendsPage />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 3)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 3" :inert="currentTabIndex !== 3">
          <MemoryPage />
        </section>
      </div>
    </div>
    <RouterView v-else v-slot="{ Component, route: viewRoute }">
      <Transition :name="transitionName" mode="out-in">
        <component :is="Component" :key="viewRoute.path" />
      </Transition>
    </RouterView>
  </AppShell>
</template>

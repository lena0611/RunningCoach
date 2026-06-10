<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import type { TrainingInjuryCheckIn, TrainingMemory } from '@/entities/training-memory/model'
import {
  createInjuryCheckInDismissKey,
  createInjuryScreeningGuideSeenKey,
  createInjuryScreeningPromptedKey
} from '@/features/injury-check-in/injuryCheckInPrompt'
import { hasNativeBridge } from '@/shared/lib/runtime'
import AppShell from '@/shared/ui/AppShell.vue'
import InjuryCheckInSheet from '@/shared/ui/InjuryCheckInSheet.vue'
import InjuryScreeningSheet from '@/shared/ui/InjuryScreeningSheet.vue'
import ToastHost from '@/shared/ui/ToastHost.vue'
import OnboardingFlow from '@/pages/onboarding/OnboardingFlow.vue'
import CelebrationModal from '@/pages/dashboard/CelebrationModal.vue'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { resolveRunnerProgress } from '@/shared/lib/level/levelModel'
import { getThisWeekRuns } from '@/shared/lib/runStats'
import type { BottomNavItem } from '@/shared/ui/BottomNav.vue'

const authStore = useAuthStore()
const healthKitSyncStore = useHealthKitSyncStore()
const memoryStore = useMemoryStore()
const runStore = useRunStore()
const weatherStore = useWeatherStore()
const levelStore = useLevelStore()
const showOnboarding = computed(() => authStore.isAuthenticated && isSupabaseConfigured && levelStore.needsOnboarding)
watch(
  () => authStore.isAuthenticated,
  (auth) => {
    if (auth && isSupabaseConfigured && !levelStore.loaded && !levelStore.loading) void levelStore.load()
  },
  { immediate: true }
)
const runnerProgress = computed(() =>
  resolveRunnerProgress(memoryStore.memory.athleteProfile, runStore.sortedRuns, new Date(), {
    maxDistanceM: levelStore.selfReportedMaxDistanceM
  })
)
const weeklyDone = computed(() => getThisWeekRuns(runStore.sortedRuns, new Date()).length)
const weeklyTarget = computed(() => memoryStore.memory.athleteProfile.weeklyRunDaysTarget ?? 0)
const lastSelfRaceRunId = computed(() => runStore.sortedRuns.find((run) => run.tags?.includes('self-race'))?.id ?? null)
// 보상 동기화는 run/memory 가 완전히 로드된 뒤에만 실행한다(로드 경합으로 인한 가짜 레벨업 축하 방지).
watch(
  () => [
    levelStore.loaded,
    levelStore.needsOnboarding,
    runStore.loaded,
    memoryStore.loaded,
    runnerProgress.value.distanceClass.key,
    runnerProgress.value.grade?.key ?? null,
    weeklyDone.value,
    lastSelfRaceRunId.value
  ],
  () => {
    if (!isSupabaseConfigured || !authStore.isAuthenticated) return
    if (!levelStore.loaded || levelStore.needsOnboarding) return
    if (!runStore.loaded || !memoryStore.loaded) return
    void levelStore.syncRewards(runnerProgress.value, weeklyDone.value, weeklyTarget.value, lastSelfRaceRunId.value)
  },
  { immediate: true }
)
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
// 탭 페이지는 지연 로드: 활성 탭만 우선 받고, 스와이프 시작/탭 선택 시 이웃·대상 탭을 비동기로 채운다.
const TabSkeleton = () => h('div', { class: 'tab-panel-skeleton', 'aria-hidden': 'true' })
const DashboardPage = defineAsyncComponent({ loader: () => import('@/pages/dashboard/DashboardPage.vue'), loadingComponent: TabSkeleton, delay: 0 })
const RunLogPage = defineAsyncComponent({ loader: () => import('@/pages/run-log/RunLogPage.vue'), loadingComponent: TabSkeleton, delay: 0 })
const TrendsPage = defineAsyncComponent({ loader: () => import('@/pages/trends/TrendsPage.vue'), loadingComponent: TabSkeleton, delay: 0 })
const MemoryPage = defineAsyncComponent({ loader: () => import('@/pages/memory/MemoryPage.vue'), loadingComponent: TabSkeleton, delay: 0 })
const loadedTabs = ref(new Set<number>())
function loadTab(index: number) {
  if (index < 0 || index >= mainTabRoutes.length || loadedTabs.value.has(index)) return
  const next = new Set(loadedTabs.value)
  next.add(index)
  loadedTabs.value = next
}
function loadAdjacentTabs(index: number) {
  loadTab(index)
  loadTab(index - 1)
  loadTab(index + 1)
}
const SWIPE_INTENT_MIN_DISTANCE = 12
const SWIPE_VERTICAL_MIN_DISTANCE = 8
const SWIPE_VERTICAL_DOMINANCE = 0.75
const SWIPE_HORIZONTAL_DOMINANCE = 1.2
// 첫 move 방향 확정용 최소 이동(px). 이 이상 움직인 첫 touchmove에서 즉시 수평/수직을 정한다.
const SWIPE_FIRST_MOVE_MIN = 6
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
const injuryScreeningOpen = ref(false)
const SCREENING_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
let activePanelObserver: ResizeObserver | null = null
let activePanelMeasureFrame: number | null = null
let activePanelViewportCleanup: (() => void) | null = null
let keyboardInsetCleanup: (() => void) | null = null
let injuryCheckInCleanup: (() => void) | null = null
let touchZoomCleanup: (() => void) | null = null
let swipeReleaseTimer: number | null = null
let suppressClickTimer: number | null = null
// 수평 스와이프 락 동안 활성 패널의 세로 스크롤을 고정값으로 핀(reflow 없이 세로 스크롤 억제).
let swipeLockedPanel: HTMLElement | null = null
let swipeLockedScrollTop = 0

function clearSuppressClickTimer() {
  if (suppressClickTimer === null) return
  window.clearTimeout(suppressClickTimer)
  suppressClickTimer = null
}

function lockHorizontalSwipe() {
  swipeLocked.value = 'horizontal'
  swipeLockedPanel = tabPanelRefs.value[currentTabIndex.value] ?? null
  swipeLockedScrollTop = swipeLockedPanel?.scrollTop ?? 0
}

// Pointer Events의 preventDefault는 iOS 네이티브 스크롤을 막지 못한다(오직 non-passive
// touchmove만 가능). 또한 스크롤이 시작된 뒤의 touchmove는 취소 불가이므로, 첫 유의미한
// touchmove에서 방향을 확정하고 수평이면 그 즉시 preventDefault해 스크롤 시작 자체를 막는다.
function preventNativeScrollDuringSwipe(event: TouchEvent) {
  if (!swipeLocked.value) return
  if (swipeLocked.value === 'pending') {
    const touch = event.touches[0]
    if (!touch) return
    const absX = Math.abs(touch.clientX - swipeStartX.value)
    const absY = Math.abs(touch.clientY - swipeStartY.value)
    if (Math.max(absX, absY) < SWIPE_FIRST_MOVE_MIN) return
    if (absX > absY) {
      lockHorizontalSwipe()
    } else {
      swipeLocked.value = 'vertical'
      return
    }
  }
  if (swipeLocked.value === 'horizontal' && event.cancelable) event.preventDefault()
}

function getNavIndex(path: string) {
  return navItems.findIndex((item) => item.to === path)
}

const currentTabIndex = computed(() => mainTabRoutes.indexOf(route.path))
const isMainTabRoute = computed(() => currentTabIndex.value !== -1)
const injuryCheckInItem = computed(() => memoryStore.memory.injuryItems.find((item) => item.id === injuryCheckInItemId.value) ?? null)
// 이 체크인을 띄운 "방금 들어온" 세션(최근 2일 이내일 때만 브리지 문장/숏컷 노출).
const injuryCheckInContextRun = computed(() => {
  if (!injuryCheckInItem.value) return null
  const latest = runStore.sortedRuns[0]
  if (!latest?.date) return null
  const ageMs = Date.now() - Date.parse(latest.date)
  if (!Number.isFinite(ageMs) || ageMs > 2 * 24 * 60 * 60 * 1000) return null
  return latest
})
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
  loadTab(currentTabIndex.value)
  if (!isTabAnimating.value) resetSwipeState()
  void nextTick(() => {
    // 패널은 독립 스크롤러이므로 탭 도착 시 상단으로 정상화(어중간한 스크롤 상태 방지).
    const activePanel = tabPanelRefs.value[currentTabIndex.value]
    if (activePanel) activePanel.scrollTop = 0
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
  attachTouchZoomGuard()
  attachActivePanelViewportTracking()
  healthKitSyncStore.init()
  healthKitSyncStore.attachActivationListeners()
  weatherStore.init()
  weatherStore.attachActivationListeners()
  attachInjuryCheckInActivationListeners()
  loadTab(currentTabIndex.value)
  void nextTick(observeActivePanel)
  void resetNativeStartupRoute()
  void healthKitSyncStore.syncAfterActivation()
  void weatherStore.refreshAfterActivation()
  requestInjuryCheckInPrompt()
  document.addEventListener('touchmove', preventNativeScrollDuringSwipe, { passive: false })
})

onBeforeUnmount(() => {
  healthKitSyncStore.dispose()
  weatherStore.dispose()
  keyboardInsetCleanup?.()
  keyboardInsetCleanup = null
  touchZoomCleanup?.()
  touchZoomCleanup = null
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
  clearSuppressClickTimer()
  document.removeEventListener('touchmove', preventNativeScrollDuringSwipe)
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

function attachTouchZoomGuard() {
  let lastTouchEndedAt = 0

  const preventGestureZoom = (event: Event) => {
    event.preventDefault()
  }

  const preventDoubleTapZoom = (event: TouchEvent) => {
    if (event.touches.length > 0) return
    const now = Date.now()
    if (now - lastTouchEndedAt < 320) event.preventDefault()
    lastTouchEndedAt = now
  }

  document.addEventListener('gesturestart', preventGestureZoom)
  document.addEventListener('gesturechange', preventGestureZoom)
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false })

  touchZoomCleanup = () => {
    document.removeEventListener('gesturestart', preventGestureZoom)
    document.removeEventListener('gesturechange', preventGestureZoom)
    document.removeEventListener('touchend', preventDoubleTapZoom)
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
  if (!authStore.isAuthenticated || injuryCheckInItemId.value || injuryCheckInSaving.value || injuryScreeningOpen.value) return
  if (memoryStore.loading || runStore.loading || !runStore.loaded) return
  const hasManagedInjury = memoryStore.memory.injuryItems.some((item) => item.status === 'active' || item.status === 'monitoring')
  if (hasManagedInjury) {
    const item = findDueInjuryCheckIn()
    if (item) injuryCheckInItemId.value = item.id
    return
  }
  if (isInjuryScreeningDue()) injuryScreeningOpen.value = true
}

function findDueInjuryCheckIn() {
  const candidates = memoryStore.memory.injuryItems
    .filter((item) => item.status === 'active' || item.status === 'monitoring')
    .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))

  return candidates.find((item) => {
    if (isInjuryCheckInDismissed(item.id)) return false
    if (isSameLocalDate(item.lastCheckedAt, new Date())) return false
    if (!item.lastCheckedAt) return true
    const latestRun = findLatestRun()
    if (latestRun && compareDateKeys(latestRun.date, item.lastCheckedAt) > 0) return true
    return Date.now() - Date.parse(item.lastCheckedAt) > 72 * 60 * 60 * 1000
  })
}

function findLatestRun() {
  return runStore.sortedRuns[0] ?? null
}

function isInjuryScreeningDue() {
  const latestRun = findLatestRun()
  if (!latestRun) return false
  const promptedRaw = localStorage.getItem(createInjuryScreeningPromptedKey(memoryStore.selectedUserId))
  if (!promptedRaw) return true
  const promptedAt = Date.parse(promptedRaw)
  if (!Number.isFinite(promptedAt)) return true
  if (isSameLocalDate(promptedRaw, new Date())) return false
  if (compareDateKeys(latestRun.date, promptedRaw) <= 0) return false
  return Date.now() - promptedAt >= SCREENING_INTERVAL_MS
}

function markInjuryScreeningPrompted() {
  localStorage.setItem(createInjuryScreeningPromptedKey(memoryStore.selectedUserId), new Date().toISOString())
}

function dismissInjuryScreening(payload: { sawGuide: boolean }) {
  if (payload.sawGuide) localStorage.setItem(createInjuryScreeningGuideSeenKey(memoryStore.selectedUserId), '1')
  markInjuryScreeningPrompted()
  injuryScreeningOpen.value = false
}

function openInjuryRegistration() {
  markInjuryScreeningPrompted()
  injuryScreeningOpen.value = false
  void router.push({ path: '/memory', query: { panel: 'injuries', new: '1' } })
}

const injuryScreeningShowGuide = computed(() => localStorage.getItem(createInjuryScreeningGuideSeenKey(memoryStore.selectedUserId)) !== '1')

function dismissCurrentInjuryCheckIn() {
  const item = injuryCheckInItem.value
  if (item) localStorage.setItem(injuryCheckInDismissKey(item), '1')
  injuryCheckInItemId.value = ''
}

// 숏컷 이동: 체크인을 저장/dismiss하지 않고 닫기만 한다(나중에 다시 뜸).
function openInjuryCheckInSession() {
  const run = injuryCheckInContextRun.value
  injuryCheckInItemId.value = ''
  if (run) void router.push({ path: '/runs', query: { runId: run.id } })
}

function askInjuryCheckInCoach() {
  const run = injuryCheckInContextRun.value
  injuryCheckInItemId.value = ''
  if (run) void router.push({ path: '/runs', query: { runId: run.id, coach: '1' } })
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
    latestRunDate: findLatestRun()?.date ?? null,
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
      'input, textarea, select, option, label, [role="slider"], [contenteditable="true"], .bottom-sheet-layer, .side-drawer-layer, .memory-stack-layer, .coach-input-bar, .trend-lens-tabs, [data-horizontal-scroll], [data-no-swipe]'
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

  loadAdjacentTabs(currentTabIndex.value)
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
      lockHorizontalSwipe()
    } else {
      return
    }
  }

  if (swipeLocked.value !== 'horizontal') return
  event.preventDefault()
  isTabDragging.value = true
  document.body.classList.add('tab-swiping')
  // 세로 스크롤 동반 방지: overflow 토글(=pointercancel 유발) 대신 scrollTop을 핀.
  if (swipeLockedPanel) swipeLockedPanel.scrollTop = swipeLockedScrollTop

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
    // iOS 합성 click(touchend 후 ~300ms)을 안정적으로 막기 위한 suppress 윈도우.
    clearSuppressClickTimer()
    suppressClickTimer = window.setTimeout(() => {
      suppressNextTabClick.value = false
      suppressClickTimer = null
    }, 350)
  }

  if (shouldNavigate && mainTabRoutes[nextIndex]) {
    // 슬라이드 시작 전에 떠나는 페이지의 스크롤-구동 sticky(예: 기록 년월)를 즉시 정리하도록 알린다.
    window.dispatchEvent(new CustomEvent('pacelab:tab-swipe-commit'))
    // 들어오는 패널이 옛 스크롤 위치로 슬라이드인되지 않도록 미리 상단으로 맞춘다.
    const targetPanel = tabPanelRefs.value[nextIndex]
    if (targetPanel) targetPanel.scrollTop = 0
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

// pointercancel은 사용자가 손을 뗀 게 아니라 브라우저가 제스처를 가로챈 것이므로,
// 절대 네비게이션을 커밋하지 않고 현재 탭으로 스냅백한다(mid-drag 네비 방지).
function onTabPointerCancel(event: PointerEvent) {
  if (swipePointerId.value !== event.pointerId) return
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
  swipeLockedPanel = null
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
    <OnboardingFlow v-if="showOnboarding" />
    <CelebrationModal
      v-if="levelStore.pendingCelebration"
      :events="levelStore.pendingCelebration.events"
      :coins="levelStore.pendingCelebration.coins"
      @dismiss="levelStore.dismissCelebration()"
    />
    <InjuryCheckInSheet
      :open="Boolean(injuryCheckInItem)"
      :item="injuryCheckInItem"
      :saving="injuryCheckInSaving"
      :context-run="injuryCheckInContextRun"
      @close="dismissCurrentInjuryCheckIn"
      @open-session="openInjuryCheckInSession"
      @ask-coach="askInjuryCheckInCoach"
      @submit="submitInjuryCheckIn"
    />
    <InjuryScreeningSheet
      :open="injuryScreeningOpen"
      :show-guide="injuryScreeningShowGuide"
      @close="injuryScreeningOpen = false"
      @register="openInjuryRegistration"
      @acknowledge="dismissInjuryScreening"
    />
    <div
      v-if="isMainTabRoute"
      class="tab-swipe-viewport"
      :class="{ 'is-dragging': isTabDragging }"
      @pointerdown="onTabPointerDown"
      @pointermove="onTabPointerMove"
      @pointerup="onTabPointerEnd"
      @pointercancel="onTabPointerCancel"
      @click.capture="onTabClickCapture"
    >
      <div class="tab-swipe-track" :class="{ 'is-dragging': isTabDragging }" :style="tabTrackStyle">
        <section :ref="(element) => setTabPanelRef(element, 0)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 0" :inert="currentTabIndex !== 0">
          <DashboardPage v-if="loadedTabs.has(0)" />
          <TabSkeleton v-else />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 1)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 1" :inert="currentTabIndex !== 1">
          <RunLogPage v-if="loadedTabs.has(1)" />
          <TabSkeleton v-else />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 2)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 2" :inert="currentTabIndex !== 2">
          <TrendsPage v-if="loadedTabs.has(2)" />
          <TabSkeleton v-else />
        </section>
        <section :ref="(element) => setTabPanelRef(element, 3)" class="tab-swipe-panel" :aria-hidden="currentTabIndex !== 3" :inert="currentTabIndex !== 3">
          <MemoryPage v-if="loadedTabs.has(3)" />
          <TabSkeleton v-else />
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

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import DashboardPage from '@/pages/dashboard/DashboardPage.vue'
import RunLogPage from '@/pages/run-log/RunLogPage.vue'
import MemoryPage from '@/pages/memory/MemoryPage.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import AppShell from '@/shared/ui/AppShell.vue'
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
  { to: '/memory', label: '기억', shortLabel: '기억', icon: 'memo' }
]
const route = useRoute()
const transitionName = ref('page-slide-forward')
const mainTabRoutes = ['/', '/runs', '/memory']
const tabPanelRefs = ref<HTMLElement[]>([])
const tabViewportHeight = ref(0)
const swipeStartX = ref(0)
const swipeStartY = ref(0)
const swipeStartAt = ref(0)
const swipePointerId = ref<number | null>(null)
const swipeOffset = ref(0)
const swipeLocked = ref<'pending' | 'horizontal' | 'vertical' | null>(null)
const isTabDragging = ref(false)
const suppressNextTabClick = ref(false)
let activePanelObserver: ResizeObserver | null = null
let keyboardInsetCleanup: (() => void) | null = null

function getNavIndex(path: string) {
  return navItems.findIndex((item) => item.to === path)
}

const currentTabIndex = computed(() => mainTabRoutes.indexOf(route.path))
const isMainTabRoute = computed(() => currentTabIndex.value !== -1)
const tabTrackStyle = computed(() => ({
  transform: `translate3d(calc(${-currentTabIndex.value * 100}% + ${swipeOffset.value}px), 0, 0)`
}))

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
  resetSwipeState()
  void nextTick(observeActivePanel)
})

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
  },
  { immediate: true }
)

onMounted(() => {
  attachKeyboardInsetTracking()
  healthKitSyncStore.init()
  healthKitSyncStore.attachActivationListeners()
  weatherStore.init()
  weatherStore.attachActivationListeners()
  void nextTick(observeActivePanel)
  void resetNativeStartupRoute()
  void healthKitSyncStore.syncAfterActivation()
  void weatherStore.refreshAfterActivation()
})

onBeforeUnmount(() => {
  healthKitSyncStore.dispose()
  weatherStore.dispose()
  keyboardInsetCleanup?.()
  keyboardInsetCleanup = null
  activePanelObserver?.disconnect()
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

  const updateHeight = () => {
    tabViewportHeight.value = Math.max(panel.getBoundingClientRect().height, window.innerHeight - 170)
  }
  updateHeight()
  activePanelObserver = new ResizeObserver(updateHeight)
  activePanelObserver.observe(panel)
}

function isSwipeBlockedTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true
  if (
    target.closest(
      'a, input, textarea, select, option, label, [contenteditable="true"], .bottom-sheet-layer, .side-drawer-layer, .memory-stack-layer, .coach-input-bar, [data-no-swipe]'
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
  if (!isMainTabRoute.value || !event.isPrimary || isSwipeBlockedTarget(event.target)) return

  swipeStartX.value = event.clientX
  swipeStartY.value = event.clientY
  swipeStartAt.value = Date.now()
  swipePointerId.value = event.pointerId
  swipeLocked.value = 'pending'
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onTabPointerMove(event: PointerEvent) {
  if (swipePointerId.value !== event.pointerId || !swipeLocked.value) return

  const deltaX = event.clientX - swipeStartX.value
  const deltaY = event.clientY - swipeStartY.value

  if (swipeLocked.value === 'pending') {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 9) return
    swipeLocked.value = Math.abs(deltaX) > Math.abs(deltaY) * 1.18 ? 'horizontal' : 'vertical'
    if (swipeLocked.value === 'vertical') return
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
  const width = window.innerWidth || 390
  const shouldNavigate = swipeLocked.value === 'horizontal' && (Math.abs(deltaX) > Math.min(120, width * 0.26) || Math.abs(deltaX / elapsed) > 0.52)
  const nextIndex = deltaX < 0 ? currentTabIndex.value + 1 : currentTabIndex.value - 1

  if (shouldNavigate && mainTabRoutes[nextIndex]) {
    void router.push(mainTabRoutes[nextIndex])
  }

  if (swipeLocked.value === 'horizontal') {
    suppressNextTabClick.value = true
    window.setTimeout(() => {
      suppressNextTabClick.value = false
    }, 0)
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
  swipePointerId.value = null
  swipeLocked.value = null
  swipeOffset.value = 0
  swipeStartAt.value = 0
  isTabDragging.value = false
  document.body.classList.remove('tab-swiping')
}
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <ToastHost />
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

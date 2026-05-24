<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/shared/ui/AppHeader.vue'
import BottomNav, { type BottomNavItem } from '@/shared/ui/BottomNav.vue'

const props = defineProps<{
  navItems: BottomNavItem[]
  isAuthenticated: boolean
}>()

const emit = defineEmits<{ signOut: [] }>()
const route = useRoute()
const router = useRouter()
const touchStartX = ref(0)
const touchStartY = ref(0)
const touchStartAt = ref(0)
const swipeableRoutes = computed(() => props.navItems.map((item) => item.to))

function getRouteIndex(path: string) {
  return swipeableRoutes.value.indexOf(path)
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'a, button, input, textarea, select, label, [role="button"], .bottom-sheet-layer, .side-drawer-layer, [data-no-swipe]'
    )
  )
}

function onTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1 || isInteractiveTarget(event.target)) return
  if (getRouteIndex(route.path) === -1) return

  const touch = event.touches[0]
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
  touchStartAt.value = Date.now()
}

function onTouchEnd(event: TouchEvent) {
  if (!touchStartAt.value || event.changedTouches.length !== 1) return

  const touch = event.changedTouches[0]
  const deltaX = touch.clientX - touchStartX.value
  const deltaY = touch.clientY - touchStartY.value
  const elapsed = Date.now() - touchStartAt.value
  touchStartAt.value = 0

  const isHorizontal = Math.abs(deltaX) > 72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.45
  if (!isHorizontal || elapsed > 800) return

  const currentIndex = getRouteIndex(route.path)
  if (currentIndex === -1) return

  const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1
  const nextItem = props.navItems[nextIndex]
  if (!nextItem) return
  router.push(nextItem.to)
}
</script>

<template>
  <div class="app-shell">
    <AppHeader :is-authenticated="isAuthenticated" @sign-out="emit('signOut')" />
    <main class="app-main" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <slot />
    </main>
    <BottomNav :items="navItems" />
  </div>
</template>

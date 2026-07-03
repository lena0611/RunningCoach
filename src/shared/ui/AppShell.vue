<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/shared/ui/AppHeader.vue'
import BottomNav, { type BottomNavItem } from '@/shared/ui/BottomNav.vue'

const props = defineProps<{
  navItems: BottomNavItem[]
  isAuthenticated: boolean
}>()

const emit = defineEmits<{ signOut: []; openAchievements: [] }>()
const route = useRoute()

function getRouteIndex(path: string | undefined) {
  if (!path) return -1
  return props.navItems.findIndex((item) => item.to === path)
}

// 하단 네비 탭 라우트에서만 고정 100dvh + 내부 스크롤 레이아웃을 적용한다.
const isTabRoute = computed(() => getRouteIndex(route.path) !== -1)

watch(
  () => route.path,
  (path, previousPath) => {
    if (path === previousPath) return
    if (getRouteIndex(path) === -1 || getRouteIndex(previousPath) === -1) return
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.querySelector('.app-main')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }
)
</script>

<template>
  <div class="app-shell" :class="{ 'is-tab-home': isTabRoute }">
    <AppHeader :is-authenticated="isAuthenticated" @sign-out="emit('signOut')" @open-achievements="emit('openAchievements')" />
    <main class="app-main">
      <slot />
    </main>
    <div class="bottom-nav-scrim" aria-hidden="true" />
    <BottomNav :items="navItems" />
  </div>
</template>

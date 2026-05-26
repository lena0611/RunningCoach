<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/shared/ui/AppHeader.vue'
import BottomNav, { type BottomNavItem } from '@/shared/ui/BottomNav.vue'

const props = defineProps<{
  navItems: BottomNavItem[]
  isAuthenticated: boolean
}>()

const emit = defineEmits<{ signOut: [] }>()
const route = useRoute()

function getRouteIndex(path: string | undefined) {
  if (!path) return -1
  return props.navItems.findIndex((item) => item.to === path)
}

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
  <div class="app-shell">
    <AppHeader :is-authenticated="isAuthenticated" @sign-out="emit('signOut')" />
    <main class="app-main">
      <slot />
    </main>
    <div class="bottom-nav-scrim" aria-hidden="true" />
    <BottomNav :items="navItems" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import AppShell from '@/shared/ui/AppShell.vue'
import type { BottomNavItem } from '@/shared/ui/BottomNav.vue'

const authStore = useAuthStore()
const navItems: BottomNavItem[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { to: '/upload', label: 'Upload', shortLabel: 'Upload', icon: 'upload' },
  { to: '/runs', label: 'Run Log', shortLabel: 'Log', icon: 'log' },
  { to: '/memory', label: 'Memory', shortLabel: 'Memo', icon: 'memo' },
  { to: '/coach', label: 'Coach', shortLabel: 'Coach', icon: 'coach' }
]
const route = useRoute()
const transitionName = ref('page-slide-forward')

function getNavIndex(path: string) {
  return navItems.findIndex((item) => item.to === path)
}

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
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Transition :name="transitionName" mode="out-in">
        <component :is="Component" :key="viewRoute.path" />
      </Transition>
    </RouterView>
  </AppShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
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
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: 'home' },
  { to: '/runs', label: 'Run Log', shortLabel: 'Log', icon: 'log' },
  { to: '/memory', label: 'Memory', shortLabel: 'Memo', icon: 'memo' }
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
  healthKitSyncStore.init()
  healthKitSyncStore.attachActivationListeners()
  weatherStore.init()
  weatherStore.attachActivationListeners()
  void resetNativeStartupRoute()
  void healthKitSyncStore.syncAfterActivation()
  void weatherStore.refreshAfterActivation()
})

onBeforeUnmount(() => {
  healthKitSyncStore.dispose()
  weatherStore.dispose()
})

async function resetNativeStartupRoute() {
  await router.isReady()
  if (!hasNativeBridge()) return
  if (route.path === '/auth' || route.path === '/access' || route.path === '/') return
  await router.replace('/')
}
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <ToastHost />
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Transition :name="transitionName" mode="out-in">
        <component :is="Component" :key="viewRoute.path" />
      </Transition>
    </RouterView>
  </AppShell>
</template>

<script setup lang="ts">
import AppHeader from '@/shared/ui/AppHeader.vue'
import BottomNav, { type BottomNavItem } from '@/shared/ui/BottomNav.vue'

defineProps<{
  navItems: BottomNavItem[]
  isAuthenticated: boolean
}>()

const emit = defineEmits<{ signOut: [] }>()
</script>

<template>
  <div class="app-shell">
    <AppHeader :is-authenticated="isAuthenticated" @sign-out="emit('signOut')" />
    <main class="app-main">
      <slot />
    </main>
    <BottomNav :items="navItems" />
  </div>
</template>

<script setup lang="ts">
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
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <RouterView />
  </AppShell>
</template>

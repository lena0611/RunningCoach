<script setup lang="ts">
import { useAuthStore } from '@/app/stores/authStore'
import AppShell from '@/shared/ui/AppShell.vue'

const authStore = useAuthStore()
const navItems = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home' },
  { to: '/upload', label: 'Upload', shortLabel: 'Upload' },
  { to: '/runs', label: 'Run Log', shortLabel: 'Log' },
  { to: '/memory', label: 'Memory', shortLabel: 'Memo' },
  { to: '/coach', label: 'Coach', shortLabel: 'Coach' }
]
</script>

<template>
  <AppShell :nav-items="navItems" :is-authenticated="authStore.isAuthenticated" @sign-out="authStore.signOut()">
    <RouterView />
  </AppShell>
</template>

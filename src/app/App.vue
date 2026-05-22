<script setup lang="ts">
import { useAuthStore } from '@/app/stores/authStore'

const authStore = useAuthStore()
const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/upload', label: 'Upload' },
  { to: '/runs', label: 'Run Log' },
  { to: '/memory', label: 'Memory' },
  { to: '/coach', label: 'Coach' }
]
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">RunContext</p>
        <h1>러닝 기록 코치</h1>
      </div>
      <nav>
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to">
          {{ item.label }}
        </RouterLink>
        <button v-if="authStore.isAuthenticated" class="nav-button" type="button" @click="authStore.signOut()">Logout</button>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

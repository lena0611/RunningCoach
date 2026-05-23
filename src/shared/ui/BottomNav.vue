<script setup lang="ts">
export type BottomNavItem = {
  to: string
  label: string
  shortLabel?: string
}

defineProps<{ items: BottomNavItem[] }>()
</script>

<template>
  <nav class="bottom-nav" aria-label="주요 화면">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to">
      <span>{{ item.shortLabel || item.label }}</span>
    </RouterLink>
  </nav>
</template>

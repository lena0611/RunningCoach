<script setup lang="ts">
export type BottomNavItem = {
  to: string
  label: string
  shortLabel?: string
  icon: 'home' | 'upload' | 'log' | 'memo' | 'coach'
}

defineProps<{ items: BottomNavItem[] }>()
</script>

<template>
  <nav class="bottom-nav" aria-label="주요 화면">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to">
      <svg class="bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <template v-if="item.icon === 'home'">
          <path d="M3.5 11.2 12 4l8.5 7.2" />
          <path d="M5.5 10.4V20h13v-9.6" />
          <path d="M9.5 20v-6h5v6" />
        </template>
        <template v-else-if="item.icon === 'upload'">
          <path d="M12 4v11" />
          <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
          <path d="M5 15v4.5h14V15" />
        </template>
        <template v-else-if="item.icon === 'log'">
          <path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v12.5h-13A2 2 0 0 1 4.5 17.5V7A2.5 2.5 0 0 1 7 4.5Z" />
          <path d="M8.5 9h7" />
          <path d="M8.5 13h7" />
          <path d="M8.5 17h4" />
        </template>
        <template v-else-if="item.icon === 'memo'">
          <path d="M6.5 4.5h8l3 3v12h-11z" />
          <path d="M14.5 4.5v3h3" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </template>
        <template v-else>
          <path d="M5.5 8.5A4 4 0 0 1 9.5 4.5h5A4 4 0 0 1 18.5 8.5v4A4 4 0 0 1 14.5 16h-2.8L8 19.5V16H9.5A4 4 0 0 1 5.5 12.5z" />
          <path d="M9 10.5h.01" />
          <path d="M12 10.5h.01" />
          <path d="M15 10.5h.01" />
        </template>
      </svg>
      <span>{{ item.shortLabel || item.label }}</span>
    </RouterLink>
  </nav>
</template>

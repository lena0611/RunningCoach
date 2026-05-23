<script setup lang="ts">
defineProps<{
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'accent' | 'warning'
}>()
</script>

<template>
  <article class="stat-card" :class="tone ? `stat-card-${tone}` : ''">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small v-if="hint">{{ hint }}</small>
  </article>
</template>

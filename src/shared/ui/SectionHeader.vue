<script setup lang="ts">
defineProps<{
  title: string
  compact?: boolean
}>()
</script>

<template>
  <div class="section-heading" :class="{ 'compact-heading': compact }">
    <h2>{{ title }}</h2>
    <slot />
  </div>
</template>

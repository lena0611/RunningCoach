<script setup lang="ts">
defineProps<{
  gap?: 'default' | 'compact' | 'loose'
}>()
</script>

<template>
  <div class="content-stack" :class="gap ? `content-stack-${gap}` : undefined">
    <slot />
  </div>
</template>

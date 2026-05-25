<script setup lang="ts">
defineProps<{
  as?: 'form' | 'div'
}>()
</script>

<template>
  <component :is="as ?? 'div'" class="form-grid">
    <slot />
  </component>
</template>

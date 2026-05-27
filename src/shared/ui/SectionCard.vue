<script setup lang="ts">
defineProps<{
  variant?: 'default' | 'subtle' | 'flat'
}>()
</script>

<template>
  <section class="section-card" :class="variant ? `section-card-${variant}` : undefined">
    <slot />
  </section>
</template>

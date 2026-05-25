<script setup lang="ts">
defineProps<{
  variant?: 'default' | 'narrow' | 'upload' | 'coach' | 'memory' | 'run-log' | 'dashboard'
}>()
</script>

<template>
  <section class="page" :class="variant ? `${variant}-page` : undefined">
    <slot />
  </section>
</template>

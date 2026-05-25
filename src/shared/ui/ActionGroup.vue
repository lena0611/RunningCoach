<script setup lang="ts">
defineProps<{
  full?: boolean
}>()
</script>

<template>
  <div class="actions" :class="{ full }">
    <slot />
  </div>
</template>

<script setup lang="ts">
import type { RunType } from '@/entities/run/model'

defineProps<{ type: RunType | string }>()
</script>

<template>
  <span class="run-type-badge" :class="`run-type-${String(type).toLowerCase().replaceAll(' ', '-').replaceAll('+', 'plus')}`">
    {{ type }}
  </span>
</template>

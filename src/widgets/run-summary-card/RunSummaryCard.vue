<script setup lang="ts">
import StatCard from '@/shared/ui/StatCard.vue'

defineProps<{ label: string; value: string; hint?: string }>()
</script>

<template>
  <StatCard :label="label" :value="value" :hint="hint" />
</template>

<script setup lang="ts">
import StatCard from '@/shared/ui/StatCard.vue'

defineProps<{ label: string; value: string; hint?: string; interactive?: boolean; loading?: boolean }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <StatCard :label="label" :value="value" :hint="hint" :interactive="interactive" :loading="loading" @click="$emit('click')" />
</template>

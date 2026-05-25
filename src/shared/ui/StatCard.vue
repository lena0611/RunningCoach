<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'accent' | 'warning'
}>()

const parsedValue = computed(() => {
  const match = props.value.match(/^([0-9.,]+)(.*)$/)
  if (!match) return { amount: props.value, unit: '' }
  return {
    amount: match[1],
    unit: match[2].trim()
  }
})
</script>

<template>
  <article class="stat-card" :class="tone ? `stat-card-${tone}` : ''">
    <span>{{ label }}</span>
    <strong class="stat-card-value">
      <span>{{ parsedValue.amount }}</span>
      <small v-if="parsedValue.unit" class="stat-card-unit">{{ parsedValue.unit }}</small>
    </strong>
    <small v-if="hint">{{ hint }}</small>
  </article>
</template>

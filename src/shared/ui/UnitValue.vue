<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value?: string | number
  amount?: string | number
  unit?: string
}>()

const parsed = computed(() => {
  if (props.amount !== undefined) {
    return {
      amount: String(props.amount),
      unit: props.unit ?? ''
    }
  }
  const text = props.value === undefined ? '' : String(props.value)
  const match = text.match(/^([0-9.,]+)(.*)$/)
  if (!match) return { amount: text, unit: props.unit ?? '' }
  return {
    amount: match[1],
    unit: props.unit ?? match[2].trim()
  }
})
</script>

<template>
  <span class="unit-value">
    <span class="unit-value-number">{{ parsed.amount }}</span>
    <small v-if="parsed.unit" class="unit-value-unit">{{ parsed.unit }}</small>
  </span>
</template>

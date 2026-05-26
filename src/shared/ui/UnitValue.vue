<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  value?: string | number
  amount?: string | number
  unit?: string
}>()

function formatAmount(amount: string | number, unit: string) {
  if (unit.trim().toLowerCase() !== 'km') return String(amount)

  const normalized = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'))
  if (!Number.isFinite(normalized)) return String(amount)

  return normalized.toFixed(2)
}

const parsed = computed(() => {
  if (props.amount !== undefined) {
    const unit = props.unit ?? ''
    return {
      amount: formatAmount(props.amount, unit),
      unit
    }
  }
  const text = props.value === undefined ? '' : String(props.value)
  const match = text.match(/^([0-9.,]+)(.*)$/)
  if (!match) return { amount: text, unit: props.unit ?? '' }
  const unit = props.unit ?? match[2].trim()
  return {
    amount: formatAmount(match[1], unit),
    unit
  }
})
</script>

<template>
  <span class="unit-value">
    <span class="unit-value-number">{{ parsed.amount }}</span>
    <small v-if="parsed.unit" class="unit-value-unit">{{ parsed.unit }}</small>
  </span>
</template>

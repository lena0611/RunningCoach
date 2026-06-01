<script setup lang="ts">
import { computed } from 'vue'
import { formatNumberWithCommas } from '@/shared/lib/format'

const props = defineProps<{
  value?: string | number
  amount?: string | number
  unit?: string
}>()

function formatAmount(amount: string | number, unit: string) {
  const normalized = typeof amount === 'number' ? amount : parseDisplayNumber(String(amount))
  if (!Number.isFinite(normalized)) return String(amount)

  const normalizedUnit = unit.trim().toLowerCase()
  if (normalizedUnit === 'km') {
    return formatNumberWithCommas(normalized, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const fractionDigits = typeof amount === 'number' ? countNumberFractionDigits(amount) : countTextFractionDigits(String(amount))
  return formatNumberWithCommas(normalized, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })
}

function parseDisplayNumber(value: string) {
  const trimmed = value.trim()
  const normalized = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)
    ? trimmed.replace(/,/g, '')
    : trimmed.replace(',', '.')
  return Number(normalized)
}

function countNumberFractionDigits(value: number) {
  if (Number.isInteger(value)) return 0
  const [, fraction = ''] = String(value).split('.')
  return fraction.length
}

function countTextFractionDigits(value: string) {
  const normalized = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(value.trim())
    ? value.trim().replace(/,/g, '')
    : value.trim().replace(',', '.')
  const [, fraction = ''] = normalized.split('.')
  return fraction.length
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

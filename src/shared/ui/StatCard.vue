<script setup lang="ts">
import { computed } from 'vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const props = defineProps<{
  label: string
  value: string
  hint?: string
  unit?: string
  tone?: 'primary' | 'accent' | 'warning'
  /** 지표 액센트 dot(리디자인 NumbersGrid) — 색은 tone 을 따른다(기본 primary). */
  dot?: boolean
  interactive?: boolean
  loading?: boolean
  valueKind?: 'metric' | 'text'
}>()

const emit = defineEmits<{ click: [] }>()

const parsedValue = computed(() => {
  if (props.valueKind === 'text') return { amount: props.value, unit: '' }
  if (props.unit !== undefined) return { amount: props.value, unit: props.unit }
  const match = props.value.match(/^([+-]?[0-9.,]+)(.*)$/)
  if (!match) return { amount: props.value, unit: '' }
  return {
    amount: match[1],
    unit: match[2].trim()
  }
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'article'"
    class="stat-card"
    :class="[tone ? `stat-card-${tone}` : '', { 'stat-card-interactive': interactive }]"
    :type="interactive ? 'button' : undefined"
    @click="interactive && emit('click')"
  >
    <span class="stat-card-label"><i v-if="dot" class="stat-card-dot" aria-hidden="true" />{{ label }}</span>
    <div v-if="loading" class="stat-card-data stat-card-skeleton" aria-hidden="true">
      <span class="skeleton-line skeleton-line-value" />
      <span v-if="hint" class="skeleton-line skeleton-line-hint" />
    </div>
    <div v-else class="stat-card-data">
      <strong class="stat-card-value" :class="{ 'stat-card-text-value': valueKind === 'text' }">
        <UnitValue :amount="parsedValue.amount" :unit="parsedValue.unit" />
      </strong>
      <small v-if="hint">{{ hint }}</small>
    </div>
    <svg v-if="interactive" class="card-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  </component>
</template>

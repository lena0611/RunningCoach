<script setup lang="ts">
import { computed } from 'vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const props = defineProps<{
  label: string
  value: string
  hint?: string
  tone?: 'primary' | 'accent' | 'warning'
  interactive?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{ click: [] }>()

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
  <component
    :is="interactive ? 'button' : 'article'"
    class="stat-card"
    :class="[tone ? `stat-card-${tone}` : '', { 'stat-card-interactive': interactive }]"
    :type="interactive ? 'button' : undefined"
    @click="interactive && emit('click')"
  >
    <span class="stat-card-label">{{ label }}</span>
    <div v-if="loading" class="stat-card-data stat-card-skeleton" aria-hidden="true">
      <span class="skeleton-line skeleton-line-value" />
      <span v-if="hint" class="skeleton-line skeleton-line-hint" />
    </div>
    <div v-else class="stat-card-data">
      <strong class="stat-card-value">
        <UnitValue :amount="parsedValue.amount" :unit="parsedValue.unit" />
      </strong>
      <small v-if="hint">{{ hint }}</small>
    </div>
    <svg v-if="interactive" class="card-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  </component>
</template>

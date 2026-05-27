<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number | null | undefined
    label: string
    min?: number
    max?: number
    step?: number
    minLabel?: string
    maxLabel?: string
    nullLabel?: string
  }>(),
  {
    min: 1,
    max: 10,
    step: 1,
    minLabel: '',
    maxLabel: '',
    nullLabel: '미입력'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

function update(value: string) {
  const parsed = Number(value)
  emit('update:modelValue', Number.isFinite(parsed) ? parsed : null)
}
</script>

<template>
  <div class="scale-slider">
    <div class="scale-slider-head">
      <span>{{ label }}</span>
      <strong>{{ modelValue ?? nullLabel }}</strong>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue ?? min"
      :aria-label="label"
      @input="update(($event.target as HTMLInputElement).value)"
    />
    <div class="scale-slider-meta">
      <small>{{ minLabel || min }}</small>
      <button v-if="modelValue !== null && modelValue !== undefined" type="button" @click="emit('update:modelValue', null)">초기화</button>
      <small>{{ maxLabel || max }}</small>
    </div>
  </div>
</template>

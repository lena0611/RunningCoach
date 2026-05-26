<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    as?: 'input' | 'textarea'
    type?: string
    placeholder?: string
    autocomplete?: string
    inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
    rows?: number | string
    min?: number | string
    max?: number | string
    step?: number | string
    required?: boolean
    number?: boolean
  }>(),
  {
    as: 'input',
    type: 'text',
    placeholder: '',
    autocomplete: undefined,
    inputmode: undefined,
    rows: 3,
    min: undefined,
    max: undefined,
    step: undefined,
    required: false,
    number: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
  input: [event: Event]
}>()

const textValue = computed(() => (props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)))
const hasValue = computed(() => textValue.value.length > 0)

function normalize(value: string) {
  if (!props.number) return value
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  emit('update:modelValue', normalize(target.value))
  emit('input', event)
}

function clear() {
  emit('update:modelValue', props.number ? null : '')
}
</script>

<template>
  <span class="clearable-field">
    <textarea
      v-if="as === 'textarea'"
      :value="textValue"
      :rows="rows"
      :placeholder="placeholder"
      :required="required"
      @input="onInput"
    />
    <input
      v-else
      :value="textValue"
      :type="type"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      :required="required"
      @input="onInput"
    />
    <button v-if="hasValue" class="input-clear-button" type="button" aria-label="입력 지우기" @click="clear">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
    </button>
  </span>
</template>

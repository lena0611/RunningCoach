<script setup lang="ts">
import { formatDateWithWeekday } from '@/shared/lib/format'

defineProps<{
  label: string
  placeholder?: string
}>()

const model = defineModel<string | null>({ required: true })

function update(value: string) {
  model.value = value || null
}
</script>

<template>
  <label>
    {{ label }}
    <span class="date-field-control">
      <span class="date-field-display">
        {{ model ? formatDateWithWeekday(model) : placeholder || '날짜 선택' }}
      </span>
      <input
        class="date-field-native"
        type="date"
        :value="model || ''"
        :aria-label="label"
        @input="update(($event.target as HTMLInputElement).value)"
      />
    </span>
  </label>
</template>

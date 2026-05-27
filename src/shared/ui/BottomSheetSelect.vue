<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

export type BottomSheetSelectOption = {
  value: string
  label: string
  description?: string
}

const props = defineProps<{
  modelValue: string
  label: string
  options: BottomSheetSelectOption[]
  placeholder?: string
  compact?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const drag = useBottomSheetDrag(closeSheet)

const selectedOption = computed(() => props.options.find((option) => option.value === props.modelValue))
const displayText = computed(() => selectedOption.value?.label || props.placeholder || '선택')

watch(open, (isOpen) => {
  document.body.classList.toggle('sheet-open', isOpen)
})

onBeforeUnmount(() => {
  document.body.classList.remove('sheet-open')
})

function choose(value: string) {
  emit('update:modelValue', value)
  closeSheet()
}

function openSheet() {
  open.value = true
}

function closeSheet() {
  open.value = false
}
</script>

<template>
  <div class="bottom-sheet-select" :class="{ 'bottom-sheet-select-compact': compact }">
    <span class="bottom-sheet-label">{{ label }}</span>
    <button class="bottom-sheet-trigger" type="button" @pointerdown.stop @click.stop="openSheet">
      <span>{{ displayText }}</span>
      <svg class="select-chevron" aria-hidden="true" viewBox="0 0 24 24">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="bottom-sheet-layer" role="presentation" @pointerdown.stop @click.self="open = false">
        <section class="bottom-sheet" :class="{ 'bottom-sheet-dragging': drag.dragging.value }" :style="drag.sheetStyle.value" role="dialog" aria-modal="true" :aria-label="label" @click.stop>
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
          <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
            <h2>{{ label }}</h2>
            <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="closeSheet">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </div>
          <div class="bottom-sheet-options">
            <button
              v-for="option in options"
              :key="option.value"
              class="bottom-sheet-option"
              :class="{ selected: option.value === modelValue }"
              type="button"
              @click="choose(option.value)"
            >
              <span>
                <strong>{{ option.label }}</strong>
                <small v-if="option.description">{{ option.description }}</small>
              </span>
              <span v-if="option.value === modelValue" class="option-check" aria-hidden="true">✓</span>
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

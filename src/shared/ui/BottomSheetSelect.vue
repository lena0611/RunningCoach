<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

export type BottomSheetSelectOption = {
  value: string
  label: string
  description?: string
}

const props = defineProps<{
  modelValue: string | string[]
  label: string
  options: BottomSheetSelectOption[]
  placeholder?: string
  compact?: boolean
  multiple?: boolean
  allLabel?: string
  confirmLabel?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
const open = ref(false)
const draftValues = ref<string[]>([])
const drag = useBottomSheetDrag(closeSheet)

const selectedValues = computed(() => {
  if (Array.isArray(props.modelValue)) return props.modelValue
  return props.modelValue ? [props.modelValue] : []
})
const activeValues = computed(() => props.multiple && open.value ? draftValues.value : selectedValues.value)
const singleValue = computed(() => Array.isArray(props.modelValue) ? '' : props.modelValue)
const selectedOption = computed(() => props.options.find((option) => option.value === singleValue.value))
const allSelected = computed(() => props.options.length > 0 && selectedValues.value.length === props.options.length)
const displayText = computed(() => {
  if (!props.multiple) return selectedOption.value?.label || props.placeholder || '선택'
  if (!selectedValues.value.length) return props.placeholder || '선택 안 함'
  if (allSelected.value) return props.allLabel || props.placeholder || '전체'
  if (selectedValues.value.length === 1) {
    return props.options.find((option) => option.value === selectedValues.value[0])?.label || props.placeholder || '선택'
  }
  return `${selectedValues.value.length}개 선택`
})

watch(open, (isOpen) => {
  document.body.classList.toggle('sheet-open', isOpen)
})

onBeforeUnmount(() => {
  document.body.classList.remove('sheet-open')
})

function choose(value: string) {
  if (props.multiple) {
    toggleDraftValue(value)
    return
  }
  emit('update:modelValue', value)
  closeSheet()
}

function openSheet() {
  draftValues.value = selectedValues.value.filter((value) => props.options.some((option) => option.value === value))
  open.value = true
}

function closeSheet() {
  open.value = false
}

function isActive(value: string) {
  return activeValues.value.includes(value)
}

function toggleDraftValue(value: string) {
  draftValues.value = draftValues.value.includes(value)
    ? draftValues.value.filter((item) => item !== value)
    : [...draftValues.value, value]
}

function selectAll() {
  draftValues.value = props.options.map((option) => option.value)
}

function clearAll() {
  draftValues.value = []
}

function confirmMultiple() {
  emit('update:modelValue', draftValues.value)
  closeSheet()
}
</script>

<template>
  <div class="bottom-sheet-select" :class="{ 'bottom-sheet-select-compact': compact }">
    <span class="bottom-sheet-label-row">
      <span class="bottom-sheet-label">{{ label }}</span>
      <slot name="label-suffix" />
    </span>
    <button class="bottom-sheet-trigger" type="button" @click.stop="openSheet">
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
          <div v-if="multiple" class="bottom-sheet-select-tools">
            <button type="button" @click="selectAll">전체선택</button>
            <button type="button" @click="clearAll">전체해제</button>
          </div>
          <div class="bottom-sheet-options" :class="{ 'bottom-sheet-options-multiple': multiple }">
            <button
              v-for="option in options"
              :key="option.value"
              class="bottom-sheet-option"
              :class="{ selected: isActive(option.value) }"
              type="button"
              @click="choose(option.value)"
            >
              <span>
                <strong>{{ option.label }}</strong>
                <small v-if="option.description">{{ option.description }}</small>
              </span>
              <span v-if="isActive(option.value)" class="option-check" aria-hidden="true">✓</span>
            </button>
          </div>
          <button v-if="multiple" class="bottom-sheet-confirm primary" type="button" @click="confirmMultiple">
            {{ confirmLabel || '확인' }}
          </button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

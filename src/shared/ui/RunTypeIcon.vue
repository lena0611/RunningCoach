<script setup lang="ts">
import { computed } from 'vue'
import type { RunType } from '@/entities/run/model'

const props = withDefaults(defineProps<{
  type: RunType | string
  size?: 'default' | 'large'
}>(), {
  size: 'default'
})

const slug = computed(() => String(props.type).toLowerCase().replaceAll(' ', '-').replaceAll('+', 'plus'))

const glyph = computed(() => {
  switch (props.type) {
    case 'Recovery':
      return 'heart'
    case 'Easy + Strides':
      return 'strides'
    case 'Tempo':
      return 'tempo'
    case 'LSD':
      return 'map'
    case 'Steady Long':
      return 'infinity'
    case 'Race':
      return 'trophy'
    case 'Easy':
      return 'leaf'
    default:
      return 'unknown'
  }
})
</script>

<template>
  <span class="run-type-icon" :class="[`run-type-${slug}`, `run-type-icon-${size}`]" :aria-label="`${type} 아이콘`">
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <template v-if="glyph === 'unknown'">
        <path d="M11 10a5 5 0 0 1 10 0c0 5-5 4-5 8" />
        <path d="M16 24h.01" />
      </template>
      <template v-else-if="glyph === 'leaf'">
        <path class="run-icon-fill" d="M24.5 8.2c-7.9-.6-13.9 2.9-15.1 8.3-.7 3.3 1.2 6.3 4.5 6.8 5.6.8 9.5-4.8 10.6-15.1Z" />
        <path class="run-icon-cut" d="M9.5 22.3c3.2-4.6 6.6-6.8 11-8.2" />
      </template>
      <template v-else-if="glyph === 'heart'">
        <path class="run-icon-fill" d="M16 25.2 7.8 17.8c-3.1-2.8-2.8-7.4.7-9.3 2.1-1.1 4.7-.6 6.2 1.2L16 11.2l1.3-1.5c1.5-1.8 4.1-2.3 6.2-1.2 3.5 1.9 3.8 6.5.7 9.3L16 25.2Z" />
      </template>
      <template v-else-if="glyph === 'strides'">
        <path class="run-icon-fill" d="M8.5 8.2 20 16 8.5 23.8V8.2Z" />
        <path class="run-icon-stride-line" d="M21.5 10h3.5M23 16h3.5M21.5 22h3.5" />
      </template>
      <template v-else-if="glyph === 'tempo'">
        <path class="run-icon-fill" d="M7 8.5 15.5 16 7 23.5v-15Z" />
        <path class="run-icon-fill" d="M17 8.5 25.5 16 17 23.5v-15Z" />
      </template>
      <template v-else-if="glyph === 'map'">
        <path class="run-icon-map" d="m6.5 8.5 6-2.5 7 2.8 6-2.3v17l-6 2.4-7-2.8-6 2.4v-17Z" />
        <path class="run-icon-map-line" d="M12.5 6v17.1M19.5 8.8v17.1" />
      </template>
      <template v-else-if="glyph === 'infinity'">
        <path class="run-icon-thick" d="M8 16c2.7-4.7 5.7-4.7 8 0s5.3 4.7 8 0" />
        <path class="run-icon-thick" d="M8 16c2.7 4.7 5.7 4.7 8 0s5.3-4.7 8 0" />
      </template>
      <template v-else-if="glyph === 'trophy'">
        <path class="run-icon-fill" d="M11 7h10v3.6c0 3.4-2 6.1-5 6.1s-5-2.7-5-6.1V7Z" />
        <path class="run-icon-trophy" d="M11 9H7.5v1.5c0 2.3 1.7 3.8 4 3.8M21 9h3.5v1.5c0 2.3-1.7 3.8-4 3.8M16 16.7V22M12 25h8M13.5 22h5" />
      </template>
    </svg>
  </span>
</template>

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
      return 'recovery'
    case 'Easy + Strides':
      return 'strides'
    case 'Tempo':
      return 'tempo'
    case 'LSD':
    case 'Steady Long':
      return 'long'
    case 'Race':
      return 'race'
    case 'Easy':
      return 'easy'
    default:
      return 'unknown'
  }
})
</script>

<template>
  <span class="run-type-icon" :class="[`run-type-${slug}`, `run-type-icon-${size}`]" :aria-label="`${type} 아이콘`">
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <template v-if="glyph === 'tempo'">
        <path class="run-icon-mark" d="m18 3-7 12h6l-3 14 8-16h-6z" />
        <path d="M9 25c4-2 8-2 13-1" />
      </template>
      <template v-else-if="glyph === 'strides'">
        <path class="run-icon-speed" d="M3 12h7" />
        <path class="run-icon-speed" d="M5 18h6" />
        <path class="run-icon-speed" d="M7 24h5" />
        <path d="M18.5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="m16 10 5 4 4-2" />
        <path d="m20 14-4 5-5 1" />
        <path d="m17 19 3 4 5 3" />
      </template>
      <template v-else-if="glyph === 'long'">
        <path class="run-icon-route" d="M4 24c5-7 8 3 13-4s7-1 11-6" />
        <path d="M14.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="m13 11 5 4 4-2" />
        <path d="m17 15-4 5-4 1" />
        <path d="m14 20 4 3 5 3" />
      </template>
      <template v-else-if="glyph === 'race'">
        <path class="run-icon-flag" d="M22 4v12" />
        <path class="run-icon-flag" d="M22 5h6l-2 3 2 3h-6" />
        <path d="M12.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="m11 12 5 4 4-2" />
        <path d="m15 16-4 5-5 1" />
        <path d="m12 21 4 3 5 3" />
      </template>
      <template v-else-if="glyph === 'recovery'">
        <path class="run-icon-leaf" d="M22 8c5 1 6 6 2 10-4-1-7-4-6-9 1-1 2-1 4-1Z" />
        <path class="run-icon-leaf" d="M18 18c2-3 4-5 8-7" />
        <path d="M11.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="m10 13 4 3 3-2" />
        <path d="m14 16-3 4-4 2" />
        <path d="m11 20 3 3 4 2" />
      </template>
      <template v-else-if="glyph === 'unknown'">
        <path d="M11 10a5 5 0 0 1 10 0c0 5-5 4-5 8" />
        <path d="M16 24h.01" />
      </template>
      <template v-else>
        <path d="M15.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="m14 11 5 4 4-2" />
        <path d="m18 15-4 5-5 1" />
        <path d="m15 20 4 4 5 2" />
      </template>
    </svg>
  </span>
</template>

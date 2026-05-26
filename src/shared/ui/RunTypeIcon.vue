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
      return 'dot'
    case 'Easy + Strides':
      return 'speed'
    case 'Tempo':
      return 'bolt'
    case 'LSD':
    case 'Steady Long':
      return 'route'
    case 'Race':
      return 'flag'
    case 'Easy':
      return 'base'
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
      <template v-else>
        <path class="run-icon-runner" d="M15.5 8.4a2.45 2.45 0 1 0 0-4.9 2.45 2.45 0 0 0 0 4.9Z" />
        <path class="run-icon-runner" d="m13.8 11 5.4 4.1 4.1-2.1" />
        <path class="run-icon-runner" d="m18.7 15.1-4.5 5.2-5.1 1.2" />
        <path class="run-icon-runner" d="m14.7 20.3 4.1 4.2 5.1 2" />
        <path v-if="glyph === 'speed'" class="run-icon-accent" d="M4.5 12h5.2M5.8 17h4.8M7.4 22h3.6" />
        <path v-else-if="glyph === 'bolt'" class="run-icon-accent run-icon-fill" d="m25 4-4.6 7.6h4.1l-3.7 8.4 7-10.5h-4.2z" />
        <path v-else-if="glyph === 'route'" class="run-icon-accent" d="M4 26c4.3-4.5 8.1.8 12-3.5 3.7-4.1 7.2-1 11-5.5" />
        <path v-else-if="glyph === 'flag'" class="run-icon-accent" d="M24 5v12M24 6h5l-1.7 2.4L29 11h-5" />
        <circle v-else-if="glyph === 'dot'" class="run-icon-accent run-icon-fill" cx="25" cy="8" r="2.2" />
      </template>
    </svg>
  </span>
</template>

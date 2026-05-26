<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import { getRunMetaChips } from '@/shared/lib/runMetaChips'

const props = defineProps<{
  run: RunLog
  weeklyPattern?: string[]
}>()
</script>

<template>
  <span class="run-meta-chips" aria-label="세션 메타 정보">
    <span
      v-for="chip in getRunMetaChips(props.run, props.weeklyPattern ?? [])"
      :key="`${chip.tone}-${chip.label}`"
      class="run-meta-chip"
      :class="`run-meta-chip-${chip.tone}`"
    >
      {{ chip.label }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { getRunMetaChips } from '@/shared/lib/runMetaChips'

const props = defineProps<{
  run: RunLog
  /** 예정 세션에 귀속된 런 id — '스케줄/추가' 판정의 정본. */
  scheduledRunIds?: ReadonlySet<string>
  limit?: number
}>()

const chips = computed(() => {
  const items = getRunMetaChips(props.run, props.scheduledRunIds)
  return props.limit ? items.slice(0, props.limit) : items
})
</script>

<template>
  <span class="run-meta-chips" aria-label="세션 메타 정보">
    <span
      v-for="chip in chips"
      :key="`${chip.tone}-${chip.label}`"
      class="run-meta-chip"
      :class="`run-meta-chip-${chip.tone}`"
    >
      {{ chip.label }}
    </span>
  </span>
</template>

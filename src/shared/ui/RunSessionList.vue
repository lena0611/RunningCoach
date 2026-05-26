<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import { formatRunListDate } from '@/shared/lib/format'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import RunMetaChips from '@/shared/ui/RunMetaChips.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

defineProps<{
  runs: RunLog[]
  interactive?: boolean
  weeklyPattern?: string[]
}>()

const emit = defineEmits<{ select: [run: RunLog] }>()
</script>

<template>
  <div class="run-session-list">
    <component
      :is="interactive ? 'button' : 'article'"
      v-for="run in runs"
      :key="run.id"
      class="run-session-row"
      :type="interactive ? 'button' : undefined"
      @click="interactive && emit('select', run)"
    >
      <RunTypeIcon :type="run.type" />
      <div class="run-session-main">
        <div class="run-session-chip-row">
          <RunTypeBadge :type="run.type" />
          <RunMetaChips :run="run" :weekly-pattern="weeklyPattern" />
        </div>
        <strong class="run-session-distance"><UnitValue :amount="run.distanceKm" unit="km" /></strong>
      </div>
      <div class="run-session-meta">
        <span>{{ formatRunListDate(run.date) }}</span>
        <svg v-if="interactive" class="run-session-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>
    </component>
  </div>
</template>

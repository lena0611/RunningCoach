<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import EmptyState from '@/shared/ui/EmptyState.vue'
import ListRow from '@/shared/ui/ListRow.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

defineProps<{ runs: RunLog[] }>()
defineEmits<{ showAll: [] }>()
</script>

<template>
  <SectionCard>
    <div class="section-heading">
      <h2>최근 세션</h2>
      <button class="icon-link-button" type="button" aria-label="전체 Run Log 보기" @click="$emit('showAll')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </div>
    <div v-if="runs.length" class="run-list">
      <ListRow
        v-for="run in runs"
        :key="run.id"
        :kicker="formatDateWithWeekday(run.date)"
        :title="run.sessionTitle || run.type"
        :detail="`HR ${formatInteger(run.avgHeartRate)} · Cad ${formatInteger(run.cadence)}`"
        :metric="`${run.distanceKm}km`"
      >
        <template #addon>
          <RunTypeBadge :type="run.type" />
        </template>
        <div class="run-metrics-line">
          <span>{{ formatDuration(run.durationSec) }}</span>
          <span>{{ formatPace(run.avgPaceSec) }}/km</span>
        </div>
      </ListRow>
    </div>
    <EmptyState v-else title="아직 저장된 러닝 기록이 없습니다." description="HealthKit 또는 FIT 파일로 첫 기록을 추가하세요." />
  </SectionCard>
</template>

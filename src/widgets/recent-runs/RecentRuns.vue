<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import EmptyState from '@/shared/ui/EmptyState.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

defineProps<{ runs: RunLog[] }>()
</script>

<template>
  <SectionCard>
    <div class="section-heading">
      <h2>최근 세션</h2>
    </div>
    <div v-if="runs.length" class="run-list">
      <article v-for="run in runs" :key="run.id" class="run-row">
        <div>
          <div class="run-row-title">
            <strong>{{ formatDateWithWeekday(run.date) }}</strong>
            <RunTypeBadge :type="run.type" />
          </div>
          <span>{{ run.distanceKm }}km · {{ formatDuration(run.durationSec) }} · {{ formatPace(run.avgPaceSec) }}/km</span>
        </div>
        <small>HR {{ formatInteger(run.avgHeartRate) }} · Cad {{ formatInteger(run.cadence) }}</small>
      </article>
    </div>
    <EmptyState v-else title="아직 저장된 러닝 기록이 없습니다." description="HealthKit 또는 FIT 파일로 첫 기록을 추가하세요." />
  </SectionCard>
</template>

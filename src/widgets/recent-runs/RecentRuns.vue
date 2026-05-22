<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import { formatDuration, formatPace } from '@/shared/lib/format'

defineProps<{ runs: RunLog[] }>()
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>최근 세션</h2>
    </div>
    <div v-if="runs.length" class="run-list">
      <article v-for="run in runs" :key="run.id" class="run-row">
        <div>
          <strong>{{ run.date }} · {{ run.type }}</strong>
          <span>{{ run.distanceKm }}km · {{ formatDuration(run.durationSec) }} · {{ formatPace(run.avgPaceSec) }}/km</span>
        </div>
        <small>HR {{ run.avgHeartRate ?? '-' }} · Cad {{ run.cadence ?? '-' }}</small>
      </article>
    </div>
    <p v-else class="empty">아직 저장된 러닝 기록이 없습니다.</p>
  </section>
</template>

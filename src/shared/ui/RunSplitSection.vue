<script setup lang="ts">
import type { Lap } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

defineProps<{
  laps: Lap[]
}>()

function formatLapDuration(lap: Lap) {
  if (!lap.distanceKm || !lap.paceSec) return '-'
  return formatDuration(lap.distanceKm * lap.paceSec)
}

function formatLapHeartRate(lap: Lap) {
  const average = formatInteger(lap.avgHeartRate)
  const max = formatInteger(lap.maxHeartRate ?? null)
  if (average === '-' && max === '-') return '-'
  if (max === '-' || average === max) return average
  if (average === '-') return max
  return `${average}/${max}`
}
</script>

<template>
  <SectionCard>
    <SectionHeader title="스플릿">
      <small class="helper">{{ laps.length ? `${laps.length}개` : '데이터 부족' }}</small>
    </SectionHeader>
    <div v-if="laps.length" class="lap-content">
      <div class="lap-split-table">
        <div class="lap-split-head">
          <span></span>
          <span>시간<small>(분:초)</small></span>
          <span>페이스<small>(분/km)</small></span>
          <span>심박수<small>평균/최대</small></span>
          <span>케이던스<small>(SPM)</small></span>
        </div>
        <div v-for="lap in laps" :key="lap.index" class="lap-split-row">
          <strong>{{ lap.index }}</strong>
          <span class="lap-time">{{ formatLapDuration(lap) }}</span>
          <span class="lap-pace">{{ formatPace(lap.paceSec) }}</span>
          <span class="lap-hr">{{ formatLapHeartRate(lap) }}</span>
          <span class="lap-cad">{{ formatInteger(lap.cadence) }}</span>
        </div>
      </div>
    </div>
    <p v-else class="helper">랩별 페이스와 심박이 있으면 자동 세션 재해석과 코칭 근거가 좋아집니다.</p>
  </SectionCard>
</template>

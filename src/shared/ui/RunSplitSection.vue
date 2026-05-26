<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import type { Lap, RunMetricSample } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

defineProps<{
  laps: Lap[]
  metricSamples?: RunMetricSample[]
}>()

const LapSplitChart = defineAsyncComponent(() => import('@/shared/ui/LapSplitChart.vue'))
const view = ref<'list' | 'chart'>('list')

function formatLapDuration(lap: Lap) {
  if (!lap.distanceKm || !lap.paceSec) return '-'
  return formatDuration(lap.distanceKm * lap.paceSec)
}
</script>

<template>
  <SectionCard>
    <SectionHeader title="스플릿">
      <small class="helper">{{ laps.length ? `${laps.length}개` : '데이터 부족' }}</small>
    </SectionHeader>
    <div v-if="laps.length" class="lap-content">
      <div class="view-toggle" role="tablist" aria-label="스플릿 표시 방식">
        <button type="button" :class="{ active: view === 'list' }" role="tab" :aria-selected="view === 'list'" @click="view = 'list'">목록</button>
        <button type="button" :class="{ active: view === 'chart' }" role="tab" :aria-selected="view === 'chart'" @click="view = 'chart'">차트</button>
      </div>
      <div v-if="view === 'list'" class="lap-split-table">
        <div class="lap-split-head">
          <span></span>
          <span>시간</span>
          <span>페이스</span>
          <span>심박수</span>
          <span>케이던스</span>
        </div>
        <div v-for="lap in laps" :key="lap.index" class="lap-split-row">
          <strong>{{ lap.index }}</strong>
          <span class="lap-time">{{ formatLapDuration(lap) }}</span>
          <span class="lap-pace">{{ formatPace(lap.paceSec) }}/km</span>
          <span class="lap-hr">{{ formatInteger(lap.avgHeartRate) }}<small>BPM</small></span>
          <span class="lap-cad">{{ formatInteger(lap.cadence) }}<small>SPM</small></span>
        </div>
      </div>
      <LapSplitChart v-else :laps="laps" :metric-samples="metricSamples ?? []" />
    </div>
    <p v-else class="helper">랩별 페이스와 심박이 있으면 자동 세션 재해석과 코칭 근거가 좋아집니다.</p>
  </SectionCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Lap, RunMetricSample } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

const props = defineProps<{
  laps: Lap[]
  metricSamples?: RunMetricSample[]
}>()

type LapDisplayRow = {
  lap: Lap
  maxHeartRate: number | null
}

const lapRows = computed<LapDisplayRow[]>(() => {
  let startSec = 0
  return props.laps.map((lap) => {
    const durationSec = getLapDurationSec(lap)
    const endSec = startSec + durationSec
    const maxHeartRate = lap.maxHeartRate ?? getMaxHeartRateInRange(startSec, endSec)
    startSec = endSec
    return {
      lap,
      maxHeartRate
    }
  })
})

function formatLapDuration(lap: Lap) {
  const durationSec = getLapDurationSec(lap)
  if (!durationSec) return '-'
  return formatDuration(durationSec)
}

function formatLapHeartRate(row: LapDisplayRow) {
  const lap = row.lap
  const average = formatInteger(lap.avgHeartRate)
  const max = formatInteger(row.maxHeartRate)
  if (average === '-' && max === '-') return '-'
  if (max === '-' || average === max) return average
  if (average === '-') return max
  return `${average}/${max}`
}

function getLapDurationSec(lap: Lap) {
  if (!lap.distanceKm || !lap.paceSec) return 0
  return lap.distanceKm * lap.paceSec
}

function getMaxHeartRateInRange(startSec: number, endSec: number) {
  if (!props.metricSamples?.length || endSec <= startSec) return null
  const values = props.metricSamples
    .filter((sample) => sample.offsetSec > startSec && sample.offsetSec <= endSec)
    .map((sample) => sample.heartRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!values.length) return null
  return Math.max(...values)
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
        <div v-for="row in lapRows" :key="row.lap.index" class="lap-split-row">
          <strong>{{ row.lap.index }}</strong>
          <span class="lap-time">{{ formatLapDuration(row.lap) }}</span>
          <span class="lap-pace">{{ formatPace(row.lap.paceSec) }}</span>
          <span class="lap-hr">{{ formatLapHeartRate(row) }}</span>
          <span class="lap-cad">{{ formatInteger(row.lap.cadence) }}</span>
        </div>
      </div>
    </div>
    <p v-else class="helper">랩별 페이스와 심박이 있으면 자동 세션 재해석과 코칭 근거가 좋아집니다.</p>
  </SectionCard>
</template>

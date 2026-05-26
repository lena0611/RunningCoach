<script setup lang="ts">
import { computed } from 'vue'
import type { Lap } from '@/entities/run/model'
import LapMetricChart from '@/shared/ui/LapMetricChart.vue'

const props = defineProps<{
  laps: Lap[]
}>()

const chartLaps = computed(() => props.laps.filter((lap) => lap.paceSec || lap.avgHeartRate || lap.cadence))
const labels = computed(() => chartLaps.value.map((lap) => String(lap.index)))
</script>

<template>
  <div class="lap-chart-stack" aria-label="랩별 페이스 심박 케이던스 차트">
    <LapMetricChart
      title="페이스"
      type="pace"
      chart-type="line"
      domain-kind="pace"
      color="#22d3ee"
      inverse
      :labels="labels"
      :values="chartLaps.map((lap) => lap.paceSec)"
    />
    <LapMetricChart
      title="심박수"
      type="heartRate"
      chart-type="bar"
      domain-kind="heartRate"
      color="#ef4444"
      :labels="labels"
      :values="chartLaps.map((lap) => lap.avgHeartRate)"
    />
    <LapMetricChart
      title="케이던스"
      type="cadence"
      chart-type="line"
      domain-kind="cadence"
      color="#38bdf8"
      :labels="labels"
      :values="chartLaps.map((lap) => lap.cadence)"
    />
  </div>
</template>

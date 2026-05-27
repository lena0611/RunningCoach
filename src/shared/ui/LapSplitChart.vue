<script setup lang="ts">
import { computed } from 'vue'
import type { Lap, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { formatDuration } from '@/shared/lib/format'
import LapMetricChart from '@/shared/ui/LapMetricChart.vue'

const props = defineProps<{
  laps: Lap[]
  metricSamples: RunMetricSample[]
  routePoints: RunRoutePoint[]
  selectedOffsetSec?: number | null
}>()
const emit = defineEmits<{
  'select-offset': [offsetSec: number]
}>()

type SplitChartPoint = {
  label: string
  offsetSec: number
  paceSec: number | null
  heartRate: number | null
  cadence: number | null
}

const samplePoints = computed<SplitChartPoint[]>(() =>
  props.metricSamples
    .filter((sample) => sample.paceSec || sample.heartRate || sample.cadence)
    .map((sample) => ({
      label: formatDuration(sample.offsetSec),
      offsetSec: sample.offsetSec,
      paceSec: sample.paceSec,
      heartRate: sample.heartRate,
      cadence: sample.cadence
    }))
)

const lapPoints = computed<SplitChartPoint[]>(() => {
  let offsetSec = 0
  return props.laps
    .filter((lap) => lap.paceSec || lap.avgHeartRate || lap.cadence)
    .map((lap) => {
      const durationSec = lap.distanceKm && lap.paceSec ? lap.distanceKm * lap.paceSec : 0
      offsetSec += durationSec
      return {
        label: String(lap.index),
        offsetSec,
        paceSec: lap.paceSec,
        heartRate: lap.avgHeartRate,
        cadence: lap.cadence
      }
    })
})

const useSampleAxis = computed(() => samplePoints.value.length >= Math.max(6, lapPoints.value.length + 2))
const chartPoints = computed(() => useSampleAxis.value ? samplePoints.value : lapPoints.value)
const labels = computed(() => chartPoints.value.map((point) => point.label))
const axisName = computed(() => useSampleAxis.value ? '시간' : '랩')
const elevationValues = computed(() => chartPoints.value.map((point) => getElevationAtOffset(point.offsetSec)))
const selectedIndex = computed(() => {
  const points = chartPoints.value
  if (!points.length || props.selectedOffsetSec === null || props.selectedOffsetSec === undefined) return null
  return points.reduce((nearestIndex, point, index) => {
    return Math.abs(point.offsetSec - props.selectedOffsetSec!) < Math.abs(points[nearestIndex].offsetSec - props.selectedOffsetSec!)
      ? index
      : nearestIndex
  }, 0)
})

function selectIndex(index: number) {
  const point = chartPoints.value[index]
  if (!point) return
  emit('select-offset', point.offsetSec)
}

function getElevationAtOffset(offsetSec: number) {
  const points = props.routePoints.filter((point) => point.altitude !== null)
  if (!points.length) return null
  const nearest = points.reduce((current, point) => {
    return Math.abs(point.offsetSec - offsetSec) < Math.abs(current.offsetSec - offsetSec) ? point : current
  }, points[0])
  return nearest.altitude
}
</script>

<template>
  <div class="lap-chart-stack" aria-label="구간별 페이스 심박 케이던스 고도 차트">
    <p v-if="useSampleAxis" class="helper compact-helper">차트는 세부 샘플 {{ samplePoints.length }}개 기준입니다.</p>
    <p v-else class="helper compact-helper">세부 샘플이 부족해 랩 기준으로 표시합니다.</p>
    <LapMetricChart
      title="페이스"
      type="pace"
      chart-type="line"
      domain-kind="pace"
      color="#22d3ee"
      inverse
      :axis-name="axisName"
      :labels="labels"
      :values="chartPoints.map((point) => point.paceSec)"
      :selected-index="selectedIndex"
      @select-index="selectIndex"
    />
    <LapMetricChart
      title="심박수"
      type="heartRate"
      chart-type="bar"
      domain-kind="heartRate"
      color="#ef4444"
      :axis-name="axisName"
      :labels="labels"
      :values="chartPoints.map((point) => point.heartRate)"
      :selected-index="selectedIndex"
      @select-index="selectIndex"
    />
    <LapMetricChart
      title="케이던스"
      type="cadence"
      chart-type="line"
      domain-kind="cadence"
      color="#38bdf8"
      :axis-name="axisName"
      :labels="labels"
      :values="chartPoints.map((point) => point.cadence)"
      :selected-index="selectedIndex"
      @select-index="selectIndex"
    />
    <LapMetricChart
      v-if="elevationValues.some((value) => value !== null)"
      title="고도"
      type="elevation"
      chart-type="bar"
      domain-kind="elevation"
      color="#84cc16"
      :axis-name="axisName"
      :labels="labels"
      :values="elevationValues"
      :selected-index="selectedIndex"
      @select-index="selectIndex"
    />
  </div>
</template>

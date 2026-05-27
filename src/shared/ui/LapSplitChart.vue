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

const routePacePoints = computed<SplitChartPoint[]>(() => {
  const points = props.routePoints
    .filter((point) => Number.isFinite(point.offsetSec) && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .sort((a, b) => a.offsetSec - b.offsetSec)
  if (points.length < 3) return []

  const samples: SplitChartPoint[] = []
  let anchor = points[0]
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    const deltaSec = point.offsetSec - anchor.offsetSec
    if (deltaSec < 18) continue
    const distanceM = distanceMeters(anchor.latitude, anchor.longitude, point.latitude, point.longitude)
    const paceSec = distanceM > 8 ? deltaSec / (distanceM / 1000) : null
    if (isUsablePace(paceSec)) {
      samples.push({
        label: formatDuration(point.offsetSec),
        offsetSec: point.offsetSec,
        paceSec: Math.round(paceSec),
        heartRate: null,
        cadence: null
      })
    }
    anchor = point
  }

  return downsamplePoints(samples, 100)
})

const useSampleAxis = computed(() => samplePoints.value.length >= Math.max(6, lapPoints.value.length + 2))
const chartPoints = computed(() => useSampleAxis.value ? samplePoints.value : lapPoints.value)
const labels = computed(() => chartPoints.value.map((point) => point.label))
const paceChartPoints = computed(() => {
  if (routePacePoints.value.length >= 6) return routePacePoints.value
  const valid = chartPoints.value.filter((point) => isUsablePace(point.paceSec))
  if (valid.length >= 6) return valid
  const validLaps = lapPoints.value.filter((point) => isUsablePace(point.paceSec))
  return validLaps.length >= 2 ? validLaps : valid
})
const paceLabels = computed(() => paceChartPoints.value.map((point) => point.label))
const axisName = computed(() => useSampleAxis.value ? '시간' : '랩')
const elevationValues = computed(() => chartPoints.value.map((point) => getElevationAtOffset(point.offsetSec)))
const selectedIndex = computed(() => {
  const points = chartPoints.value
  if (!points.length || props.selectedOffsetSec === null || props.selectedOffsetSec === undefined) return null
  return getNearestIndex(points, props.selectedOffsetSec)
})
const selectedPaceIndex = computed(() => getNearestIndex(paceChartPoints.value, props.selectedOffsetSec))

function selectIndex(index: number) {
  const point = chartPoints.value[index]
  if (!point) return
  emit('select-offset', point.offsetSec)
}

function selectPaceIndex(index: number) {
  const point = paceChartPoints.value[index]
  if (!point) return
  emit('select-offset', point.offsetSec)
}

function getNearestIndex(points: SplitChartPoint[], offsetSec: number | null | undefined) {
  if (!points.length || offsetSec === null || offsetSec === undefined) return null
  return points.reduce((nearestIndex, point, index) => {
    return Math.abs(point.offsetSec - offsetSec) < Math.abs(points[nearestIndex].offsetSec - offsetSec)
      ? index
      : nearestIndex
  }, 0)
}

function isUsablePace(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 120 && value <= 1800
}

function downsamplePoints(points: SplitChartPoint[], maxCount: number) {
  if (points.length <= maxCount) return points
  const step = Math.ceil(points.length / maxCount)
  return points.filter((_, index) => index % step === 0)
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusM = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(value: number) {
  return (value * Math.PI) / 180
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
    <LapMetricChart
      title="페이스"
      type="pace"
      chart-type="line"
      domain-kind="pace"
      color="#22d3ee"
      inverse
      :axis-name="axisName"
      :labels="paceLabels"
      :values="paceChartPoints.map((point) => point.paceSec)"
      :selected-index="selectedPaceIndex"
      @select-index="selectPaceIndex"
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
    <p v-if="useSampleAxis" class="helper compact-helper">차트는 세부 샘플 {{ samplePoints.length }}개 기준입니다.</p>
    <p v-else class="helper compact-helper">세부 샘플이 부족해 랩 기준으로 표시합니다.</p>
  </div>
</template>

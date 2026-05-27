<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import type { RunLog, RunRoutePoint } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import SectionCard from '@/shared/ui/SectionCard.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const props = defineProps<{
  run: RunLog
  selectedOffsetSec?: number | null
}>()
const emit = defineEmits<{
  'select-offset': [offsetSec: number]
}>()

const LapSplitChart = defineAsyncComponent(() => import('@/shared/ui/LapSplitChart.vue'))
const scope = ref<'all' | '15m'>('all')
const selectedIndex = ref(0)

const scopedSamples = computed(() => {
  const samples = props.run.metricSamples ?? []
  const filtered = scope.value === '15m' ? samples.filter((sample) => sample.offsetSec <= 900) : samples
  return filtered.length ? filtered : samples
})

const scopedRoutePoints = computed(() => {
  const points = props.run.routePoints ?? []
  const filtered = scope.value === '15m' ? points.filter((point) => point.offsetSec <= 900) : points
  return filtered.length ? filtered : points
})

const safeSelectedIndex = computed(() => Math.min(Math.max(selectedIndex.value, 0), Math.max(scopedSamples.value.length - 1, 0)))
const selectedSample = computed(() => scopedSamples.value[safeSelectedIndex.value] ?? null)
const selectedExternalSample = computed(() => {
  const samples = scopedSamples.value
  if (!samples.length || props.selectedOffsetSec === null || props.selectedOffsetSec === undefined) return null
  return nearestSample(samples, props.selectedOffsetSec)
})
const activeSample = computed(() => selectedExternalSample.value ?? selectedSample.value)
const selectedRoutePoint = computed(() => {
  const points = scopedRoutePoints.value
  const sample = activeSample.value
  if (!points.length) return null
  if (!sample) return points[0]
  return nearestRoutePoint(points, sample.offsetSec)
})
const routeMap = computed(() => buildRouteMap(scopedRoutePoints.value))
const selectedRoutePosition = computed(() => selectedRoutePoint.value && routeMap.value ? pointToMapPosition(selectedRoutePoint.value, routeMap.value.zoom) : null)
const startPointPosition = computed(() => scopedRoutePoints.value[0] && routeMap.value ? pointToMapPosition(scopedRoutePoints.value[0], routeMap.value.zoom) : null)
const endPointPosition = computed(() => scopedRoutePoints.value.at(-1) && routeMap.value ? pointToMapPosition(scopedRoutePoints.value.at(-1)!, routeMap.value.zoom) : null)
const selectedDistanceKm = computed(() => {
  const samples = scopedSamples.value
  if (!samples.length || !props.run.distanceKm) return props.run.distanceKm
  const lastOffset = Math.max(samples.at(-1)?.offsetSec ?? 1, 1)
  const ratio = Math.min(Math.max((activeSample.value?.offsetSec ?? lastOffset) / lastOffset, 0), 1)
  return Math.round(props.run.distanceKm * ratio * 100) / 100
})

const hasDetailData = computed(() => scopedRoutePoints.value.length > 1 || scopedSamples.value.length > 1)

function setScope(value: 'all' | '15m') {
  scope.value = value
  selectedIndex.value = 0
}

function selectOffset(offsetSec: number) {
  const sample = nearestSample(scopedSamples.value, offsetSec)
  if (sample) {
    selectedIndex.value = Math.max(0, scopedSamples.value.findIndex((item) => item.offsetSec === sample.offsetSec))
    emit('select-offset', sample.offsetSec)
    return
  }
  emit('select-offset', offsetSec)
}

function nearestRoutePoint(points: RunRoutePoint[], offsetSec: number) {
  return points.reduce((nearest, point) => {
    return Math.abs(point.offsetSec - offsetSec) < Math.abs(nearest.offsetSec - offsetSec) ? point : nearest
  }, points[0])
}

function nearestSample<T extends { offsetSec: number }>(points: T[], offsetSec: number) {
  if (!points.length) return null
  return points.reduce((nearest, point) => {
    return Math.abs(point.offsetSec - offsetSec) < Math.abs(nearest.offsetSec - offsetSec) ? point : nearest
  }, points[0])
}

function buildRouteMap(points: RunRoutePoint[]) {
  if (points.length < 2) return null
  const zoom = estimateRouteZoom(points)
  const projectedPoints = points.map((point) => pointToMapPosition(point, zoom))
  const xs = projectedPoints.map((point) => point.x)
  const ys = projectedPoints.map((point) => point.y)
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  const padding = 64
  minX -= padding
  maxX += padding
  minY -= padding
  maxY += padding

  const desiredAspect = 1.58
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  if (width / height > desiredAspect) {
    const nextHeight = width / desiredAspect
    const delta = (nextHeight - height) / 2
    minY -= delta
    maxY += delta
  } else {
    const nextWidth = height * desiredAspect
    const delta = (nextWidth - width) / 2
    minX -= delta
    maxX += delta
  }

  const minTileX = Math.floor(minX / 256)
  const maxTileX = Math.floor(maxX / 256)
  const minTileY = Math.floor(minY / 256)
  const maxTileY = Math.floor(maxY / 256)
  const tileLimit = 2 ** zoom
  const tiles = []
  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (x < 0 || y < 0 || x >= tileLimit || y >= tileLimit) continue
      tiles.push({
        x,
        y,
        href: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
      })
    }
  }

  return {
    zoom,
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    path: projectedPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
    tiles
  }
}

function estimateRouteZoom(points: RunRoutePoint[]) {
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const span = Math.max(
    Math.max(...latitudes) - Math.min(...latitudes),
    Math.max(...longitudes) - Math.min(...longitudes)
  )
  if (span < 0.006) return 16
  if (span < 0.018) return 15
  if (span < 0.045) return 14
  if (span < 0.09) return 13
  return 12
}

function pointToMapPosition(point: RunRoutePoint, zoom: number) {
  const scale = 256 * 2 ** zoom
  const sinLat = Math.sin((Math.max(Math.min(point.latitude, 85.05112878), -85.05112878) * Math.PI) / 180)
  const x = ((point.longitude + 180) / 360) * scale
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}
</script>

<template>
  <SectionCard v-if="hasDetailData" class="fitness-detail-card">
    <div class="fitness-detail-header">
      <h3>경로 상세</h3>
      <div class="fitness-scope-toggle" role="tablist" aria-label="세부사항 범위">
        <button type="button" :class="{ active: scope === '15m' }" @click="setScope('15m')">15분</button>
        <button type="button" :class="{ active: scope === 'all' }" @click="setScope('all')">전체</button>
      </div>
    </div>

    <div v-if="routeMap" class="fitness-route-card">
      <svg class="fitness-route-map" :viewBox="routeMap.viewBox" role="img" aria-label="러닝 경로">
        <defs>
          <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <image
          v-for="tile in routeMap.tiles"
          :key="`${tile.x}-${tile.y}`"
          :href="tile.href"
          :x="tile.x * 256"
          :y="tile.y * 256"
          width="256"
          height="256"
          preserveAspectRatio="none"
        />
        <rect class="fitness-route-dim" x="-100000" y="-100000" width="200000" height="200000" />
        <polyline class="fitness-route-shadow" :points="routeMap.path" />
        <polyline class="fitness-route-line" :points="routeMap.path" />
        <circle v-if="startPointPosition" class="fitness-route-start" :cx="startPointPosition.x" :cy="startPointPosition.y" r="9" />
        <circle v-if="endPointPosition" class="fitness-route-end" :cx="endPointPosition.x" :cy="endPointPosition.y" r="9" />
        <circle v-if="selectedRoutePosition" class="fitness-route-selected-ring" :cx="selectedRoutePosition.x" :cy="selectedRoutePosition.y" r="16" />
        <circle v-if="selectedRoutePosition" class="fitness-route-selected" :cx="selectedRoutePosition.x" :cy="selectedRoutePosition.y" r="8" />
      </svg>
      <a
        class="fitness-route-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap
      </a>
      <div class="fitness-route-overlay">
        <strong>{{ formatDuration(activeSample?.offsetSec ?? run.durationSec) }}</strong>
        <strong><UnitValue :amount="selectedDistanceKm" unit="km" /></strong>
      </div>
    </div>

    <div v-if="activeSample" class="fitness-selected-metrics">
      <span>선택 구간</span>
      <strong>{{ formatDuration(activeSample.offsetSec) }}</strong>
      <em>{{ formatPace(activeSample.paceSec) }}/km</em>
      <em>{{ formatInteger(activeSample.heartRate) }}BPM</em>
      <em>{{ formatInteger(activeSample.cadence) }}SPM</em>
    </div>

    <LapSplitChart
      :laps="run.laps"
      :metric-samples="scopedSamples"
      :route-points="scopedRoutePoints"
      :selected-offset-sec="selectedOffsetSec"
      @select-offset="selectOffset"
    />
  </SectionCard>
</template>

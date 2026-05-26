<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunLog, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { getChartDomain } from '@/shared/lib/chartAxis'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import SectionCard from '@/shared/ui/SectionCard.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const props = defineProps<{
  run: RunLog
}>()

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
const selectedRoutePoint = computed(() => {
  const points = scopedRoutePoints.value
  const sample = selectedSample.value
  if (!points.length) return null
  if (!sample) return points[0]
  return nearestRoutePoint(points, sample.offsetSec)
})
const routeBounds = computed(() => getRouteBounds(scopedRoutePoints.value))
const routePath = computed(() => pointsToPolyline(scopedRoutePoints.value, routeBounds.value))
const selectedRoutePosition = computed(() => selectedRoutePoint.value ? pointToPosition(selectedRoutePoint.value, routeBounds.value) : null)
const startPointPosition = computed(() => scopedRoutePoints.value[0] ? pointToPosition(scopedRoutePoints.value[0], routeBounds.value) : null)
const endPointPosition = computed(() => scopedRoutePoints.value.at(-1) ? pointToPosition(scopedRoutePoints.value.at(-1)!, routeBounds.value) : null)
const selectedDistanceKm = computed(() => {
  const samples = scopedSamples.value
  if (!samples.length || !props.run.distanceKm) return props.run.distanceKm
  const lastOffset = Math.max(samples.at(-1)?.offsetSec ?? 1, 1)
  const ratio = Math.min(Math.max((selectedSample.value?.offsetSec ?? lastOffset) / lastOffset, 0), 1)
  return Math.round(props.run.distanceKm * ratio * 100) / 100
})

const heartRateStats = computed(() => getStats(scopedSamples.value.map((sample) => sample.heartRate)))
const paceStats = computed(() => getStats(scopedSamples.value.map((sample) => sample.paceSec)))
const cadenceStats = computed(() => getStats(scopedSamples.value.map((sample) => sample.cadence)))
const elevationStats = computed(() => getStats(scopedRoutePoints.value.map((point) => point.altitude)))
const heartRateDomain = computed(() => getChartDomain(scopedSamples.value.map((sample) => sample.heartRate), 'heartRate'))
const paceDomain = computed(() => getChartDomain(scopedSamples.value.map((sample) => sample.paceSec), 'pace'))
const cadenceDomain = computed(() => getChartDomain(scopedSamples.value.map((sample) => sample.cadence), 'cadence'))
const elevationDomain = computed(() => getChartDomain(scopedRoutePoints.value.map((point) => point.altitude), 'elevation'))

const hasDetailData = computed(() => scopedSamples.value.length > 0 || scopedRoutePoints.value.length > 1)

function selectSample(index: number) {
  selectedIndex.value = index
}

function setScope(value: 'all' | '15m') {
  scope.value = value
  selectedIndex.value = 0
}

function barHeight(sample: RunMetricSample, key: 'heartRate' | 'paceSec' | 'cadence') {
  const domain = key === 'heartRate' ? heartRateDomain.value : key === 'paceSec' ? paceDomain.value : cadenceDomain.value
  const value = sample[key]
  if (value === null || !domain) return 0.16
  const range = Math.max(domain.max - domain.min, 1)
  const normalized = key === 'paceSec' ? (domain.max - value) / range : (value - domain.min) / range
  return 0.12 + Math.min(Math.max(normalized, 0), 1) * 0.76
}

function elevationHeight(point: RunRoutePoint) {
  const domain = elevationDomain.value
  if (point.altitude === null || !domain) return 0.16
  const range = Math.max(domain.max - domain.min, 1)
  const normalized = (point.altitude - domain.min) / range
  return 0.12 + Math.min(Math.max(normalized, 0), 1) * 0.76
}

function nearestRoutePoint(points: RunRoutePoint[], offsetSec: number) {
  return points.reduce((nearest, point) => {
    return Math.abs(point.offsetSec - offsetSec) < Math.abs(nearest.offsetSec - offsetSec) ? point : nearest
  }, points[0])
}

function getStats(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!numbers.length) return null
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  return {
    min,
    max,
    average: numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  }
}

function getRouteBounds(points: RunRoutePoint[]) {
  if (!points.length) {
    return { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }
  }
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)
  return {
    minLat,
    maxLat: maxLat === minLat ? maxLat + 0.001 : maxLat,
    minLon,
    maxLon: maxLon === minLon ? maxLon + 0.001 : maxLon
  }
}

function pointToPosition(point: RunRoutePoint, bounds: ReturnType<typeof getRouteBounds>) {
  const x = ((point.longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 88 + 6
  const y = (1 - (point.latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 78 + 10
  return { x, y }
}

function pointsToPolyline(points: RunRoutePoint[], bounds: ReturnType<typeof getRouteBounds>) {
  return points
    .map((point) => pointToPosition(point, bounds))
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
}
</script>

<template>
  <SectionCard v-if="hasDetailData" class="fitness-detail-card">
    <div class="fitness-detail-header">
      <h3>운동 세부사항</h3>
      <div class="fitness-scope-toggle" role="tablist" aria-label="세부사항 범위">
        <button type="button" :class="{ active: scope === '15m' }" @click="setScope('15m')">15분</button>
        <button type="button" :class="{ active: scope === 'all' }" @click="setScope('all')">전체</button>
      </div>
    </div>

    <div class="fitness-route-card">
      <svg v-if="routePath" class="fitness-route-map" viewBox="0 0 100 100" role="img" aria-label="러닝 경로">
        <defs>
          <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polyline class="fitness-route-shadow" :points="routePath" />
        <polyline class="fitness-route-line" :points="routePath" />
        <circle v-if="startPointPosition" class="fitness-route-start" :cx="startPointPosition.x" :cy="startPointPosition.y" r="2.7" />
        <circle v-if="endPointPosition" class="fitness-route-end" :cx="endPointPosition.x" :cy="endPointPosition.y" r="2.7" />
        <circle v-if="selectedRoutePosition" class="fitness-route-selected" :cx="selectedRoutePosition.x" :cy="selectedRoutePosition.y" r="2.6" />
      </svg>
      <div v-else class="fitness-route-empty">표시할 경로 데이터가 없습니다.</div>
      <div class="fitness-route-overlay">
        <strong>{{ formatDuration(selectedSample?.offsetSec ?? run.durationSec) }}</strong>
        <strong><UnitValue :amount="selectedDistanceKm" unit="km" /></strong>
      </div>
    </div>

    <div v-if="selectedSample" class="fitness-selected-metrics">
      <span>선택 구간</span>
      <strong>{{ formatDuration(selectedSample.offsetSec) }}</strong>
      <em>{{ formatPace(selectedSample.paceSec) }}/km</em>
      <em>{{ formatInteger(selectedSample.heartRate) }}BPM</em>
      <em>{{ formatInteger(selectedSample.cadence) }}SPM</em>
    </div>

    <div v-if="elevationStats" class="fitness-mini-chart fitness-chart-elevation">
      <div class="fitness-chart-title">
        <span>고도</span>
        <strong>등반: {{ formatInteger(run.elevationGainM) }}M</strong>
        <small>{{ formatInteger(elevationStats.min) }}~{{ formatInteger(elevationStats.max) }}M</small>
      </div>
      <div class="fitness-bars" aria-hidden="true">
        <button
          v-for="(point, index) in scopedRoutePoints"
          :key="`${point.offsetSec}-${index}`"
          type="button"
          :class="{ active: selectedRoutePoint?.offsetSec === point.offsetSec }"
          :style="{ '--bar-height': `${elevationHeight(point) * 100}%` }"
          @click="selectSample(Math.max(0, scopedSamples.findIndex((sample) => sample.offsetSec >= point.offsetSec)))"
        />
      </div>
    </div>

    <div v-if="scopedSamples.length" class="fitness-mini-chart fitness-chart-hr">
      <div class="fitness-chart-title">
        <span>심박수</span>
        <strong>평균: {{ formatInteger(heartRateStats?.average ?? null) }}BPM</strong>
        <small>{{ formatInteger(heartRateStats?.min ?? null) }}~{{ formatInteger(heartRateStats?.max ?? null) }}BPM</small>
      </div>
      <div class="fitness-bars" aria-hidden="true">
        <button
          v-for="(sample, index) in scopedSamples"
          :key="`hr-${sample.offsetSec}-${index}`"
          type="button"
          :class="{ active: index === safeSelectedIndex }"
          :style="{ '--bar-height': `${barHeight(sample, 'heartRate') * 100}%` }"
          @click="selectSample(index)"
        />
      </div>
    </div>

    <div v-if="scopedSamples.length" class="fitness-mini-chart fitness-chart-pace">
      <div class="fitness-chart-title">
        <span>페이스</span>
        <strong>평균: {{ formatPace(run.avgPaceSec) }}/km</strong>
        <small>{{ formatPace(paceStats?.max ?? null) }}~{{ formatPace(paceStats?.min ?? null) }}/km</small>
      </div>
      <div class="fitness-bars" aria-hidden="true">
        <button
          v-for="(sample, index) in scopedSamples"
          :key="`pace-${sample.offsetSec}-${index}`"
          type="button"
          :class="{ active: index === safeSelectedIndex }"
          :style="{ '--bar-height': `${barHeight(sample, 'paceSec') * 100}%` }"
          @click="selectSample(index)"
        />
      </div>
    </div>

    <div v-if="scopedSamples.length" class="fitness-mini-chart fitness-chart-cadence">
      <div class="fitness-chart-title">
        <span>케이던스</span>
        <strong>평균: {{ formatInteger(cadenceStats?.average ?? null) }}SPM</strong>
        <small>{{ formatInteger(cadenceStats?.min ?? null) }}~{{ formatInteger(cadenceStats?.max ?? null) }}SPM</small>
      </div>
      <div class="fitness-bars" aria-hidden="true">
        <button
          v-for="(sample, index) in scopedSamples"
          :key="`cad-${sample.offsetSec}-${index}`"
          type="button"
          :class="{ active: index === safeSelectedIndex }"
          :style="{ '--bar-height': `${barHeight(sample, 'cadence') * 100}%` }"
          @click="selectSample(index)"
        />
      </div>
    </div>
  </SectionCard>
</template>

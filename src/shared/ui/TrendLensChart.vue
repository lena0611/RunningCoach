<script setup lang="ts">
import { computed } from 'vue'
import type { TrendChartPoint } from '@/shared/lib/trendInsights'

const props = defineProps<{
  points: TrendChartPoint[]
  unit?: string
}>()

const chartPoints = computed(() => {
  const values = props.points.map((point) => point.value).filter((value) => Number.isFinite(value))
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const span = Math.max(max - min, 1)
  return props.points.map((point, index) => ({
    ...point,
    x: props.points.length <= 1 ? 50 : (index / (props.points.length - 1)) * 100,
    y: 88 - ((point.value - min) / span) * 70
  }))
})

const polyline = computed(() => chartPoints.value.map((point) => `${point.x},${point.y}`).join(' '))
const latestPoint = computed(() => chartPoints.value[chartPoints.value.length - 1] ?? null)
</script>

<template>
  <div class="trend-lens-chart" role="img" aria-label="추세 렌즈 차트">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="88" x2="100" y2="88" class="trend-lens-axis" />
      <line x1="0" y1="52" x2="100" y2="52" class="trend-lens-grid" />
      <polyline v-if="chartPoints.length > 1" :points="polyline" class="trend-lens-line" />
      <circle
        v-for="point in chartPoints"
        :key="point.id"
        :cx="point.x"
        :cy="point.y"
        r="2.6"
        class="trend-lens-dot"
        :class="point.status ? `trend-lens-dot-${point.status}` : ''"
      />
    </svg>
    <div v-if="latestPoint" class="trend-lens-latest">
      <strong>{{ latestPoint.value }}{{ unit ?? '' }}</strong>
      <span>{{ latestPoint.detail || latestPoint.label }}</span>
    </div>
  </div>
</template>

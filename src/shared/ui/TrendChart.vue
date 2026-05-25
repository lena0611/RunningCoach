<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import { init } from 'echarts/core'

use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer])

export type TrendChartPoint = {
  label: string
  value: number
  detail?: string
}

const props = defineProps<{
  points: TrendChartPoint[]
  unit?: string
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const values = computed(() => props.points.map((point) => point.value))
const labels = computed(() => props.points.map((point) => point.label))

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart = init(chartRef.value, undefined, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  renderChart()
})

watch(
  () => [props.points, props.unit],
  () => renderChart(),
  { deep: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})

function getColor(name: string) {
  if (!chartRef.value) return ''
  return getComputedStyle(chartRef.value).getPropertyValue(name).trim()
}

function renderChart() {
  if (!chart) return
  const primary = getColor('--color-primary') || '#4ade80'
  const accent = getColor('--color-accent') || '#38bdf8'
  const text = getColor('--color-text') || '#f4f7fb'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'

  const option: EChartsOption = {
    animationDuration: 520,
    grid: { left: 8, right: 8, top: 18, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'axis',
      borderWidth: 0,
      backgroundColor: getColor('--color-surface') || '#141a21',
      textStyle: { color: text },
      valueFormatter: (value) => `${Number(value).toFixed(2)}${props.unit ?? ''}`
    },
    xAxis: {
      type: 'category',
      data: labels.value,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontWeight: 700 }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: { color: muted, fontWeight: 700 }
    },
    series: [
      {
        type: 'bar',
        data: values.value,
        barMaxWidth: 22,
        itemStyle: {
          borderRadius: [10, 10, 4, 4],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: primary },
              { offset: 1, color: accent }
            ]
          }
        }
      },
      {
        type: 'line',
        data: values.value,
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 3, color: primary },
        itemStyle: { color: primary },
        areaStyle: { opacity: 0.08, color: primary }
      }
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <div ref="chartRef" class="trend-echart" role="img" aria-label="러닝 추이 차트" />
</template>

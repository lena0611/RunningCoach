<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import { init } from 'echarts/core'
import { getChartDomain, type ChartMetricKind } from '@/shared/lib/chartAxis'
import { formatInteger, formatPace } from '@/shared/lib/format'

use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer])

type MetricType = 'pace' | 'heartRate' | 'cadence'

const props = defineProps<{
  labels: string[]
  values: Array<number | null | undefined>
  title: string
  type: MetricType
  color: string
  chartType: 'line' | 'bar'
  domainKind: ChartMetricKind
  inverse?: boolean
  axisName?: string
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const numbers = computed(() => props.values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))
const domain = computed(() => getChartDomain(props.values, props.domainKind))
const summary = computed(() => {
  if (!numbers.value.length) return '-'
  const average = numbers.value.reduce((sum, value) => sum + value, 0) / numbers.value.length
  return formatMetric(average)
})
const range = computed(() => {
  const currentDomain = domain.value
  if (!currentDomain) return '-'
  return `${formatMetric(currentDomain.dataMin)}~${formatMetric(currentDomain.dataMax)}`
})

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart = init(chartRef.value, undefined, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  renderChart()
})

watch(
  () => [props.labels, props.values, props.type, props.color, props.chartType, props.domainKind, props.inverse],
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

function formatMetric(value: number) {
  if (props.type === 'pace') return `${formatPace(value)}/km`
  if (props.type === 'heartRate') return `${formatInteger(value)}BPM`
  return `${formatInteger(value)}SPM`
}

function renderChart() {
  if (!chart) return
  const text = getColor('--color-text') || '#f4f7fb'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  const currentDomain = domain.value

  const option: EChartsOption = {
    animationDuration: 480,
    grid: { left: 8, right: 8, top: 12, bottom: 18, containLabel: true },
    tooltip: {
      trigger: 'axis',
      borderWidth: 0,
      backgroundColor: getColor('--color-surface') || '#141a21',
      textStyle: { color: text },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { axisValue?: string | number; value?: number } | undefined
        const value = Number(first?.value)
        if (!Number.isFinite(value)) return ''
        const label = props.axisName === '랩' ? `${first?.axisValue ?? ''}랩` : `${first?.axisValue ?? ''}`
        return `<strong>${label}</strong><div style="display:flex;justify-content:space-between;gap:18px"><span>${props.title}</span><strong>${formatMetric(value)}</strong></div>`
      }
    },
    xAxis: {
      type: 'category',
      data: props.labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontWeight: 700 }
    },
    yAxis: {
      type: 'value',
      inverse: props.inverse,
      min: currentDomain?.min,
      max: currentDomain?.max,
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: {
        color: muted,
        fontWeight: 700,
        formatter: (value: number) => {
          if (props.type === 'pace') return formatPace(value)
          return formatInteger(value)
        }
      }
    },
    series: [
      {
        name: props.title,
        type: props.chartType,
        data: props.values,
        smooth: props.chartType === 'line',
        symbolSize: props.chartType === 'line' ? 6 : 0,
        barMaxWidth: 16,
        lineStyle: { width: 3, color: props.color },
        itemStyle: {
          color: props.color,
          opacity: props.chartType === 'bar' ? 0.7 : 1,
          borderRadius: props.chartType === 'bar' ? [8, 8, 2, 2] : 0
        },
        areaStyle: props.chartType === 'line' ? { opacity: 0.08, color: props.color } : undefined
      }
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <article class="lap-metric-card">
    <header class="lap-metric-header">
      <div>
        <span>{{ title }}</span>
        <strong>{{ summary }}</strong>
      </div>
      <small>{{ range }}</small>
    </header>
    <div ref="chartRef" class="lap-metric-chart" role="img" :aria-label="`랩별 ${title} 차트`" />
  </article>
</template>

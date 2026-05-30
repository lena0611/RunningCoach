<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, MarkPointComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import { init } from 'echarts/core'
import { getChartDomain, type ChartMetricKind } from '@/shared/lib/chartAxis'
import { formatInteger, formatPace } from '@/shared/lib/format'
import { triggerSelectionHaptic } from '@/shared/lib/haptics'
import { preparePaceChartDisplayValues } from '@/shared/lib/paceChartDisplay'

use([BarChart, LineChart, GridComponent, MarkLineComponent, MarkPointComponent, TooltipComponent, CanvasRenderer])

type MetricType = 'pace' | 'heartRate' | 'cadence' | 'elevation'

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
  selectedIndex?: number | null
}>()
const emit = defineEmits<{
  'select-index': [index: number]
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null
let dragging = false
let lastEmittedIndex = -1

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
  if (props.type === 'pace') {
    return `${formatMetric(currentDomain.displayMin)}~${formatMetric(currentDomain.displayMax)}`
  }
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
  () => [props.labels, props.values, props.type, props.color, props.chartType, props.domainKind, props.inverse, props.selectedIndex],
  () => renderChart(),
  { deep: true }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})

function selectByPointer(event: PointerEvent) {
  if (!chartRef.value || !props.labels.length) return
  const rect = chartRef.value.getBoundingClientRect()
  const ratio = Math.min(Math.max((event.clientX - rect.left) / Math.max(rect.width, 1), 0), 1)
  const index = Math.round(ratio * (props.labels.length - 1))
  if (index === lastEmittedIndex) return
  lastEmittedIndex = index
  emit('select-index', index)
  triggerSelectionHaptic()
}

function startPointerSelection(event: PointerEvent) {
  dragging = true
  chartRef.value?.setPointerCapture(event.pointerId)
  selectByPointer(event)
}

function movePointerSelection(event: PointerEvent) {
  if (!dragging) return
  event.preventDefault()
  selectByPointer(event)
}

function stopPointerSelection(event: PointerEvent) {
  dragging = false
  chartRef.value?.releasePointerCapture(event.pointerId)
}

function getColor(name: string) {
  if (!chartRef.value) return ''
  return getComputedStyle(chartRef.value).getPropertyValue(name).trim()
}

function formatMetric(value: number) {
  if (props.type === 'pace') return `${formatPace(value)}/km`
  if (props.type === 'heartRate') return `${formatInteger(value)}BPM`
  if (props.type === 'elevation') return `${formatInteger(value)}M`
  return `${formatInteger(value)}SPM`
}

function shouldInvertBarValues() {
  return props.chartType === 'bar' && props.inverse && props.type === 'pace'
}

function invertDomainValue(value: number) {
  const currentDomain = domain.value
  if (!currentDomain) return value
  return currentDomain.min + currentDomain.max - value
}

function shouldShowYAxisLabel(value: number) {
  const currentDomain = domain.value
  if (!currentDomain?.interval || (props.type !== 'pace' && props.type !== 'heartRate')) return true
  const displayValue = shouldInvertBarValues() ? invertDomainValue(value) : value
  const tickIndex = Math.round((displayValue - currentDomain.min) / currentDomain.interval)
  return tickIndex % 3 === 0
}

function renderChart() {
  if (!chart) return
  const text = getColor('--color-text') || '#f4f7fb'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  const currentDomain = domain.value
  const useInvertedBarValues = shouldInvertBarValues()
  const displayValues = useInvertedBarValues && currentDomain
    ? preparePaceChartDisplayValues(props.values, { minSec: currentDomain.min, maxSec: currentDomain.max })
    : props.values
  const chartValues = useInvertedBarValues
    ? displayValues.map((value) => typeof value === 'number' && Number.isFinite(value) ? invertDomainValue(value) : value)
    : displayValues

  const option: EChartsOption = {
    animationDuration: 480,
    grid: { left: 8, right: 8, top: 12, bottom: 18, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'none' },
      borderWidth: 0,
      backgroundColor: getColor('--color-surface') || '#141a21',
      textStyle: { color: text },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { axisValue?: string | number; dataIndex?: number; value?: number } | undefined
        const sourceValue = typeof first?.dataIndex === 'number' ? props.values[first.dataIndex] : first?.value
        const displayValue = typeof first?.dataIndex === 'number' ? displayValues[first.dataIndex] : first?.value
        const value = Number(sourceValue)
        const fallbackValue = Number(displayValue)
        if (!Number.isFinite(value) && !Number.isFinite(fallbackValue)) return ''
        const label = props.axisName === '랩' ? `${first?.axisValue ?? ''}랩` : `${first?.axisValue ?? ''}`
        const metricValue = Number.isFinite(value) ? value : fallbackValue
        const metricLabel = formatMetric(metricValue)
        return `<strong>${label}</strong><div style="display:flex;justify-content:space-between;gap:18px"><span>${props.title}</span><strong>${metricLabel}</strong></div>`
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
      inverse: useInvertedBarValues ? false : props.inverse,
      min: currentDomain?.min,
      max: currentDomain?.max,
      interval: currentDomain?.interval,
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: {
        color: muted,
        fontWeight: 700,
        formatter: (value: number) => {
          if (!shouldShowYAxisLabel(value)) return ''
          if (props.type === 'pace') return formatPace(useInvertedBarValues ? invertDomainValue(value) : value)
          return formatInteger(value)
        }
      }
    },
    series: [
      {
        name: props.title,
        type: props.chartType,
        data: chartValues,
        smooth: props.chartType === 'line',
        symbolSize: props.chartType === 'line' ? 4 : 0,
        barMaxWidth: 16,
        lineStyle: { width: 2, color: props.color },
        itemStyle: {
          color: props.color,
          opacity: props.chartType === 'bar' ? 0.7 : 1,
          borderRadius: props.chartType === 'bar' ? [8, 8, 2, 2] : 0
        },
        areaStyle: props.chartType === 'line' ? { opacity: 0.08, color: props.color } : undefined
      }
    ]
  }
  if (typeof props.selectedIndex === 'number' && props.labels[props.selectedIndex]) {
    const series = option.series as Array<Record<string, unknown>>
    const selectedValue = props.values[props.selectedIndex]
    const selectedDisplayValue = displayValues[props.selectedIndex]
    series[0].markLine = {
      symbol: 'none',
      silent: true,
      label: { show: false },
      lineStyle: {
        color: text,
        opacity: 0.88,
        width: 2,
        type: 'dashed'
      },
      data: [{ xAxis: props.labels[props.selectedIndex] }]
    }
    if (
      typeof selectedDisplayValue === 'number' &&
      Number.isFinite(selectedDisplayValue)
    ) {
      series[0].markPoint = {
        symbol: 'circle',
        symbolSize: 10,
        silent: true,
        animation: false,
        animationDuration: 0,
        animationDurationUpdate: 0,
        itemStyle: {
          color: '#f8fafc',
          borderColor: props.color,
          borderWidth: 3,
          shadowBlur: 12,
          shadowColor: props.color
        },
        data: [{ coord: [props.labels[props.selectedIndex], useInvertedBarValues ? invertDomainValue(selectedDisplayValue) : selectedDisplayValue] }]
      }
    }
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
    <div
      ref="chartRef"
      class="lap-metric-chart"
      role="img"
      data-no-swipe
      :aria-label="`랩별 ${title} 차트`"
      @pointerdown="startPointerSelection"
      @pointermove="movePointerSelection"
      @pointerup="stopPointerSelection"
      @pointercancel="stopPointerSelection"
      @lostpointercapture="dragging = false"
    />
  </article>
</template>

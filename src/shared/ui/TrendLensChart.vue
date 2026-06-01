<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import { getChartDomain, inferChartMetricKind } from '@/shared/lib/chartAxis'
import { formatInteger, formatNumberWithCommas } from '@/shared/lib/format'
import type { TrendChartPoint } from '@/shared/lib/trendInsights'

type EchartsRuntime = {
  init: (element: HTMLElement, theme?: string, options?: { renderer?: 'canvas' }) => ECharts
}

const props = defineProps<{
  points: TrendChartPoint[]
  unit?: string
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null
let echartsRuntime: EchartsRuntime | null = null

const values = computed(() => props.points.map((point) => point.value))
const labels = computed(() => props.points.map((point) => point.label))
const latestPoint = computed(() => props.points[props.points.length - 1] ?? null)

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  const runtime = await loadEcharts()
  if (!chartRef.value) return
  chart = runtime.init(chartRef.value, undefined, { renderer: 'canvas' })
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

async function loadEcharts() {
  if (echartsRuntime) return echartsRuntime
  const [
    chartsModule,
    componentsModule,
    coreModule,
    rendererModule
  ] = await Promise.all([
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/core'),
    import('echarts/renderers')
  ])
  coreModule.use([
    chartsModule.BarChart,
    componentsModule.GridComponent,
    componentsModule.TooltipComponent,
    rendererModule.CanvasRenderer
  ])
  echartsRuntime = { init: coreModule.init as EchartsRuntime['init'] }
  return echartsRuntime
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) return '-'
  const rounded = Math.abs(value) >= 10 ? formatInteger(value) : formatNumberWithCommas(value, { maximumFractionDigits: 1 })
  return `${rounded}${props.unit ?? ''}`
}

function renderChart() {
  if (!chart) return
  const primary = getColor('--color-primary') || '#4ade80'
  const text = getColor('--color-text') || '#f4f7fb'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  const domain = getChartDomain(values.value, inferChartMetricKind(props.unit))

  const option: EChartsOption = {
    animationDuration: 480,
    grid: { left: 8, right: 8, top: 12, bottom: 18, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: subtle, opacity: 0.34 } },
      confine: true,
      borderWidth: 0,
      backgroundColor: getColor('--color-surface') || '#141a21',
      textStyle: { color: text },
      extraCssText: 'z-index:1; pointer-events:none;',
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { axisValue?: string | number; dataIndex?: number; value?: number } | undefined
        const point = typeof first?.dataIndex === 'number' ? props.points[first.dataIndex] : null
        const value = Number(first?.value)
        if (!Number.isFinite(value)) return ''
        return `<strong>${first?.axisValue ?? ''}</strong><div style="display:grid;gap:4px;margin-top:6px"><span>${point?.detail ?? ''}</span><strong>${formatValue(value)}</strong></div>`
      }
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
      min: domain?.min,
      max: domain?.max,
      interval: domain?.interval,
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: {
        color: muted,
        fontWeight: 700,
        formatter: (value: number) => formatValue(value)
      }
    },
    series: [
      {
        type: 'bar',
        data: values.value,
        barMaxWidth: 18,
        itemStyle: {
          color: primary,
          opacity: 0.88,
          borderRadius: [8, 8, 2, 2]
        }
      }
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <div
    class="trend-lens-chart"
    data-no-swipe
    role="img"
    aria-label="추세 렌즈 막대 차트"
    @pointerdown.stop
    @pointermove.stop
    @touchstart.stop
    @touchmove.stop
  >
    <div ref="chartRef" class="trend-lens-echart" aria-hidden="true" />
    <div v-if="latestPoint" class="trend-lens-latest">
      <strong>{{ formatValue(latestPoint.value) }}</strong>
      <span>{{ latestPoint.detail || latestPoint.label }}</span>
    </div>
  </div>
</template>

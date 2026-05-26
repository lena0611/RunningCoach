<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import { init } from 'echarts/core'
import type { Lap } from '@/entities/run/model'
import { getChartDomain } from '@/shared/lib/chartAxis'
import { formatInteger, formatPace } from '@/shared/lib/format'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  laps: Lap[]
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const chartLaps = computed(() => props.laps.filter((lap) => lap.paceSec || lap.avgHeartRate || lap.cadence))
const labels = computed(() => chartLaps.value.map((lap) => String(lap.index)))

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart = init(chartRef.value, undefined, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  renderChart()
})

watch(
  () => props.laps,
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
  const text = getColor('--color-text') || '#f4f7fb'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  const paceColor = '#22d3ee'
  const hrColor = '#ef4444'
  const cadColor = '#38bdf8'
  const paceDomain = getChartDomain(chartLaps.value.map((lap) => lap.paceSec), 'pace')
  const effortDomain = getChartDomain(
    chartLaps.value.flatMap((lap) => [lap.avgHeartRate, lap.cadence]),
    'heartCadence'
  )

  const option: EChartsOption = {
    animationDuration: 520,
    color: [paceColor, hrColor, cadColor],
    grid: { left: 8, right: 10, top: 42, bottom: 28, containLabel: true },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: muted, fontWeight: 800 }
    },
    tooltip: {
      trigger: 'axis',
      borderWidth: 0,
      backgroundColor: getColor('--color-surface') || '#141a21',
      textStyle: { color: text },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { axisValue?: string | number } | undefined
        const lapIndex = first?.axisValue ?? ''
        const rows = list.map((item: any) => {
          const name = String(item.seriesName)
          const value = Number(item.value)
          if (!Number.isFinite(value)) return ''
          const display = name === '페이스' ? `${formatPace(value)}/km` : name === '심박' ? `${formatInteger(value)}BPM` : `${formatInteger(value)}SPM`
          return `<div style="display:flex;justify-content:space-between;gap:18px"><span>${name}</span><strong>${display}</strong></div>`
        }).join('')
        return `<strong>${lapIndex}랩</strong>${rows}`
      }
    },
    xAxis: {
      type: 'category',
      data: labels.value,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: muted, fontWeight: 850 }
    },
    yAxis: [
      {
        type: 'value',
        inverse: true,
        min: paceDomain?.min,
        max: paceDomain?.max,
        splitLine: { lineStyle: { color: subtle } },
        axisLabel: {
          color: paceColor,
          fontWeight: 800,
          formatter: (value: number) => formatPace(value)
        }
      },
      {
        type: 'value',
        min: effortDomain?.min,
        max: effortDomain?.max,
        splitLine: { show: false },
        axisLabel: { color: muted, fontWeight: 800 }
      }
    ],
    series: [
      {
        name: '페이스',
        type: 'line',
        yAxisIndex: 0,
        data: chartLaps.value.map((lap) => lap.paceSec),
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3, color: paceColor },
        itemStyle: { color: paceColor },
        areaStyle: { opacity: 0.08, color: paceColor }
      },
      {
        name: '심박',
        type: 'bar',
        yAxisIndex: 1,
        data: chartLaps.value.map((lap) => lap.avgHeartRate),
        barMaxWidth: 16,
        itemStyle: {
          color: hrColor,
          opacity: 0.35,
          borderRadius: [8, 8, 2, 2]
        }
      },
      {
        name: '케이던스',
        type: 'line',
        yAxisIndex: 1,
        data: chartLaps.value.map((lap) => lap.cadence),
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 2, color: cadColor, type: 'dashed' },
        itemStyle: { color: cadColor }
      }
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <div ref="chartRef" class="lap-split-chart" role="img" aria-label="랩별 페이스 심박 케이던스 차트" />
</template>

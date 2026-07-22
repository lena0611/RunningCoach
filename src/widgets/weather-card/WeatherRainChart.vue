<script setup lang="ts">
import { LineChart } from 'echarts/charts'
import { AxisPointerComponent, GridComponent, MarkAreaComponent, MarkLineComponent } from 'echarts/components'
import { use, init } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { WeatherHourlyPoint } from '@/features/import-weatherkit/weatherKitBridge'
import { triggerSelectionHaptic } from '@/shared/lib/haptics'

// MarkAreaComponent = 과거 구간 빗금 — 미등록 시 조용히 안 그려진다(ECharts 트리셰이킹 함정).
use([LineChart, AxisPointerComponent, GridComponent, MarkAreaComponent, MarkLineComponent, CanvasRenderer])

/**
 * 시간대별 강수확률 차트(온도 차트 아래 별도 신설).
 * - 데이터: 기상청 단기예보 POP → precipitationChance(0~1). WeatherHourlyPoint 그대로.
 * - 온도 차트와 X축 좌표계(6시간 라벨·과거 점선·'지금' 세로선)를 동일하게 맞춰 시각적으로 정렬.
 * - Y축 0~100% 고정·우측. 터치 축 툴팁(상단 고정)은 공용 프리셋 재사용.
 * 축 로직은 WeatherHourlyChart와 의도적으로 병렬 유지(현재 2곳 — 3번째 생기면 공통 축 유틸로 추출).
 */
const props = defineProps<{
  hours: WeatherHourlyPoint[]
  nowMs: number | null
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const scrubIndex = ref<number | null>(null)
const isScrubbing = computed(() => scrubIndex.value !== null)

const pops = computed(() =>
  props.hours.map((hour) => (hour.precipitationChance === null || hour.precipitationChance === undefined ? null : Math.round(hour.precipitationChance * 100)))
)

// 강수확률 데이터가 전무하면 차트를 렌더하지 않는다(부모가 v-if로 게이트).
const hasData = computed(() => pops.value.some((value) => value !== null))
defineExpose({ hasData })

const nowIndex = computed(() => {
  if (props.nowMs === null) return -1
  let index = -1
  for (let i = 0; i < props.hours.length; i += 1) {
    if (Date.parse(props.hours[i].time) <= props.nowMs) index = i
    else break
  }
  return index
})

// 오늘 최대 강수확률(헤더 기본 표시용). 오늘이 아니면 그날 전체 최대.
const peakChance = computed(() => {
  const values = pops.value.filter((value): value is number => value !== null)
  return values.length ? Math.max(...values) : 0
})

// 스크럽 중이면 그 시각 값을 헤더 우측에 표시(손가락에 가리지 않도록 차트 위 헤더에).
const scrubHour = computed(() => (scrubIndex.value !== null ? props.hours[scrubIndex.value] ?? null : null))
const scrubChance = computed(() => (scrubIndex.value !== null ? pops.value[scrubIndex.value] : null))

function hourOf(index: number) {
  return new Date(props.hours[index]?.time ?? 0).getHours()
}
function formatHourLabel(time: string) {
  const h = new Date(time).getHours()
  const period = h < 12 ? '오전' : '오후'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${period} ${display}시`
}

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart = init(chartRef.value, undefined, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  // 온도 차트와 동일 방식: 스크럽 값은 차트 내부 툴팁이 아니라 차트 '위' 헤더에 표시
  // (모바일에서 손가락이 툴팁을 가리는 문제 해소).
  chart.on('updateAxisPointer', (event) => {
    const value = (event as { axesInfo?: Array<{ value: number }> }).axesInfo?.[0]?.value
    if (typeof value !== 'number' || value === scrubIndex.value) return
    scrubIndex.value = value
    triggerSelectionHaptic()
  })
  const zr = chart.getZr()
  zr.on('mouseup', () => {
    scrubIndex.value = null
  })
  zr.on('globalout', () => {
    scrubIndex.value = null
  })
  renderChart()
})

watch(
  () => [props.hours, props.nowMs] as const,
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

// 과거 구간 빗금 패턴(애플 날씨 레퍼런스) — 지난 시간은 값 라인 대신 사선 해칭으로 "지나감"을 표현.
// ECharts 색상 자리엔 {image, repeat} 패턴 객체를 넣는다(zrender ImagePattern).
type EChartsPattern = { image: HTMLCanvasElement; repeat: 'repeat' }
let hatchCanvas: HTMLCanvasElement | null = null
function hatchPattern(color: string): EChartsPattern | string {
  if (!hatchCanvas) {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'transparent'
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.28
    ctx.lineWidth = 1.5
    // 8px 타일에 이어지는 사선(↗) 스트라이프 — repeat 시 끊김 없음.
    ctx.beginPath()
    ctx.moveTo(-2, 10)
    ctx.lineTo(10, -2)
    ctx.moveTo(-2, 2)
    ctx.lineTo(2, -2)
    ctx.moveTo(6, 10)
    ctx.lineTo(10, 6)
    ctx.stroke()
    hatchCanvas = canvas
  }
  return { image: hatchCanvas, repeat: 'repeat' }
}

function renderChart() {
  if (!chart || !props.hours.length) return
  const accent = getColor('--color-accent') || '#38bdf8'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  const boundary = nowIndex.value

  // 과거는 라인을 그리지 않는다 — 대신 그 구간 전체를 빗금으로 덮는다(애플 날씨 스타일, 사용자 요청).
  const futureData = pops.value.map((value, index) => (boundary < 0 || index >= boundary ? value : null))

  const option: EChartsOption = {
    animationDuration: 380,
    grid: { left: 12, right: 8, top: 12, bottom: 22, containLabel: true },
    xAxis: {
      type: 'category',
      data: props.hours.map((_, index) => index),
      boundaryGap: false,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: muted,
        fontWeight: 700,
        fontSize: 12,
        interval: (index: number) => hourOf(index) % 6 === 0 && index !== props.hours.length - 1,
        formatter: (_: string, index: number) => formatHourLabel(props.hours[index].time)
      },
      axisPointer: { show: true, snap: true, lineStyle: { color: accent, width: 1.5 }, label: { show: false } }
    },
    yAxis: {
      type: 'value',
      position: 'right',
      min: 0,
      max: 100,
      interval: 20,
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: { color: muted, fontWeight: 700, fontSize: 12, formatter: '{value}%' }
    },
    series: [
      {
        type: 'line',
        data: futureData,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: accent },
        areaStyle: { opacity: 0.16, color: accent },
        emphasis: { disabled: true },
        // 지나간 구간(자정~지금)은 사선 빗금으로 덮는다 — 과거 라인 미표시(애플 날씨 스타일).
        markArea:
          boundary > 0
            ? {
                silent: true,
                itemStyle: { color: hatchPattern(muted) },
                data: [[{ xAxis: 0 }, { xAxis: boundary }]]
              }
            : undefined,
        markLine:
          boundary >= 0
            ? {
                silent: true,
                symbol: 'none',
                data: [{ xAxis: boundary }],
                lineStyle: { color: accent, width: 1.5, type: 'solid', opacity: 0.9 },
                label: { show: false }
              }
            : undefined
      }
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <div v-if="hasData" class="weather-rain">
    <!-- 스크럽 값은 차트 위 헤더에 표시(손가락이 차트 내부 툴팁을 가리는 문제 해소) -->
    <div class="weather-rain-header" :class="{ scrubbing: isScrubbing }" aria-live="polite">
      <strong>강수 확률</strong>
      <span v-if="scrubHour && scrubChance !== null">{{ formatHourLabel(scrubHour.time) }} · 💧 {{ scrubChance }}%</span>
      <span v-else>오늘 최대 {{ peakChance }}%</span>
    </div>
    <div ref="chartRef" class="weather-rain-chart" data-no-swipe role="img" aria-label="시간대별 강수확률 차트" />
  </div>
</template>

<style scoped>
.weather-rain {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}
.weather-rain-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}
.weather-rain-header strong {
  font-size: var(--text-caption-size);
  color: var(--color-strong);
}
.weather-rain-header span {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
  transition: color 0.15s ease;
}
.weather-rain-header.scrubbing span {
  color: var(--color-accent);
  font-weight: 700;
}
.weather-rain-chart {
  height: 180px;
  /* 세로 스크롤은 페이지에, 가로 드래그는 차트 스크럽으로(터치). */
  touch-action: pan-y;
}
</style>

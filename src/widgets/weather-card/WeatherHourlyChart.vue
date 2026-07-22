<script setup lang="ts">
import { LineChart, ScatterChart } from 'echarts/charts'
import { AxisPointerComponent, GridComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components'
import { use, init } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { WeatherHourlyPoint } from '@/features/import-weatherkit/weatherKitBridge'
import { formatRainAmount, formatWeatherNumber, weatherSymbolToEmoji } from '@/shared/lib/weather'
import { triggerSelectionHaptic } from '@/shared/lib/haptics'

// ScatterChart=현재 시각 점, MarkPointComponent=최고/최저 라벨 — 미등록 시 조용히 안 그려진다.
use([LineChart, ScatterChart, AxisPointerComponent, GridComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer])

/**
 * 날씨 시간대 차트(터치 우선).
 * - X축 라벨 12시간 간격, 상단 축에 날씨 아이콘 2시간 간격(같은 좌표계라 어긋나지 않음)
 * - 오늘이면 현재 시각 기준 과거 구간은 점선(muted), '지금' 세로 라인 표시
 * - 스크럽(터치 드래그/마우스 이동) 상세는 차트 위 고정 패널에 표시 — 손가락이 툴팁을
 *   가리는 문제를 피하고, 놓으면 '지금'(오늘) 또는 첫 시간으로 복귀한다.
 * 데이터는 1시간 해상도 전체(dayHours)를 받아 라인은 촘촘하게 그린다.
 */
const props = defineProps<{
  hours: WeatherHourlyPoint[]
  // 오늘이면 현재(관측) 시각 epoch ms, 다른 날짜면 null — 과거 점선·지금 라인을 끈다.
  nowMs: number | null
  tempMode: 'actual' | 'feel'
}>()

const chartRef = ref<HTMLElement | null>(null)
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const scrubIndex = ref<number | null>(null)

// 온도 없는 빈 슬롯(자정~예보 시작 전 등)은 null로 둬 라인이 끊기게 한다(0°로 찍지 않음).
const actualTemps = computed(() =>
  props.hours.map((hour) => (hour.temperatureC == null ? null : Math.round(hour.temperatureC)))
)
const feltTemps = computed(() =>
  props.hours.map((hour) => {
    const value = hour.apparentTemperatureC ?? hour.temperatureC
    return value == null ? null : Math.round(value)
  })
)
const temps = computed(() => (props.tempMode === 'feel' ? feltTemps.value : actualTemps.value))

// 마지막 과거 인덱스(경계 포함) — 이 지점까지 점선, 여기부터 실선이 이어진다.
const nowIndex = computed(() => {
  if (props.nowMs === null) return -1
  let index = -1
  for (let i = 0; i < props.hours.length; i += 1) {
    if (Date.parse(props.hours[i].time) <= props.nowMs!) index = i
    else break
  }
  return index
})

const detailIndex = computed(() => scrubIndex.value ?? Math.max(0, nowIndex.value))
const detailHour = computed(() => props.hours[detailIndex.value] ?? null)
const isScrubbing = computed(() => scrubIndex.value !== null)

function hourOf(index: number) {
  return new Date(props.hours[index]?.time ?? 0).getHours()
}
function formatHourLabel(time: string) {
  const h = new Date(time).getHours()
  const period = h < 12 ? '오전' : '오후'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${period} ${display}시`
}

const detailTitle = computed(() => {
  if (!detailHour.value) return ''
  const timeLabel = formatHourLabel(detailHour.value.time)
  return isScrubbing.value || nowIndex.value < 0 ? timeLabel : `지금 · ${timeLabel}`
})

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart = init(chartRef.value, undefined, { renderer: 'canvas' })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartRef.value)
  chart.on('updateAxisPointer', (event) => {
    const value = (event as { axesInfo?: Array<{ value: number }> }).axesInfo?.[0]?.value
    if (typeof value !== 'number' || value === scrubIndex.value) return
    // 구간(시간)이 바뀔 때마다 선택 햅틱 — 드래그가 새 시간 칸에 들어왔음을 손끝으로 알림.
    scrubIndex.value = value
    triggerSelectionHaptic()
  })
  // 스크럽 종료(터치 놓음/포인터 이탈) 시 '지금'으로 복귀 — 선택이 화면에 눌어붙지 않게.
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
  () => [props.hours, props.tempMode, props.nowMs] as const,
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
  if (!chart || !props.hours.length) return
  const primary = getColor('--color-primary') || '#4ade80'
  const accent = getColor('--color-accent') || '#38bdf8'
  const muted = getColor('--color-muted') || '#8b98a8'
  const subtle = getColor('--color-subtle-2') || 'rgba(255,255,255,0.08)'
  // Y축: 3° 눈금 + 실제·체감 공통 스케일. 최고점 2칸(6°) 위·최저점 2칸 아래로 여백을 둬
  // 라인이 가운데 오게 하고, 탭 전환 시 축이 흔들리지 않게 한다(체감이 낮아 보이던 착시 방지).
  const nums = [...actualTemps.value, ...feltTemps.value].filter((v): v is number => v != null)
  const dataMax = nums.length ? Math.max(...nums) : 30
  const dataMin = nums.length ? Math.min(...nums) : 18
  const yMax = Math.round(dataMax / 3) * 3 + 6
  const yMin = Math.round(dataMin / 3) * 3 - 6
  const boundary = nowIndex.value

  const pastData = temps.value.map((value, index) => (boundary >= 0 && index <= boundary ? value : null))
  const futureData = temps.value.map((value, index) => (boundary < 0 || index >= boundary ? value : null))

  // 최고/최저 지점(표시 중인 지표 기준) — 애플 날씨식 라벨.
  const disp = temps.value
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value != null)
  const maxPoint = disp.length ? disp.reduce((best, cur) => (cur.value > best.value ? cur : best)) : null
  const minPoint = disp.length ? disp.reduce((best, cur) => (cur.value < best.value ? cur : best)) : null

  const option: EChartsOption = {
    animationDuration: 380,
    grid: { left: 12, right: 8, top: 34, bottom: 22, containLabel: true },
    axisPointer: { triggerOn: 'mousemove|click' },
    xAxis: [
      {
        type: 'category',
        data: props.hours.map((_, index) => index),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        // X축 라벨은 6시간 정각 그리드(오전 12·6시, 오후 12·6시). 마지막 지점은 축 끝에
        // 잘려 붙으므로 제외(다음날 자정 등 경계 라벨 미표시).
        axisLabel: {
          color: muted,
          fontWeight: 700,
          fontSize: 12,
          interval: (index: number) => hourOf(index) % 6 === 0 && index !== props.hours.length - 1,
          formatter: (_: string, index: number) => formatHourLabel(props.hours[index].time)
        },
        axisPointer: {
          show: true,
          snap: true,
          lineStyle: { color: accent, width: 1.5 },
          label: { show: false }
        }
      },
      {
        // 상단 아이콘 축: 데이터 좌표계를 공유해 아이콘이 라인 x좌표와 정확히 정렬된다(2시간 간격).
        type: 'category',
        position: 'top',
        data: props.hours.map((_, index) => index),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisPointer: { show: false },
        axisLabel: {
          fontSize: 14,
          margin: 4,
          interval: (index: number) => hourOf(index) % 2 === 0,
          // 빈 슬롯(symbolName 없음)엔 아이콘을 그리지 않는다(가짜 🌤️ 방지).
          formatter: (_: string, index: number) =>
            props.hours[index].symbolName ? weatherSymbolToEmoji(props.hours[index].symbolName) : ''
        }
      }
    ],
    yAxis: {
      type: 'value',
      // 라인 시작(좌측)이 온도축에 가려지지 않도록 눈금 라벨을 우측에 노출.
      position: 'right',
      min: yMin,
      max: yMax,
      interval: 3,
      splitLine: { lineStyle: { color: subtle } },
      axisLabel: { color: muted, fontWeight: 700, fontSize: 12, formatter: (value: number) => `${value}°` }
    },
    series: [
      // 체감 탭일 때 실제 온도선을 흐리게 함께 그려 체감과 비교되게 한다(뒤에 깔림).
      ...(props.tempMode === 'feel'
        ? [
            {
              type: 'line' as const,
              data: actualTemps.value,
              smooth: true,
              symbol: 'none' as const,
              silent: true,
              lineStyle: { width: 1.5, color: muted, opacity: 0.5 },
              emphasis: { disabled: true }
            }
          ]
        : []),
      {
        // 지난 시간: 점선 + muted (오늘이 아닐 땐 빈 시리즈)
        type: 'line',
        data: pastData,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.5, color: muted, type: 'dashed' },
        emphasis: { disabled: true }
      },
      {
        // 앞으로: 실선 + 현재 위치 '지금' 세로 라인
        type: 'line',
        data: futureData,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: primary },
        areaStyle: { opacity: 0.08, color: primary },
        emphasis: { disabled: true },
        // 최고/최저 지점 라벨(애플 날씨식) — 표시 중인 지표의 하루 최고·최저.
        markPoint:
          maxPoint && minPoint
            ? {
                silent: true,
                symbol: 'circle',
                symbolSize: 5,
                itemStyle: { color: primary },
                label: { color: muted, fontSize: 11, fontWeight: 700, position: 'top', formatter: (p: { name?: string }) => p.name ?? '' },
                data: [
                  { name: '최고', coord: [maxPoint.index, maxPoint.value] },
                  { name: '최저', coord: [minPoint.index, minPoint.value] }
                ]
              }
            : undefined,
        markLine:
          boundary >= 0
            ? {
                silent: true,
                symbol: 'none',
                data: [{ xAxis: boundary }],
                // 텍스트 라벨은 상단 아이콘 축과 겹쳐 뺐다 — 위 상세 패널의 '지금 · N시'가 의미를 전달한다.
                lineStyle: { color: accent, width: 1.5, type: 'solid', opacity: 0.9 },
                label: { show: false }
              }
            : undefined
      },
      // 현재 시각 흰 점(애플 날씨식) — 과거→미래 전환 지점.
      ...(boundary >= 0 && temps.value[boundary] != null
        ? [
            {
              type: 'scatter' as const,
              data: [[boundary, temps.value[boundary]] as [number, number]],
              symbol: 'circle' as const,
              symbolSize: 9,
              itemStyle: { color: '#ffffff', borderColor: primary, borderWidth: 2 },
              silent: true,
              z: 6
            }
          ]
        : [])
    ]
  }
  chart.setOption(option, true)
}
</script>

<template>
  <div class="weather-hourly">
    <!-- 스크럽 상세 패널: 차트 위 고정이라 손가락에 가려지지 않는다 -->
    <div v-if="detailHour" class="weather-hourly-detail" :class="{ scrubbing: isScrubbing }" aria-live="polite">
      <span class="weather-hourly-icon" aria-hidden="true">{{ weatherSymbolToEmoji(detailHour.symbolName) }}</span>
      <div class="weather-hourly-main">
        <strong>{{ detailTitle }} · {{ detailHour.condition }}</strong>
        <span>
          실제 {{ formatWeatherNumber(detailHour.temperatureC, '°') }} · 체감 {{ formatWeatherNumber(detailHour.apparentTemperatureC, '°') }}
        </span>
      </div>
      <div class="weather-hourly-side">
        <span>💧 {{ Math.round((detailHour.precipitationChance ?? 0) * 100) }}% · {{ formatRainAmount(detailHour.precipitationAmountMm ?? 0) }}</span>
        <span v-if="detailHour.humidity !== null && detailHour.humidity !== undefined">습도 {{ Math.round(detailHour.humidity * 100) }}%</span>
      </div>
    </div>
    <div ref="chartRef" class="weather-hourly-chart" data-no-swipe role="img" aria-label="시간대별 날씨 차트" />
  </div>
</template>

<style scoped>
.weather-hourly-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: 12px;
  background: var(--color-surface-2);
  border: 1px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.weather-hourly-detail.scrubbing {
  border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-2));
}
.weather-hourly-icon {
  font-size: 24px;
  line-height: 1;
}
.weather-hourly-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.weather-hourly-main strong {
  font-size: var(--text-caption-size);
  color: var(--color-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.weather-hourly-main span {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}
.weather-hourly-side {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
  flex-shrink: 0;
}
.weather-hourly-side span {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}
.weather-hourly-chart {
  height: 190px;
  /* 세로 스크롤은 페이지에 넘기고, 가로 드래그만 차트 스크럽으로 쓴다(터치). */
  touch-action: pan-y;
}
</style>

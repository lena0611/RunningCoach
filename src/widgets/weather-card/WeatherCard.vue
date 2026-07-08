<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useWeatherStore } from '@/app/stores/weatherStore'
import type { WeatherHourlyPoint, WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import { formatRainAmount, formatWeatherNumber, weatherSymbolToEmoji } from '@/shared/lib/weather'
import { getOutfitRecommendation, getRunningSafety, type DerivedHour } from '@/shared/lib/runningWeather'
import { getSunTimes } from '@/shared/lib/sunTimes'
import EmptyState from '@/shared/ui/EmptyState.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import SegmentTabs, { type SegmentTabValue } from '@/shared/ui/SegmentTabs.vue'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const props = defineProps<{
  snapshot: WeatherSnapshot | null
  loading?: boolean
  error?: string
  targetDate?: string
  sessionTitle?: string
}>()

const emit = defineEmits<{ refresh: [] }>()

const weatherStore = useWeatherStore()

const tempMode = ref<'actual' | 'feel'>('feel')
const selectedDate = ref<string>('')

const todayText = computed(() => formatLocalDate(new Date()))
const availableDates = computed(() => props.snapshot?.daily.map((day) => day.date) ?? [])
const targetOutOfRange = computed(
  () => Boolean(props.targetDate) && props.targetDate !== todayText.value && availableDates.value.length > 0 && !availableDates.value.includes(props.targetDate as string)
)

// 스냅샷/타겟이 바뀌면 선택 날짜를 범위 안으로 맞춘다.
watch(
  () => [props.snapshot, props.targetDate] as const,
  () => {
    const dates = availableDates.value
    if (props.targetDate && dates.includes(props.targetDate)) selectedDate.value = props.targetDate
    else selectedDate.value = dates[0] ?? todayText.value
  },
  { immediate: true }
)

const isSelectedToday = computed(() => selectedDate.value === todayText.value)

// 선택한 날 전체 시간(최대 24h). 안전등급·강수 계산용 풀 해상도.
const dayHours = computed<WeatherHourlyPoint[]>(() =>
  (props.snapshot?.hourly ?? []).filter((hour) => hour.time.slice(0, 10) === selectedDate.value).slice(0, 24)
)

// 타임라인 표시는 3시간 간격으로 듬성하게(시간별은 빡빡함).
const displayHours = computed<WeatherHourlyPoint[]>(() =>
  dayHours.value.filter((hour) => new Date(hour.time).getHours() % 3 === 0)
)

// "오전 6시" 식 라벨.
function formatHourLabel(time: string) {
  const h = new Date(time).getHours()
  const period = h < 12 ? '오전' : '오후'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${period} ${display}시`
}

// 요청(현재) 시각. 이 이전 시간은 타임라인에서 흐리게 표시한다.
const requestTime = computed(() => {
  const parsed = props.snapshot?.observedAt ? Date.parse(props.snapshot.observedAt) : Date.now()
  return Number.isFinite(parsed) ? parsed : Date.now()
})
function isPastHour(hour: WeatherHourlyPoint) {
  return Date.parse(hour.time) < requestTime.value
}
// 과거가 끝나는 경계(첫 미래 표시시간)의 라벨 — 차트 과거 음영 기준.
const dimBeforeLabel = computed(() => {
  const firstFuture = displayHours.value.find((hour) => !isPastHour(hour))
  if (!firstFuture || displayHours.value[0] === firstFuture) return undefined
  return formatHourLabel(firstFuture.time)
})

// 선택 시점의 대표 현재값: 오늘이면 실황, 미래면 그 날 오전 시간대 예보.
type RepCurrent = DerivedHour & { symbolName: string }
const repCurrent = computed<RepCurrent | null>(() => {
  if (!props.snapshot) return null
  if (isSelectedToday.value) {
    const c = props.snapshot.current
    return {
      temperatureC: c.temperatureC,
      apparentTemperatureC: c.apparentTemperatureC,
      humidity: c.humidity,
      windMps: c.windMps,
      precipitationChance: null,
      precipitationAmountMm: null,
      symbolName: c.symbolName
    }
  }
  const hours = props.snapshot.hourly.filter((hour) => hour.time.slice(0, 10) === selectedDate.value)
  const morning = hours.find((hour) => new Date(hour.time).getHours() >= 7) ?? hours[0]
  if (!morning) return null
  return {
    temperatureC: morning.temperatureC,
    apparentTemperatureC: morning.apparentTemperatureC,
    humidity: morning.humidity ?? null,
    windMps: null,
    precipitationChance: morning.precipitationChance,
    precipitationAmountMm: morning.precipitationAmountMm,
    symbolName: morning.symbolName
  }
})

// 안전등급·강수 요약은 앞으로의 시간만 본다(과거는 표시용으로만 dim 처리).
const forwardHours = computed(() => dayHours.value.filter((hour) => !isPastHour(hour)))

const safety = computed(() =>
  getRunningSafety(
    repCurrent.value,
    forwardHours.value.map((hour) => ({
      temperatureC: hour.temperatureC,
      apparentTemperatureC: hour.apparentTemperatureC,
      humidity: hour.humidity ?? null,
      windMps: null,
      precipitationChance: hour.precipitationChance,
      precipitationAmountMm: hour.precipitationAmountMm
    }))
  )
)

const rainAmount = computed(() => forwardHours.value.reduce((sum, hour) => sum + (hour.precipitationAmountMm ?? 0), 0))
const maxRainChance = computed(() => Math.max(0, ...forwardHours.value.map((hour) => hour.precipitationChance ?? 0)))

const outfit = computed(() => {
  const felt = repCurrent.value?.apparentTemperatureC ?? repCurrent.value?.temperatureC ?? null
  return getOutfitRecommendation(felt, { rain: maxRainChance.value >= 0.5, windy: (repCurrent.value?.windMps ?? 0) >= 7 })
})

const tempPoints = computed<TrendChartPoint[]>(() =>
  displayHours.value.map((hour) => ({
    label: formatHourLabel(hour.time),
    value: Math.round((tempMode.value === 'feel' ? hour.apparentTemperatureC ?? hour.temperatureC : hour.temperatureC) ?? 0),
    detail: hour.condition
  }))
)

const sun = computed(() => {
  const coords = weatherStore.coords
  if (!coords || !selectedDate.value) return null
  const anchor = new Date(`${selectedDate.value}T12:00:00`)
  if (!Number.isFinite(anchor.getTime())) return null
  return getSunTimes(anchor, coords.lat, coords.lon)
})

function formatLocalDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
}
function formatDayChip(date: string) {
  if (date === todayText.value) return '오늘'
  const d = new Date(`${date}T00:00:00`)
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
}
function formatClock(date: Date | null) {
  if (!date) return '-'
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="weather-card" :class="`weather-card-${safety.level}`">
    <SectionHeader title="러닝 날씨">
      <button class="ghost weather-refresh-button" type="button" :disabled="loading" :aria-label="loading ? '날씨 확인 중' : '날씨 새로고침'" @click="emit('refresh')">
        <svg viewBox="0 0 24 24" aria-hidden="true" :class="{ spinning: loading }">
          <path d="M20 11a8 8 0 0 0-14.8-4.2L3 9" />
          <path d="M3 4v5h5" />
          <path d="M4 13a8 8 0 0 0 14.8 4.2L21 15" />
          <path d="M21 20v-5h-5" />
        </svg>
      </button>
    </SectionHeader>

    <!-- 위치 소스 전환 -->
    <div class="weather-controls">
      <SegmentTabs
        variant="pill"
        tone="ok"
        aria-label="위치 선택"
        :items="[
          { value: 'current', label: '현위치' },
          { value: 'last-run', label: '마지막 러닝', disabled: !weatherStore.hasLastRunLocation }
        ]"
        :active="weatherStore.locationSource"
        @change="weatherStore.setLocationSource($event as 'current' | 'last-run')"
      />
      <span v-if="weatherStore.locationName" class="weather-location">📍 {{ weatherStore.locationName }}</span>
    </div>

    <!-- 시점(날짜) 전환: 이미 받은 3일 예보 안에서 -->
    <SegmentTabs
      v-if="snapshot && availableDates.length"
      class="weather-days"
      variant="chips"
      tone="accent"
      aria-label="예보 날짜 선택"
      :items="availableDates.map((date) => ({ value: date, label: formatDayChip(date) }))"
      :active="selectedDate"
      @change="selectedDate = $event as string"
    />
    <p class="weather-target">{{ selectedDate }} · {{ sessionTitle || '러닝 준비' }}</p>

    <p v-if="targetOutOfRange" class="helper weather-range-note">
      추천 세션일({{ targetDate }})은 기상청 단기예보 범위(약 3일)를 벗어나 표시할 수 없습니다. 3일 이내 예보만 제공합니다.
    </p>

    <div v-if="repCurrent" class="weather-current">
      <div>
        <strong class="weather-value-inline">
          <span class="weather-symbol">{{ weatherSymbolToEmoji(repCurrent.symbolName) }}</span>
          <UnitValue :value="formatWeatherNumber(repCurrent.temperatureC, '°')" />
        </strong>
        <small>실제 온도</small>
      </div>
      <div>
        <strong><UnitValue :value="formatWeatherNumber(repCurrent.apparentTemperatureC, '°')" /></strong>
        <small>체감 온도</small>
      </div>
      <div>
        <strong><UnitValue :amount="Math.round(maxRainChance * 100)" unit="%" /></strong>
        <small>최대 강수확률</small>
      </div>
      <div>
        <strong><UnitValue :value="formatRainAmount(rainAmount)" /></strong>
        <small>{{ isSelectedToday ? '향후 12시간' : '하루' }}</small>
      </div>
    </div>

    <div v-if="snapshot" class="weather-advice">
      <span>{{ safety.title }}</span>
      <p>{{ safety.summary }}</p>
      <ul>
        <li v-for="item in safety.bullets" :key="item">{{ item }}</li>
      </ul>
    </div>

    <!-- 복장 추천 -->
    <div v-if="outfit" class="weather-outfit">
      <strong>👕 복장 추천 · {{ outfit.label }}</strong>
      <p>{{ outfit.top }} / {{ outfit.bottom }}</p>
      <p v-if="outfit.accessories.length" class="helper">{{ outfit.accessories.join(' · ') }}</p>
      <p class="helper">{{ outfit.note }}</p>
    </div>

    <!-- 시간대별 + 실제/체감 토글 -->
    <div v-if="snapshot && tempPoints.length" class="weather-chart-card">
      <SegmentTabs
        class="weather-temp-toggle"
        variant="group"
        tone="accent"
        aria-label="온도 표시"
        :items="[
          { value: 'actual', label: '실제 온도' },
          { value: 'feel', label: '체감 온도' }
        ]"
        :active="tempMode"
        @change="tempMode = $event as 'actual' | 'feel'"
      />
      <div class="weather-hour-icons">
        <span v-for="hour in displayHours" :key="hour.time" :class="{ 'is-past': isPastHour(hour) }">{{ weatherSymbolToEmoji(hour.symbolName) }}</span>
      </div>
      <TrendChart :points="tempPoints" unit="°" variant="line" :dim-before-label="dimBeforeLabel" />
      <p v-if="sun" class="helper weather-sun">🌅 일출 {{ formatClock(sun.sunrise) }} · 🌇 일몰 {{ formatClock(sun.sunset) }}</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <EmptyState
      v-if="!snapshot && !loading"
      title="날씨 연결 전입니다."
      description="위치를 허용하면 기상청 단기예보로 체감온도·복장·강수 시간을 홈에서 같이 봅니다."
    />
  </div>
</template>

<style scoped>
.weather-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 4px 0 8px;
}
.weather-location {
  font-size: 12px;
  color: var(--color-muted-2);
}
.weather-current small {
  font-size: var(--text-caption-size);
}
.weather-days {
  margin-bottom: 6px;
}
.weather-range-note {
  color: var(--warning, #c97a00);
}
.weather-outfit {
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-soft, rgba(120, 120, 130, 0.08));
}
.weather-outfit strong {
  font-size: var(--text-caption-size);
}
.weather-outfit p {
  margin: 2px 0 0;
  font-size: var(--text-caption-size);
}
.weather-temp-toggle {
  margin-bottom: 8px;
}
.weather-sun {
  margin-top: 6px;
}
.weather-hour-icons span.is-past {
  opacity: 0.32;
}
</style>

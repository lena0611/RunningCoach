<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import { formatRainAmount, formatWeatherNumber, getRainWindowText, getRunningWeatherAdvice, getUpcomingHours, weatherSymbolToEmoji } from '@/shared/lib/weather'
import EmptyState from '@/shared/ui/EmptyState.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const props = defineProps<{
  snapshot: WeatherSnapshot | null
  loading?: boolean
  error?: string
  targetDate?: string
  sessionTitle?: string
}>()

const emit = defineEmits<{ refresh: [] }>()

const advice = computed(() => getRunningWeatherAdvice(props.snapshot))
const todayText = computed(() => formatLocalDate(new Date()))
const targetDate = computed(() => props.targetDate || todayText.value)
const targetDaily = computed(() => props.snapshot?.daily.find((day) => day.date === targetDate.value) ?? null)
const isTargetToday = computed(() => targetDate.value === todayText.value)
const hourly = computed(() => {
  const source = props.snapshot?.hourly ?? []
  if (isTargetToday.value) return getUpcomingHours(source, 12)
  return source.filter((hour) => hour.time.slice(0, 10) === targetDate.value).slice(0, 12)
})
const tempPoints = computed<TrendChartPoint[]>(() =>
  hourly.value.map((hour) => ({
    label: new Date(hour.time).getHours().toString().padStart(2, '0'),
    value: Math.round(hour.apparentTemperatureC ?? hour.temperatureC ?? 0),
    detail: hour.condition
  }))
)
const rainAmount = computed(() => hourly.value.reduce((sum, hour) => sum + (hour.precipitationAmountMm ?? 0), 0))
const maxRainChance = computed(() => Math.max(0, ...hourly.value.map((hour) => hour.precipitationChance ?? 0)))

function formatLocalDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-')
}
</script>

<template>
  <div class="weather-card" :class="`weather-card-${advice.level}`">
    <SectionHeader title="다음 세션 기상">
      <button class="ghost compact-action" type="button" :disabled="loading" @click="emit('refresh')">
        {{ loading ? '확인 중' : '새로고침' }}
      </button>
    </SectionHeader>
    <p class="weather-target">{{ targetDate }} · {{ sessionTitle || '다음 추천 세션' }}</p>

    <div v-if="snapshot && (!targetDaily || isTargetToday)" class="weather-current">
      <div>
        <span class="weather-symbol">{{ weatherSymbolToEmoji(snapshot.current.symbolName) }}</span>
        <strong>{{ formatWeatherNumber(snapshot.current.temperatureC, '°') }}</strong>
        <small>실제 온도</small>
      </div>
      <div>
        <strong>{{ formatWeatherNumber(snapshot.current.apparentTemperatureC, '°') }}</strong>
        <small>체감 온도</small>
      </div>
      <div>
        <strong>{{ Math.round(maxRainChance * 100) }}%</strong>
        <small>최대 강수확률</small>
      </div>
      <div>
        <strong>{{ formatRainAmount(rainAmount) }}</strong>
        <small>향후 12시간</small>
      </div>
    </div>

    <div v-if="snapshot && targetDaily && !isTargetToday" class="weather-current">
      <div>
        <span class="weather-symbol">{{ weatherSymbolToEmoji(targetDaily.symbolName) }}</span>
        <strong>{{ formatWeatherNumber(targetDaily.maxTemperatureC, '°') }}</strong>
        <small>최고 온도</small>
      </div>
      <div>
        <strong>{{ formatWeatherNumber(targetDaily.minTemperatureC, '°') }}</strong>
        <small>최저 온도</small>
      </div>
      <div>
        <strong>{{ Math.round((targetDaily.precipitationChance ?? 0) * 100) }}%</strong>
        <small>강수확률</small>
      </div>
      <div>
        <strong>{{ formatRainAmount(targetDaily.precipitationAmountMm) }}</strong>
        <small>예상 강수량</small>
      </div>
    </div>

    <div v-if="snapshot" class="weather-advice">
      <span>{{ advice.title }}</span>
      <p>{{ advice.summary }}</p>
      <ul>
        <li v-for="item in advice.bullets" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="snapshot && tempPoints.length" class="weather-chart-card">
      <div class="weather-hour-icons">
        <span v-for="hour in hourly" :key="hour.time">{{ weatherSymbolToEmoji(hour.symbolName) }}</span>
      </div>
      <TrendChart :points="tempPoints" unit="°" />
      <p class="helper">{{ isTargetToday ? getRainWindowText(snapshot.hourly) : `${targetDate} 시간대별 예보` }}</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <EmptyState
      v-if="!snapshot && !loading"
      title="기상정보 연결 전입니다."
      description="위치 권한을 허용하면 무료 Open-Meteo 예보로 체감온도와 강수 시간을 홈에서 같이 봅니다."
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import FatigueCard from '@/widgets/fatigue-card/FatigueCard.vue'
import WeatherCard from '@/widgets/weather-card/WeatherCard.vue'
import { getEasyRatio, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday } from '@/shared/lib/format'
import ContentStack from '@/shared/ui/ContentStack.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const weatherStore = useWeatherStore()
const router = useRouter()
const trendMetric = ref<'month' | 'last7' | 'easy' | 'hard' | null>(null)
const todayDate = computed(() => formatDateOnly(new Date()))

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
  if (!memoryStore.loading) {
    memoryStore.load()
  }
  weatherStore.init()
  void weatherStore.refreshAfterActivation()
})

const runs = computed(() => runStore.sortedRuns)
const weekDistance = computed(() => sumDistance(getThisWeekRuns(runs.value)))
const monthDistance = computed(() => sumDistance(getThisMonthRuns(runs.value)))
const last7 = computed(() => sumDistance(getRunsWithinDays(runs.value, 7)))
const last14 = computed(() => sumDistance(getRunsWithinDays(runs.value, 14)))
const easyRatio = computed(() => getEasyRatio(getRunsWithinDays(runs.value, 30)))
const nextSession = computed(() => getNextSessionRecommendation(memoryStore.memory, runs.value))
const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
const hardSessions = computed(() =>
  getRunsWithinDays(runs.value, 7).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type)).length
)
const isNextSessionToday = computed(() => nextSession.value.plannedDate === todayDate.value)
const heroEyebrow = computed(() => (isNextSessionToday.value ? '오늘 예정 훈련' : '다음 예정 훈련'))
const heroTitle = computed(() =>
  isNextSessionToday.value
    ? `오늘은 ${nextSession.value.title} 예정일입니다.`
    : `${formatDateWithWeekday(nextSession.value.plannedDate)} ${nextSession.value.title} 준비입니다.`
)
const heroHelper = computed(() => `주간 루틴 기준 · 오늘 ${formatDateWithWeekday(todayDate.value)} · 이번 주 ${weekDistance.value}km 누적`)

const trendTitle = computed(() => {
  if (trendMetric.value === 'month') return '이번 달 거리 추이'
  if (trendMetric.value === 'last7') return '최근 7일 거리 추이'
  if (trendMetric.value === 'easy') return '최근 30일 Easy 비율 근거'
  if (trendMetric.value === 'hard') return '최근 7일 강훈련'
  return ''
})

const trendRuns = computed(() => {
  if (trendMetric.value === 'month') return getThisMonthRuns(runs.value)
  if (trendMetric.value === 'last7') return getRunsWithinDays(runs.value, 7)
  if (trendMetric.value === 'easy') return getRunsWithinDays(runs.value, 30)
  if (trendMetric.value === 'hard') return getRunsWithinDays(runs.value, 7).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type))
  return []
})

const trendChartPoints = computed<TrendChartPoint[]>(() => {
  return [...trendRuns.value]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((run) => ({
      label: run.date.slice(5).replace('-', '.'),
      value: run.distanceKm,
      detail: run.sessionTitle || run.type
    }))
})

watch(
  () => Boolean(trendMetric.value),
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
})

onBeforeRouteLeave(() => {
  closeTrend()
})

function closeTrend() {
  trendMetric.value = null
}

function openRunDetail(run: { id: string }) {
  router.push({ path: '/runs', query: { runId: run.id } })
}

function formatDateOnly(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-')
}
</script>

<template>
  <PageLayout variant="dashboard">
    <section class="hero-card">
      <div>
        <p class="eyebrow">{{ heroEyebrow }}</p>
        <h2>{{ heroTitle }}</h2>
        <p class="helper">{{ heroHelper }}</p>
      </div>
      <div class="hero-metric">
        <span>이번 주 누적</span>
        <strong><UnitValue :amount="weekDistance" unit="km" /></strong>
      </div>
    </section>

    <section class="context-strip">
      <div>
        <span>활성 목표</span>
        <strong>{{ activeGoal.title }}</strong>
        <small>{{ activeGoal.targetDate ? `${formatDateWithWeekday(activeGoal.targetDate)}까지` : '목표일 미정' }}</small>
      </div>
      <div>
        <span>부상 기준</span>
        <strong>{{ activeInjury?.title || '관리 항목 없음' }}</strong>
        <small>{{ activeInjury ? `${activeInjury.status}${activeInjury.severity ? ` · ${activeInjury.severity}/5` : ''}` : '코칭 제한 없음' }}</small>
      </div>
    </section>

    <SectionCard v-if="runStore.loading || runStore.error">
      <SectionHeader title="데이터 상태">
        <button class="ghost" type="button" :disabled="runStore.loading" @click="runStore.load">
          {{ runStore.loading ? '불러오는 중' : '다시 불러오기' }}
        </button>
      </SectionHeader>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <p v-if="runStore.error" class="error">{{ runStore.error }}</p>
    </SectionCard>

    <MetricGrid>
      <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" interactive @click="trendMetric = 'month'" />
      <RunSummaryCard label="최근 7일" :value="`${last7}km`" interactive @click="trendMetric = 'last7'" />
      <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" interactive @click="trendMetric = 'easy'" />
      <RunSummaryCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" interactive @click="trendMetric = 'hard'" />
    </MetricGrid>

    <div class="two-column">
      <RecentRuns :runs="runs.slice(0, 5)" @show-all="router.push('/runs')" @select="openRunDetail" />
      <ContentStack>
        <FatigueCard :warning="getVolumeWarning(runs)" />
        <SectionCard>
          <SectionHeader title="다음 추천 세션" />
          <div class="recommendation-card">
            <strong>{{ nextSession.title }}</strong>
            <span>{{ formatDateWithWeekday(nextSession.plannedDate) }} · {{ nextSession.dayName }}</span>
          </div>
          <p>{{ nextSession.reason }}</p>
          <p class="helper">{{ nextSession.intensity }}</p>
          <WeatherCard
            :snapshot="weatherStore.snapshot"
            :loading="weatherStore.loading"
            :error="weatherStore.error"
            :target-date="nextSession.plannedDate"
            :session-title="nextSession.title"
            @refresh="weatherStore.requestForecast()"
          />
        </SectionCard>
      </ContentStack>
    </div>

    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="trendMetric" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>{{ trendTitle }}</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeTrend">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <SectionCard>
                <SectionHeader title="추이">
                  <small class="helper">{{ trendRuns.length }}개 세션</small>
                </SectionHeader>
                <TrendChart v-if="trendChartPoints.length" :points="trendChartPoints" unit="km" />
                <EmptyState v-else title="표시할 기록이 없습니다." description="해당 기간의 러닝 기록이 아직 부족합니다." />
              </SectionCard>
              <SectionCard v-if="trendRuns.length">
                <SectionHeader title="세션" />
                <RunSessionList :runs="trendRuns" />
              </SectionCard>
            </main>
          </section>
        </div>
      </Transition>
    </Teleport>
  </PageLayout>
</template>

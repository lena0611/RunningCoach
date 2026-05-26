<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import type { RunLog } from '@/entities/run/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import FatigueCard from '@/widgets/fatigue-card/FatigueCard.vue'
import WeatherCard from '@/widgets/weather-card/WeatherCard.vue'
import { estimateHeartRateDrift, getEasyRatio, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import ContentStack from '@/shared/ui/ContentStack.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))
const FitnessDetailCharts = defineAsyncComponent(() => import('@/shared/ui/FitnessDetailCharts.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const weatherStore = useWeatherStore()
const router = useRouter()
const trendMetric = ref<'month' | 'last7' | 'easy' | 'hard' | null>(null)
const detailRun = ref<RunLog | null>(null)
const projectionDetailOpen = ref(false)
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
const raceProjection = computed(() => getRaceProjection(runs.value, activeGoal.value))
const raceProjectionHint = computed(() => {
  const projection = raceProjection.value
  if (!projection) return ''
  if (projection.deltaSec === null) return `${formatDateWithWeekday(projection.current.date)} 기준`
  if (projection.deltaSec < 0) return `이전 대비 ${formatDuration(Math.abs(projection.deltaSec))} 단축`
  if (projection.deltaSec > 0) return `이전 대비 ${formatDuration(projection.deltaSec)} 느림`
  return '이전과 동일'
})
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
  () => Boolean(trendMetric.value || detailRun.value || projectionDetailOpen.value),
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
})

onBeforeRouteLeave(() => {
  closeTrend()
  closeRunDetail()
  closeProjectionDetail()
})

function closeTrend() {
  trendMetric.value = null
}

function openRunDetail(run: RunLog) {
  detailRun.value = run
}

function closeRunDetail() {
  detailRun.value = null
}

function openProjectionDetail() {
  projectionDetailOpen.value = true
}

function closeProjectionDetail() {
  projectionDetailOpen.value = false
}

function openCoachForRun(run: RunLog) {
  router.push({ path: '/runs', query: { runId: run.id, coach: '1' } })
}

function openMemoryPanel(panel: 'goals' | 'injuries') {
  router.push({ path: '/memory', query: { panel } })
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
      <button class="stat-card stat-card-interactive dashboard-context-card" type="button" @click="openMemoryPanel('goals')">
        <span class="stat-card-label">활성 목표</span>
        <div class="stat-card-data">
          <strong>{{ activeGoal.title }}</strong>
          <small>{{ activeGoal.targetDate ? `${formatDateWithWeekday(activeGoal.targetDate)}까지` : '목표일 미정' }}</small>
        </div>
        <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <button class="stat-card stat-card-interactive dashboard-context-card" type="button" @click="openMemoryPanel('injuries')">
        <span class="stat-card-label">부상 기준</span>
        <div class="stat-card-data">
          <strong>{{ activeInjury?.title || '관리 항목 없음' }}</strong>
          <small>{{ activeInjury ? `${activeInjury.status}${activeInjury.severity ? ` · ${activeInjury.severity}/5` : ''}` : '코칭 제한 없음' }}</small>
        </div>
        <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <button v-if="raceProjection" class="stat-card stat-card-interactive dashboard-context-card dashboard-projection-card" type="button" @click="openProjectionDetail">
        <span class="stat-card-label">목표 예상</span>
        <div class="stat-card-data">
          <strong>{{ formatDuration(raceProjection.current.projectedSec) }}</strong>
          <small>{{ raceProjectionHint }}</small>
        </div>
        <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
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

      <Transition name="stack-page">
        <div v-if="projectionDetailOpen && raceProjection" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>목표 예상</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeProjectionDetail">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <SectionCard>
                <SectionHeader title="현재 예상" />
                <div class="projection-detail-metric">
                  <strong>{{ formatDuration(raceProjection.current.projectedSec) }}</strong>
                  <span>{{ raceProjection.targetDistanceKm }}km 기준</span>
                </div>
                <p class="helper">
                  {{ formatDateWithWeekday(raceProjection.current.date) }} {{ raceProjection.current.type }}
                  {{ raceProjection.current.distanceKm.toFixed(2) }}km 기록을 목표 거리로 환산한 값입니다.
                </p>
              </SectionCard>
              <SectionCard>
                <SectionHeader title="변화" />
                <p v-if="raceProjection.deltaSec === null" class="helper">
                  아직 비교할 이전 품질 세션이 부족합니다. Tempo, Race, Steady Long 기록이 쌓이면 변화 방향을 보여줍니다.
                </p>
                <p v-else class="helper">
                  {{ raceProjectionHint }}입니다. 이 값은 루틴 상향/유지 판단의 보조 근거로만 사용합니다.
                </p>
              </SectionCard>
            </main>
          </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="detailRun" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>세션 상세</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeRunDetail">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content run-detail-content">
              <SectionCard class="run-detail-hero">
                <div class="run-detail-topline">
                  <span class="list-row-kicker">{{ formatDateWithWeekday(detailRun.date) }}</span>
                </div>
                <div class="run-detail-identity">
                  <RunTypeIcon :type="detailRun.type" size="large" />
                  <div>
                    <h2>{{ detailRun.sessionTitle || detailRun.type }}</h2>
                    <RunTypeBadge :type="detailRun.type" />
                  </div>
                </div>
                <div class="run-detail-metrics">
                  <strong><UnitValue :amount="detailRun.distanceKm" unit="km" /></strong>
                  <span>{{ formatDuration(detailRun.durationSec) }}</span>
                  <span><UnitValue :amount="formatPace(detailRun.avgPaceSec)" unit="/km" /></span>
                </div>
              </SectionCard>
              <SectionCard>
                <div class="metric-grid compact-metric-grid">
                  <div class="metric"><span>평균 페이스</span><strong><UnitValue :amount="formatPace(detailRun.avgPaceSec)" unit="/km" /></strong></div>
                  <div class="metric"><span>평균 케이던스</span><strong>{{ formatInteger(detailRun.cadence) }}</strong></div>
                  <div class="metric"><span>평균 심박</span><strong>{{ formatInteger(detailRun.avgHeartRate) }}</strong></div>
                  <div class="metric"><span>최고 심박</span><strong>{{ formatInteger(detailRun.maxHeartRate) }}</strong></div>
                  <div class="metric"><span>운동강도</span><strong>{{ detailRun.rpe ?? '-' }}</strong></div>
                  <div class="metric"><span>드리프트</span><strong class="metric-text-value">{{ estimateHeartRateDrift(detailRun) }}</strong></div>
                </div>
              </SectionCard>
              <SectionCard v-if="detailRun.memo || detailRun.workoutFeeling || detailRun.painNote">
                <SectionHeader title="메모" />
                <p v-if="detailRun.memo">{{ detailRun.memo }}</p>
                <p v-if="detailRun.workoutFeeling" class="helper">느낌: {{ detailRun.workoutFeeling }}</p>
                <p v-if="detailRun.painNote" class="helper">통증/주의: {{ detailRun.painNote }}</p>
              </SectionCard>
              <FitnessDetailCharts
                v-if="(detailRun.metricSamples?.length ?? 0) || (detailRun.routePoints?.length ?? 0)"
                :run="detailRun"
              />
            </main>
            <footer class="stack-action-bar run-detail-cta">
              <button type="button" @click="openCoachForRun(detailRun)">
                AI 코칭 받기
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </PageLayout>
</template>

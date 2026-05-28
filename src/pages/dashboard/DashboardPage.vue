<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import type { RunLog } from '@/entities/run/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import FatigueCard from '@/widgets/fatigue-card/FatigueCard.vue'
import WeatherCard from '@/widgets/weather-card/WeatherCard.vue'
import { getEasyRatio, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration } from '@/shared/lib/format'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import ContentStack from '@/shared/ui/ContentStack.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunDetailContent from '@/shared/ui/RunDetailContent.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StatCard from '@/shared/ui/StatCard.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const healthKitSyncStore = useHealthKitSyncStore()
const weatherStore = useWeatherStore()
const router = useRouter()
const route = useRoute()
const trendMetric = ref<'month' | 'last7' | 'easy' | 'hard' | null>(null)
const detailRun = ref<RunLog | null>(null)
const projectionDetailOpen = ref(false)
const today = ref(new Date())
const todayDate = computed(() => formatDateOnly(today.value))

onMounted(() => {
  refreshDashboardContext()
  window.addEventListener('focus', refreshDashboardContext)
  window.addEventListener('pageshow', refreshDashboardContext)
  document.addEventListener('visibilitychange', refreshDashboardContextWhenVisible)
})

const runs = computed(() => runStore.sortedRuns)
const runDataLoading = computed(() => runStore.loading || (!runStore.loaded && !runStore.error))
const memoryDataLoading = computed(() => memoryStore.loading)
const weekDistance = computed(() => sumDistance(getThisWeekRuns(runs.value, today.value)))
const monthDistance = computed(() => sumDistance(getThisMonthRuns(runs.value, today.value)))
const last7 = computed(() => sumDistance(getRunsWithinDays(runs.value, 7, today.value)))
const last14 = computed(() => sumDistance(getRunsWithinDays(runs.value, 14, today.value)))
const easyRatio = computed(() => getEasyRatio(getRunsWithinDays(runs.value, 30, today.value)))
const nextSession = computed(() => getNextSessionRecommendation(memoryStore.memory, runs.value, today.value))
const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
const raceProjection = computed(() => getRaceProjection(runs.value, activeGoal.value, today.value, activeInjury.value))

watch(
  () => route.path,
  (path) => {
    if (path === '/') refreshDashboardContext()
  },
  { immediate: true }
)

function refreshDashboardContext() {
  today.value = new Date()
  if (!runStore.loaded && !runStore.loading) {
    void runStore.load()
  }
  if (!memoryStore.loading) {
    void memoryStore.load()
  }
  weatherStore.init()
  void weatherStore.refreshAfterActivation()
}

function refreshDashboardContextWhenVisible() {
  if (document.visibilityState === 'visible') refreshDashboardContext()
}
const raceProjectionHint = computed(() => {
  const projection = raceProjection.value
  if (!projection) return ''
  if (projection.readinessLevel) return `준비도 ${projection.readinessScore}점 · ${projection.readinessLevel}`
  if (projection.deltaSec === null) return `${formatDateWithWeekday(projection.current.date)} 기준`
  if (projection.deltaSec < 0) return `이전 대비 ${formatDuration(Math.abs(projection.deltaSec))} 단축`
  if (projection.deltaSec > 0) return `이전 대비 ${formatDuration(projection.deltaSec)} 느림`
  return '이전과 동일'
})
const hardSessions = computed(() =>
  getRunsWithinDays(runs.value, 7, today.value).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type)).length
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
  if (trendMetric.value === 'month') return getThisMonthRuns(runs.value, today.value)
  if (trendMetric.value === 'last7') return getRunsWithinDays(runs.value, 7, today.value)
  if (trendMetric.value === 'easy') return getRunsWithinDays(runs.value, 30, today.value)
  if (trendMetric.value === 'hard') return getRunsWithinDays(runs.value, 7, today.value).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type))
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
  window.removeEventListener('focus', refreshDashboardContext)
  window.removeEventListener('pageshow', refreshDashboardContext)
  document.removeEventListener('visibilitychange', refreshDashboardContextWhenVisible)
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

function openRunAction(run: RunLog, action: 'edit' | 'delete') {
  router.push({ path: '/runs', query: { runId: run.id, action } })
}

function canRefreshFromHealthKit(_run: RunLog) {
  return hasNativeBridge()
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

    <SectionGroup v-if="runStore.loading || runStore.error" title="데이터 상태">
      <template #actions>
        <button class="ghost" type="button" :disabled="runStore.loading" @click="runStore.load">
          {{ runStore.loading ? '불러오는 중' : '다시 불러오기' }}
        </button>
      </template>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <p v-if="runStore.error" class="error">{{ runStore.error }}</p>
    </SectionGroup>

    <MetricGrid>
      <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" :loading="runDataLoading" interactive @click="trendMetric = 'month'" />
      <RunSummaryCard label="최근 7일" :value="`${last7}km`" :loading="runDataLoading" interactive @click="trendMetric = 'last7'" />
      <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" :loading="runDataLoading" interactive @click="trendMetric = 'easy'" />
      <RunSummaryCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" :loading="runDataLoading" interactive @click="trendMetric = 'hard'" />
      <StatCard
        class="dashboard-context-card"
        label="부상 기준"
        :value="activeInjury?.title || '관리 항목 없음'"
        :hint="activeInjury ? `${activeInjury.status}${activeInjury.severity ? ` · ${activeInjury.severity}/5` : ''}` : '코칭 제한 없음'"
        value-kind="text"
        :loading="memoryDataLoading"
        interactive
        @click="openMemoryPanel('injuries')"
      />
      <StatCard
        v-if="runDataLoading || raceProjection"
        class="dashboard-context-card dashboard-projection-card dashboard-projection-card-wide"
        label="목표 예상"
        :value="raceProjection ? formatDuration(raceProjection.current.projectedSec) : ''"
        :hint="raceProjection ? `${activeGoal.title} · ${raceProjectionHint}` : ''"
        value-kind="text"
        :loading="runDataLoading"
        interactive
        @click="openProjectionDetail"
      />
    </MetricGrid>

    <div class="two-column">
      <RecentRuns :runs="runs.slice(0, 5)" :weekly-pattern="memoryStore.memory.weeklyPattern" @show-all="router.push('/runs')" @select="openRunDetail" />
      <ContentStack>
        <FatigueCard :warning="getVolumeWarning(runs, today)" />
        <SectionGroup title="다음 추천 세션" :surface="false">
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
        </SectionGroup>
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
              <SectionGroup title="추이">
                <template #actions>
                  <small class="helper">{{ trendRuns.length }}개 세션</small>
                </template>
                <TrendChart v-if="trendChartPoints.length" :points="trendChartPoints" unit="km" />
                <EmptyState v-else title="표시할 기록이 없습니다." description="해당 기간의 러닝 기록이 아직 부족합니다." />
              </SectionGroup>
              <SectionGroup v-if="trendRuns.length" title="세션" :surface="false">
                <RunSessionList :runs="trendRuns" :weekly-pattern="memoryStore.memory.weeklyPattern" interactive @select="openRunDetail" />
              </SectionGroup>
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
              <SectionGroup title="현재 예상">
                <div class="projection-detail-metric">
                  <strong>{{ formatDuration(raceProjection.current.projectedSec) }}</strong>
                  <span>{{ raceProjection.targetDistanceKm }}km 기준</span>
                </div>
                <p class="helper">
                  {{ formatDateWithWeekday(raceProjection.current.date) }} {{ raceProjection.current.type }}
                  {{ raceProjection.current.distanceKm.toFixed(2) }}km 기록을 목표 거리로 환산한 값입니다.
                </p>
              </SectionGroup>
              <SectionGroup title="목표 준비도">
                <div class="projection-score">
                  <strong>{{ raceProjection.readinessScore }}</strong>
                  <span>/100 · {{ raceProjection.readinessLevel }}</span>
                </div>
                <p class="helper">{{ raceProjection.readinessSummary }}</p>
              </SectionGroup>
              <SectionGroup title="판단 근거">
                <div class="projection-factor-list">
                  <article
                    v-for="factor in raceProjection.factors"
                    :key="factor.key"
                    class="projection-factor"
                    :class="`projection-factor-${factor.status}`"
                  >
                    <div>
                      <strong>{{ factor.label }}</strong>
                      <small>{{ factor.summary }}</small>
                    </div>
                    <span>{{ factor.score }}</span>
                    <p>{{ factor.detail }}</p>
                  </article>
                </div>
              </SectionGroup>
              <SectionGroup title="변화">
                <p v-if="raceProjection.deltaSec === null" class="helper">
                  아직 비교할 이전 품질 세션이 부족합니다. Tempo, Race, Steady Long 기록이 쌓이면 변화 방향을 보여줍니다.
                </p>
                <p v-else class="helper">
                  {{ raceProjectionHint }}입니다. 이 값은 루틴 상향/유지 판단의 보조 근거로만 사용합니다.
                </p>
              </SectionGroup>
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
            <RunDetailContent :run="detailRun" :weekly-pattern="memoryStore.memory.weeklyPattern">
              <template #actions>
                <div class="run-detail-actions" aria-label="세션 관리">
                  <button
                    v-if="canRefreshFromHealthKit(detailRun)"
                    class="icon-only-button"
                    :class="{ spinning: healthKitSyncStore.refreshingRunId === detailRun.id }"
                    type="button"
                    :disabled="healthKitSyncStore.refreshingRunId === detailRun.id"
                    aria-label="HealthKit 세션 다시 갱신"
                    @click.stop="healthKitSyncStore.requestRunRefresh(detailRun)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 11a8 8 0 0 0-14.8-4.2" />
                      <path d="M5 3v4h4" />
                      <path d="M4 13a8 8 0 0 0 14.8 4.2" />
                      <path d="M19 21v-4h-4" />
                    </svg>
                  </button>
                  <button class="icon-only-button" type="button" aria-label="기록 수정" @click.stop="openRunAction(detailRun, 'edit')">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
                      <path d="m13.6 6.2 4.2 4.2" />
                    </svg>
                  </button>
                  <button class="icon-only-button danger" type="button" aria-label="기록 삭제" @click.stop="openRunAction(detailRun, 'delete')">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5.5 7h13" />
                      <path d="M9.5 7V5.5h5V7" />
                      <path d="m8 9 .6 9.5h6.8L16 9" />
                      <path d="M10.5 11.5v4" />
                      <path d="M13.5 11.5v4" />
                    </svg>
                  </button>
                </div>
              </template>
            </RunDetailContent>
            <footer class="stack-action-bar run-detail-cta">
              <button type="button" @click.stop="openCoachForRun(detailRun)">
                AI 코칭 받기
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </PageLayout>
</template>

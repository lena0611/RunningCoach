<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import FatigueCard from '@/widgets/fatigue-card/FatigueCard.vue'
import { averagePace, getEasyRatio, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatPace } from '@/shared/lib/format'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

const runStore = useRunStore()
const memoryStore = useMemoryStore()

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
  if (!memoryStore.loading) {
    memoryStore.load()
  }
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
</script>

<template>
  <section class="page dashboard-page">
    <section class="hero-card">
      <div>
        <p class="eyebrow">훈련 요약</p>
        <h2>최근 기록과 주간 루틴으로 다음 훈련을 추천합니다.</h2>
      </div>
      <div class="hero-metric">
        <span>이번 주</span>
        <strong>{{ weekDistance }}km</strong>
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
      <div class="section-heading">
        <h2>데이터 상태</h2>
        <button class="ghost" type="button" :disabled="runStore.loading" @click="runStore.load">
          {{ runStore.loading ? '불러오는 중' : '다시 불러오기' }}
        </button>
      </div>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <p v-if="runStore.error" class="error">{{ runStore.error }}</p>
    </SectionCard>

    <MetricGrid>
      <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" />
      <RunSummaryCard label="최근 7일" :value="`${last7}km`" />
      <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" />
      <RunSummaryCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" />
    </MetricGrid>

    <div class="two-column">
      <RecentRuns :runs="runs.slice(0, 6)" />
      <div class="stack">
        <FatigueCard :warning="getVolumeWarning(runs)" />
        <SectionCard>
          <div class="section-heading">
            <h2>다음 추천 세션</h2>
          </div>
          <div class="recommendation-card">
            <strong>{{ nextSession.title }}</strong>
            <span>{{ formatPace(averagePace(runs)) }}/km 평균 흐름</span>
          </div>
          <p>{{ nextSession.reason }}</p>
          <p class="helper">{{ nextSession.intensity }}</p>
        </SectionCard>
      </div>
    </div>
  </section>
</template>

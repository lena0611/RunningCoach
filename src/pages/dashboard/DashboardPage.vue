<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import FatigueCard from '@/widgets/fatigue-card/FatigueCard.vue'
import { averagePace, getEasyRatio, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getVolumeWarning, sumDistance } from '@/shared/lib/runStats'
import { formatPace } from '@/shared/lib/format'

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
</script>

<template>
  <section class="page">
    <section v-if="runStore.loading || runStore.error" class="panel">
      <div class="section-heading">
        <h2>데이터 상태</h2>
        <button class="ghost" type="button" :disabled="runStore.loading" @click="runStore.load">
          {{ runStore.loading ? '불러오는 중' : '다시 불러오기' }}
        </button>
      </div>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <p v-if="runStore.error" class="error">{{ runStore.error }}</p>
    </section>
    <div class="metric-grid">
      <RunSummaryCard label="이번 주" :value="`${weekDistance}km`" />
      <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" />
      <RunSummaryCard label="최근 7일" :value="`${last7}km`" />
      <RunSummaryCard label="최근 14일" :value="`${last14}km`" />
      <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" />
      <RunSummaryCard label="평균 페이스" :value="formatPace(averagePace(runs))" />
    </div>
    <div class="two-column">
      <RecentRuns :runs="runs.slice(0, 6)" />
      <div class="stack">
        <FatigueCard :warning="getVolumeWarning(runs)" />
        <section class="panel">
          <div class="section-heading">
            <h2>다음 추천 세션</h2>
          </div>
          <strong>{{ nextSession.title }}</strong>
          <p>{{ nextSession.reason }}</p>
          <p class="helper">{{ nextSession.intensity }}</p>
        </section>
      </div>
    </div>
  </section>
</template>

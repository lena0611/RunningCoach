<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import {
  buildTrendLensResult,
  type TrendBaseline,
  type TrendLensKey,
  type TrendPeriod
} from '@/shared/lib/trendInsights'
import { formatDateWithWeekday } from '@/shared/lib/format'
import BottomSheetSelect, { type BottomSheetSelectOption } from '@/shared/ui/BottomSheetSelect.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import ListRow from '@/shared/ui/ListRow.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StatCard from '@/shared/ui/StatCard.vue'
import TrendLensChart from '@/shared/ui/TrendLensChart.vue'

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const router = useRouter()
const selectedLens = ref<TrendLensKey>('goal')
const selectedPeriod = ref<TrendPeriod>('90d')
const selectedBaseline = ref<TrendBaseline>('previous-period')

const lensOptions: Array<{ key: TrendLensKey; label: string; description: string }> = [
  { key: 'goal', label: '목표', description: '목표까지 가까워지는 축과 병목' },
  { key: 'efficiency', label: '효율', description: '같은 심박대에서 빨라지는 흐름' },
  { key: 'intensity', label: '강도', description: 'Easy 기반과 강훈련 밀도' },
  { key: 'quality', label: '품질', description: '세션 의도와 실제 수행 안정성' },
  { key: 'recovery', label: '회복', description: '좋은 훈련 뒤 남은 회복 비용' }
]

const periodOptions: BottomSheetSelectOption[] = [
  { value: '90d', label: '90일', description: '최근 흐름을 빠르게 확인' },
  { value: '180d', label: '6개월', description: '훈련 블록 단위 비교' },
  { value: '365d', label: '1년', description: '장기 발전/퇴보 확인' },
  { value: 'all', label: '전체', description: '누적 기록 전체 기준' }
]

const baselineOptions: BottomSheetSelectOption[] = [
  { value: 'previous-period', label: '이전 동일 기간', description: '최근 기간과 바로 직전 기간 비교' },
  { value: 'goal-start', label: '목표 시작 전', description: '활성 목표 시작 전 기록과 비교' },
  { value: 'first-run', label: '초기 기록', description: '초기 절반과 최근 절반 비교' }
]

const result = computed(() =>
  buildTrendLensResult({
    lens: selectedLens.value,
    period: selectedPeriod.value,
    baseline: selectedBaseline.value,
    runs: runStore.sortedRuns,
    memory: memoryStore.memory
  })
)

const evidenceRuns = computed(() =>
  result.value.evidenceRuns
    .flatMap((evidence) => {
      const run = runStore.runs.find((item) => item.id === evidence.runId)
      return run ? [{ ...evidence, run }] : []
    })
)

const heroToneLabel = computed(() => {
  const tone = result.value.hero.tone
  if (tone === 'good') return '좋은 신호'
  if (tone === 'warning') return '주의'
  if (tone === 'watch') return '관찰'
  return '데이터 확인'
})

const chartUnit = computed(() => {
  if (selectedLens.value === 'efficiency') return '초/km'
  if (selectedLens.value === 'intensity') return 'km'
  if (selectedLens.value === 'goal' || selectedLens.value === 'quality') return '점'
  return '점'
})

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    void runStore.load()
  }
  if (!memoryStore.loading) {
    void memoryStore.load()
  }
})

function selectLens(key: TrendLensKey) {
  selectedLens.value = key
}

function openRun(runId: string) {
  router.push({ path: '/runs', query: { runId } })
}

function isMetricValue(value: string) {
  return /^[+-]?[0-9.,]+/.test(value)
}
</script>

<template>
  <PageLayout>
    <section class="trends-page-header">
      <p class="eyebrow">추세</p>
      <h2>훈련 변화와 다음 처방</h2>
      <p class="helper">누적 기록에서 좋아진 축, 막힌 축, 다음 훈련 조정 신호를 봅니다.</p>
    </section>

    <section class="trend-lens-tabs" aria-label="추세 렌즈 선택">
      <button
        v-for="item in lensOptions"
        :key="item.key"
        type="button"
        class="trend-lens-tab"
        :class="{ 'trend-lens-tab-active': selectedLens === item.key }"
        @click="selectLens(item.key)"
      >
        <strong>{{ item.label }}</strong>
        <span>{{ item.description }}</span>
      </button>
    </section>

    <div class="trend-control-row">
      <BottomSheetSelect v-model="selectedPeriod" compact label="기간" :options="periodOptions" />
      <BottomSheetSelect v-model="selectedBaseline" compact label="비교" :options="baselineOptions" />
    </div>

    <SectionCard class="trend-hero-card" :class="`trend-hero-${result.hero.tone}`">
      <div>
        <span class="trend-hero-label">{{ heroToneLabel }}</span>
        <h3>{{ result.hero.value }}</h3>
        <strong>{{ result.hero.label }}</strong>
        <p>{{ result.hero.detail }}</p>
      </div>
      <span class="trend-confidence">{{ result.hero.confidence }}</span>
    </SectionCard>

    <MetricGrid v-if="result.cards.length">
      <StatCard
        v-for="card in result.cards"
        :key="card.id"
        :label="card.label"
        :value="`${card.value}${card.unit ?? ''}`"
        :hint="card.hint"
        :tone="card.tone === 'good' ? 'primary' : card.tone === 'warning' ? 'warning' : undefined"
        :value-kind="isMetricValue(card.value) ? 'metric' : 'text'"
      />
    </MetricGrid>

    <SectionGroup title="시각화" :surface="false">
      <TrendLensChart v-if="result.chart.length" :points="result.chart" :unit="chartUnit" />
      <EmptyState v-else title="표시할 추세가 없습니다." description="이 Lens에서 비교 가능한 기록이 아직 부족합니다." />
    </SectionGroup>

    <SectionGroup title="해석">
      <div class="trend-explanation-list">
        <p v-for="item in result.explanations" :key="item">{{ item }}</p>
      </div>
    </SectionGroup>

    <SectionGroup title="다음 처방 영향" :surface="false">
      <div class="trend-prescription-card" :class="`trend-prescription-${result.prescriptionImpact.status}`">
        <strong>{{ result.prescriptionImpact.title }}</strong>
        <p v-for="reason in result.prescriptionImpact.reasons" :key="reason">{{ reason }}</p>
      </div>
    </SectionGroup>

    <SectionGroup v-if="evidenceRuns.length" title="근거 세션" :surface="false">
      <div class="trend-evidence-list">
        <ListRow
          v-for="item in evidenceRuns"
          :key="`${item.runId}-${item.role}`"
          clickable
          :kicker="item.role"
          :title="item.run.sessionTitle || item.run.type"
          :detail="`${formatDateWithWeekday(item.run.date)} · ${item.reason}`"
          tone="primary"
          @click="openRun(item.runId)"
        />
      </div>
    </SectionGroup>

    <SectionGroup v-if="!runStore.sortedRuns.length && !runStore.loading" title="시작하기">
      <EmptyState title="러닝 기록이 필요합니다." description="HealthKit 또는 수동 기록이 쌓이면 추세 Lens가 자동으로 계산됩니다." />
    </SectionGroup>
  </PageLayout>
</template>

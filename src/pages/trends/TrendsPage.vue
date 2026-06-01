<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import {
  buildTrendAnalysis,
  type TrendBaseline,
  type TrendEvidenceRun,
  type TrendInsightConfidence,
  type TrendLensKey,
  type TrendOverallItem,
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
  { key: 'goal', label: '목표까지', description: '목표에 가까워졌는지' },
  { key: 'efficiency', label: '같은 심박에서', description: '비슷한 심박으로 더 잘 달리는지' },
  { key: 'intensity', label: '무리했나', description: '강훈련과 부하가 몰렸는지' },
  { key: 'quality', label: '잘 수행했나', description: '처방 의도대로 뛰었는지' },
  { key: 'recovery', label: '회복됐나', description: '좋은 훈련 뒤 무리가 남았는지' }
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

const trendAnalysis = computed(() =>
  buildTrendAnalysis({
    period: selectedPeriod.value,
    baseline: selectedBaseline.value,
    runs: runStore.sortedRuns,
    memory: memoryStore.memory
  })
)

const result = computed(() => trendAnalysis.value.lensResults[selectedLens.value])

const overallSummary = computed(() =>
  trendAnalysis.value.overallSummary
)

const overallItems = computed<TrendOverallItem[]>(() => [
  overallSummary.value.recentFlow,
  overallSummary.value.bestSignal,
  overallSummary.value.cautionSignal,
  overallSummary.value.prescriptionDirection
])

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

const overallToneLabel = computed(() => toneLabel(overallSummary.value.tone))
const overallConfidenceLabel = computed(() => confidenceLabel(overallSummary.value.confidence, '판단 신뢰도'))
const heroConfidenceLabel = computed(() => confidenceLabel(result.value.hero.confidence, '신뢰도'))

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

function selectOverallItem(item: TrendOverallItem) {
  if (!item.lens) return
  selectLens(item.lens)
}

function openRun(runId: string) {
  router.push({ path: '/runs', query: { runId } })
}

function isMetricValue(value: string) {
  return /^[+-]?[0-9.,]+/.test(value)
}

function toneLabel(tone: string) {
  if (tone === 'good') return '좋은 흐름'
  if (tone === 'warning') return '주의'
  if (tone === 'watch') return '관찰'
  return '데이터 확인'
}

function confidenceLabel(confidence: TrendInsightConfidence, prefix: string) {
  const label = confidence === 'high' ? '높음' : confidence === 'medium' ? '보통' : '낮음'
  return `${prefix}: ${label}`
}

function evidenceRoleLabel(role: TrendEvidenceRun['role']) {
  if (role === 'current') return '현재 기준 기록'
  if (role === 'baseline') return '비교 기준 기록'
  if (role === 'supporting') return '판단에 사용한 기록'
  if (role === 'warning') return '주의 신호 기록'
  return '비교 제외 기록'
}
</script>

<template>
  <PageLayout>
    <section class="trends-page-header">
      <p class="eyebrow">추세</p>
      <h2>훈련 변화와 다음 처방</h2>
      <p class="helper">누적 기록에서 좋아진 축, 막힌 축, 다음 훈련 조정 신호를 봅니다.</p>
    </section>

    <SectionCard class="trend-overall-card" :class="`trend-overall-${overallSummary.tone}`">
      <div class="trend-overall-header">
        <div>
          <span class="trend-hero-label">종합 판단</span>
          <h3>{{ overallSummary.title }}</h3>
          <p>{{ overallConfidenceLabel }} · 선택한 기간/비교 기준</p>
        </div>
        <span class="trend-confidence">{{ overallToneLabel }}</span>
      </div>
      <div class="trend-overall-list">
        <template v-for="item in overallItems" :key="item.label">
          <button
            v-if="item.lens"
            type="button"
            class="trend-overall-row trend-overall-row-action"
            :aria-label="`${item.label}: ${item.title} 렌즈 보기`"
            @click="selectOverallItem(item)"
          >
            <span>{{ item.label }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.detail }}</p>
              <small>렌즈 보기</small>
            </div>
          </button>
          <div v-else class="trend-overall-row">
            <span>{{ item.label }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.detail }}</p>
            </div>
          </div>
        </template>
      </div>
    </SectionCard>

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
      <span class="trend-confidence">{{ heroConfidenceLabel }}</span>
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
          :kicker="evidenceRoleLabel(item.role)"
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

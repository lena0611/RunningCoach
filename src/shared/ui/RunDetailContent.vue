<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import FitnessDetailCharts from '@/shared/ui/FitnessDetailCharts.vue'
import MetricPairList from '@/shared/ui/MetricPairList.vue'
import RunMetaChips from '@/shared/ui/RunMetaChips.vue'
import RunSplitSection from '@/shared/ui/RunSplitSection.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

const props = defineProps<{
  run: RunLog
  weeklyPattern?: string[]
}>()

const selectedOffsetSec = ref<number | null>(null)

const detailMetrics = computed(() => [
  { id: 'avg-pace', label: '평균 페이스', value: formatPace(props.run.avgPaceSec), unit: '/km' },
  { id: 'cadence', label: '평균 케이던스', value: formatInteger(props.run.cadence) },
  { id: 'avg-heart-rate', label: '평균 심박', value: formatInteger(props.run.avgHeartRate) },
  { id: 'max-heart-rate', label: '최고 심박', value: formatInteger(props.run.maxHeartRate) },
  { id: 'active-energy', label: '활동 칼로리', value: formatInteger(props.run.activeEnergyKcal), unit: props.run.activeEnergyKcal === null ? '' : 'kcal' },
  { id: 'heart-rate-drift', label: '드리프트', value: estimateHeartRateDrift(props.run), valueKind: 'text' as const },
  { id: 'elevation-gain', label: '누적 상승', value: formatInteger(props.run.elevationGainM), unit: props.run.elevationGainM === null ? '' : 'm' },
  { id: 'elevation-loss', label: '누적 하강', value: formatInteger(props.run.elevationLossM), unit: props.run.elevationLossM === null ? '' : 'm' }
])
</script>

<template>
  <main class="memory-stack-content run-detail-content">
    <SectionCard class="run-detail-hero">
      <div class="run-detail-topline">
        <span class="list-row-kicker">{{ formatDateWithWeekday(run.date) }}</span>
        <slot name="actions" />
      </div>
      <div class="run-detail-identity">
        <RunTypeIcon :type="run.type" size="large" />
        <div>
          <h2>{{ run.sessionTitle || run.type }}</h2>
          <div class="run-session-chip-row">
            <RunTypeBadge :type="run.type" />
            <RunMetaChips :run="run" :weekly-pattern="weeklyPattern ?? []" />
          </div>
        </div>
      </div>
      <div class="run-detail-metrics">
        <strong><UnitValue :amount="run.distanceKm" unit="km" /></strong>
        <span>{{ formatDuration(run.durationSec) }}</span>
        <span><UnitValue :amount="formatPace(run.avgPaceSec)" unit="/km" /></span>
      </div>
    </SectionCard>

    <MetricPairList :items="detailMetrics" />

    <SectionGroup v-if="run.memo || run.workoutFeeling || run.painNote" title="메모">
      <p v-if="run.memo">{{ run.memo }}</p>
      <p v-if="run.workoutFeeling" class="helper">느낌: {{ run.workoutFeeling }}</p>
      <p v-if="run.painNote" class="helper">통증/주의: {{ run.painNote }}</p>
    </SectionGroup>

    <FitnessDetailCharts
      v-if="(run.metricSamples?.length ?? 0) || (run.routePoints?.length ?? 0)"
      :run="run"
      :selected-offset-sec="selectedOffsetSec"
      @select-offset="selectedOffsetSec = $event"
    />
    <RunSplitSection
      :laps="run.laps"
      :metric-samples="run.metricSamples"
    />
  </main>
</template>

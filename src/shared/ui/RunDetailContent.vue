<script setup lang="ts">
import { ref } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import FitnessDetailCharts from '@/shared/ui/FitnessDetailCharts.vue'
import RunMetaChips from '@/shared/ui/RunMetaChips.vue'
import RunSplitSection from '@/shared/ui/RunSplitSection.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'

defineProps<{
  run: RunLog
  weeklyPattern?: string[]
}>()

const selectedOffsetSec = ref<number | null>(null)
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

    <SectionCard>
      <div class="metric-grid compact-metric-grid">
        <div class="metric metric-monochrome-value"><span>평균 페이스</span><strong><UnitValue :amount="formatPace(run.avgPaceSec)" unit="/km" /></strong></div>
        <div class="metric"><span>평균 케이던스</span><strong>{{ formatInteger(run.cadence) }}</strong></div>
        <div class="metric"><span>평균 심박</span><strong>{{ formatInteger(run.avgHeartRate) }}</strong></div>
        <div class="metric"><span>최고 심박</span><strong>{{ formatInteger(run.maxHeartRate) }}</strong></div>
        <div class="metric metric-monochrome-value">
          <span>활동 칼로리</span>
          <strong>
            <UnitValue v-if="run.activeEnergyKcal !== null" :amount="formatInteger(run.activeEnergyKcal)" unit="kcal" />
            <span v-else>-</span>
          </strong>
        </div>
        <div class="metric"><span>운동강도</span><strong>{{ run.rpe ?? '-' }}</strong></div>
        <div class="metric"><span>드리프트</span><strong class="metric-text-value">{{ estimateHeartRateDrift(run) }}</strong></div>
        <div class="metric metric-monochrome-value"><span>누적 상승</span><strong><UnitValue :amount="formatInteger(run.elevationGainM)" unit="m" /></strong></div>
        <div class="metric metric-monochrome-value"><span>누적 하강</span><strong><UnitValue :amount="formatInteger(run.elevationLossM)" unit="m" /></strong></div>
      </div>
    </SectionCard>

    <SectionCard v-if="run.memo || run.workoutFeeling || run.painNote">
      <SectionHeader title="메모" />
      <p v-if="run.memo">{{ run.memo }}</p>
      <p v-if="run.workoutFeeling" class="helper">느낌: {{ run.workoutFeeling }}</p>
      <p v-if="run.painNote" class="helper">통증/주의: {{ run.painNote }}</p>
    </SectionCard>

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

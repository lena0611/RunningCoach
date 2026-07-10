<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Lap, RunMetricSample, RunRoutePoint } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import { areLapsUniformKm, computeKmSplits } from '@/shared/lib/lapSplits'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import SegmentTabs from '@/shared/ui/SegmentTabs.vue'

const props = defineProps<{
  laps: Lap[]
  metricSamples?: RunMetricSample[]
  routePoints?: RunRoutePoint[]
}>()

type LapDisplayRow = {
  lap: Lap
  maxHeartRate: number | null
}

// 스플릿=1km 균등(계산) / 랩=기기가 끊은 실제 구간. 랩이 사실상 1km 균등이면 접어서 스플릿 단일 뷰,
// 비균등(인터벌·마일 오토랩)이면 랩|스플릿 탭 — 랩 먼저(그릴 확정 2026-07-10).
const uniform = computed(() => areLapsUniformKm(props.laps))
const derivedSplits = computed<Lap[]>(() =>
  uniform.value ? [] : computeKmSplits({ routePoints: props.routePoints, metricSamples: props.metricSamples })
)
const showTabs = computed(() => !uniform.value && derivedSplits.value.length > 0)
const mode = ref<'laps' | 'splits'>('laps')
const activeLaps = computed<Lap[]>(() => (showTabs.value && mode.value === 'splits' ? derivedSplits.value : props.laps))
const showDistance = computed(() => !uniform.value && (!showTabs.value || mode.value === 'laps'))

const lapRows = computed<LapDisplayRow[]>(() => {
  let startSec = 0
  return activeLaps.value.map((lap) => {
    const durationSec = getLapDurationSec(lap)
    const endSec = startSec + durationSec
    const maxHeartRate = lap.maxHeartRate ?? getMaxHeartRateInRange(startSec, endSec)
    startSec = endSec
    return {
      lap,
      maxHeartRate
    }
  })
})

function formatLapDistance(lap: Lap) {
  if (lap.distanceKm === null) return '-'
  return lap.distanceKm.toFixed(2)
}

function formatLapDuration(lap: Lap) {
  const durationSec = getLapDurationSec(lap)
  if (!durationSec) return '-'
  return formatDuration(Math.round(durationSec))
}

function formatLapHeartRate(row: LapDisplayRow) {
  const lap = row.lap
  const average = formatInteger(lap.avgHeartRate)
  const max = formatInteger(row.maxHeartRate)
  if (average === '-' && max === '-') return '-'
  if (max === '-' || average === max) return average
  if (average === '-') return max
  return `${average} / ${max}`
}

function getLapDurationSec(lap: Lap) {
  if (!lap.distanceKm || !lap.paceSec) return 0
  return lap.distanceKm * lap.paceSec
}

function getMaxHeartRateInRange(startSec: number, endSec: number) {
  if (!props.metricSamples?.length || endSec <= startSec) return null
  const values = props.metricSamples
    .filter((sample) => sample.offsetSec > startSec && sample.offsetSec <= endSec)
    .map((sample) => sample.heartRate)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!values.length) return null
  return Math.max(...values)
}
</script>

<template>
  <SectionGroup :title="uniform ? '스플릿' : '구간 기록'">
    <template #actions>
      <SegmentTabs
        v-if="showTabs"
        variant="pill"
        tone="ok"
        aria-label="구간 기록 보기 전환"
        :items="[
          { value: 'laps', label: '랩' },
          { value: 'splits', label: '스플릿' }
        ]"
        :active="mode"
        @change="mode = $event as 'laps' | 'splits'"
      />
      <small v-else class="helper">{{ laps.length ? `${laps.length}개` : '데이터 부족' }}</small>
    </template>
    <div v-if="activeLaps.length" class="lap-content">
      <div class="lap-split-table">
        <div class="lap-split-head" :class="{ 'with-distance': showDistance }">
          <span></span>
          <span v-if="showDistance">거리<small>(km)</small></span>
          <span>시간<small>(분:초)</small></span>
          <span>페이스<small>(분/km)</small></span>
          <span>심박수<small>(평균/최대 BPM)</small></span>
          <span>케이던스<small>(SPM)</small></span>
        </div>
        <div v-for="row in lapRows" :key="row.lap.index" class="lap-split-row" :class="{ 'with-distance': showDistance }">
          <strong>{{ row.lap.index }}</strong>
          <span v-if="showDistance" class="lap-dist">{{ formatLapDistance(row.lap) }}</span>
          <span class="lap-time">{{ formatLapDuration(row.lap) }}</span>
          <span class="lap-pace">{{ formatPace(row.lap.paceSec) }}</span>
          <span class="lap-hr">{{ formatLapHeartRate(row) }}</span>
          <span class="lap-cad">{{ formatInteger(row.lap.cadence) }}</span>
        </div>
      </div>
    </div>
    <p v-else class="helper">랩별 페이스와 심박이 있으면 자동 세션 재해석과 코칭 근거가 좋아집니다.</p>
  </SectionGroup>
</template>

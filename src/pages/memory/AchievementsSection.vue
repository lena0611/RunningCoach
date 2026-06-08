<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { computeAchievements, DISTANCE_MILESTONES_M, type AchievementContext } from '@/shared/lib/achievement/achievements'
import { formatDuration, formatPace } from '@/shared/lib/format'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import InfoPairGrid from '@/shared/ui/InfoPairGrid.vue'

const props = defineProps<{ runs: RunLog[] }>()

const activeContext = ref<AchievementContext>('training')
const set = computed(() => computeAchievements(props.runs))
const hasRace = computed(() => props.runs.some((run) => (run.tags ?? []).includes('self-race')))

function distanceLabel(distanceM: number): string {
  if (distanceM === 21097.5) return '하프'
  if (distanceM === 42195) return '풀'
  return `${Math.round(distanceM / 1000)}K`
}

const ctxView = computed(() => {
  const ctx = activeContext.value
  return {
    pbs: set.value.distancePbs.filter((p) => p.context === ctx).sort((a, b) => a.distanceM - b.distanceM),
    longestDistance: set.value.longestDistance.find((r) => r.context === ctx) ?? null,
    longestDuration: set.value.longestDuration.find((r) => r.context === ctx) ?? null,
    fastestPace: set.value.fastestPace.find((r) => r.context === ctx) ?? null,
    milestones: new Set(set.value.firstMilestones.filter((m) => m.context === ctx).map((m) => m.distanceM))
  }
})

const pbItems = computed(() => ctxView.value.pbs.map((p) => ({ label: distanceLabel(p.distanceM), value: formatDuration(p.elapsedSec) })))

const recordItems = computed(() => {
  const v = ctxView.value
  const items: { label: string; value: string }[] = []
  if (v.longestDistance) items.push({ label: '최장 거리', value: `${v.longestDistance.distanceKm.toFixed(2)}km` })
  if (v.longestDuration) items.push({ label: '최장 시간', value: formatDuration(v.longestDuration.durationSec) })
  if (v.fastestPace) items.push({ label: '최속 페이스', value: `${formatPace(v.fastestPace.avgPaceSec)}/km` })
  return items
})

const cumulativeItems = computed(() => {
  const c = set.value.cumulative
  const items: { label: string; value: string }[] = []
  if (c.longestStreak) items.push({ label: '최장 연속', value: `${c.longestStreak.days}일` })
  if (c.bestWeeklyVolume) items.push({ label: '주 최고', value: `${c.bestWeeklyVolume.distanceKm}km` })
  if (c.bestMonthlyVolume) items.push({ label: '월 최고', value: `${c.bestMonthlyVolume.distanceKm}km` })
  return items
})

const hasContextRecords = computed(() => pbItems.value.length > 0 || recordItems.value.length > 0)
const hasAnyAchievement = computed(() => hasContextRecords.value || cumulativeItems.value.length > 0 || ctxView.value.milestones.size > 0)
</script>

<template>
  <SectionGroup title="업적" :surface="false">
    <div class="achievement-context-toggle" role="tablist">
      <button type="button" role="tab" :aria-selected="activeContext === 'training'" :class="{ active: activeContext === 'training' }" @click="activeContext = 'training'">훈련</button>
      <button type="button" role="tab" :aria-selected="activeContext === 'race'" :class="{ active: activeContext === 'race' }" @click="activeContext = 'race'">레이싱</button>
    </div>

    <template v-if="activeContext === 'race' && !hasRace">
      <p class="helper">아직 레이싱(자기와의 대결) 기록이 없어요. 첫 레이싱을 하면 레이싱 PB가 여기 쌓입니다.</p>
    </template>
    <template v-else-if="hasContextRecords || ctxView.milestones.size">
      <div v-if="pbItems.length" class="achievement-block">
        <strong>거리별 PB</strong>
        <InfoPairGrid :items="pbItems" />
      </div>
      <div v-if="recordItems.length" class="achievement-block">
        <strong>기록</strong>
        <InfoPairGrid :items="recordItems" />
      </div>
      <div class="achievement-block">
        <strong>마일스톤</strong>
        <div class="achievement-milestones">
          <span v-for="m in DISTANCE_MILESTONES_M" :key="m" :class="{ done: ctxView.milestones.has(m) }">
            {{ ctxView.milestones.has(m) ? '✓' : '·' }} {{ distanceLabel(m) }}
          </span>
        </div>
      </div>
    </template>
    <p v-else class="helper">아직 {{ activeContext === 'race' ? '레이싱' : '훈련' }} 기록 업적이 없어요.</p>

    <div v-if="cumulativeItems.length" class="achievement-block">
      <strong>꾸준함 <span class="achievement-block-note">(훈련·레이싱 전체)</span></strong>
      <InfoPairGrid :items="cumulativeItems" />
    </div>

    <p v-if="!hasAnyAchievement && !(activeContext === 'race' && !hasRace)" class="helper">기록을 더 쌓으면 업적이 여기 표시됩니다.</p>
    <p class="helper">전체 기록에서 자동 산출됩니다. 새 기록을 추가하면 갱신됩니다.</p>
  </SectionGroup>
</template>

<style scoped>
.achievement-context-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--surface-2, rgba(255, 255, 255, 0.06));
  margin-bottom: 12px;
}
.achievement-context-toggle button {
  border: none;
  background: transparent;
  color: var(--text-muted, #9aa0a6);
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
}
.achievement-context-toggle button.active {
  background: var(--accent, #2f6df6);
  color: #fff;
  font-weight: 600;
}
.achievement-block {
  margin-top: 12px;
}
.achievement-block > strong {
  display: block;
  margin-bottom: 6px;
  font-size: 0.9rem;
}
.achievement-block-note {
  font-weight: 400;
  font-size: 0.78rem;
  color: var(--text-muted, #9aa0a6);
}
.achievement-milestones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}
.achievement-milestones span {
  color: var(--text-muted, #9aa0a6);
  font-size: 0.88rem;
}
.achievement-milestones span.done {
  color: var(--text, #e8eaed);
  font-weight: 600;
}
</style>

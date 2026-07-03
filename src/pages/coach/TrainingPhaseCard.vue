<script setup lang="ts">
import { computed } from 'vue'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'

const props = defineProps<{ summary: CoachAdaptiveProgressSummary }>()
defineEmits<{ (e: 'open'): void }>()

const STATUS_ICON: Record<string, string> = { ready: '✅', watch: '⏳', blocked: '❌', 'n/a': '–' }
// 적용되는 기준만 분모로(N/A=이 단계 해당 없음 제외). #402
const applicableCount = computed(() => props.summary.criteria.filter((c) => c.status !== 'n/a').length)
const readyRatio = computed(() => {
  const total = applicableCount.value || 1
  return Math.round((props.summary.readyCount / total) * 100)
})
const transitionReady = computed(() => props.summary.phaseProposal.shouldTransition)
</script>

<template>
  <article
    class="phase-card"
    role="button"
    tabindex="0"
    @click="$emit('open')"
    @keydown.enter="$emit('open')"
    @keydown.space.prevent="$emit('open')"
  >
    <header class="phase-head">
      <span class="phase-eyebrow">훈련 단계</span>
      <span v-if="transitionReady" class="phase-badge">전환 준비 ✨</span>
    </header>

    <div class="phase-identity">
      <strong class="phase-name">{{ summary.currentPhase }}</strong>
      <span class="phase-ready">{{ summary.readyCount }}/{{ applicableCount }} 준비</span>
    </div>

    <div class="gauge">
      <span class="gauge-fill" :class="{ 'gauge-fill-ok': summary.allReady }" :style="{ width: `${readyRatio}%` }" />
    </div>

    <ul class="phase-criteria">
      <li v-for="criterion in summary.criteria" :key="criterion.id" :class="{ 'phase-criterion-na': criterion.status === 'n/a' }">
        <span class="phase-criterion-icon">{{ STATUS_ICON[criterion.status] ?? '·' }}</span>
        <span class="phase-criterion-label">{{ criterion.label }}<span v-if="criterion.status === 'n/a'" class="phase-criterion-hint"> · 다음 단계</span></span>
      </li>
    </ul>

    <p class="phase-cta">▸ 탭하면 진행 평가</p>
  </article>
</template>

<style scoped>
.phase-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  text-align: left;
  border: none;
  width: 100%;
}

.phase-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.phase-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 0.02em;
}

.phase-badge {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  font-weight: 600;
}

.phase-identity {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.phase-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.phase-ready {
  font-size: 12px;
  color: var(--color-muted);
}

.gauge {
  height: 8px;
  border-radius: 999px;
  background: rgba(120, 120, 120, 0.18);
  overflow: hidden;
}

.gauge-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 0.3s ease;
}

.gauge-fill-ok {
  background: #22a06b;
}

.phase-criteria {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phase-criteria li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text);
}

.phase-criterion-icon {
  flex: 0 0 auto;
}

.phase-criterion-na {
  opacity: 0.5;
}

.phase-criterion-hint {
  color: var(--color-muted);
  font-size: 11px;
}

.phase-cta {
  font-size: 12px;
  color: var(--color-muted);
  margin: 0;
}
</style>

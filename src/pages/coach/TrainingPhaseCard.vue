<script setup lang="ts">
import { computed } from 'vue'
import type { TrainingPhaseName } from '@/entities/training-memory/model'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { PHASE_LABEL_KO } from '@/shared/lib/coaching/periodizedSchedule'
import { PHASE_PURPOSE_KO, type PlanPhaseJourney } from '@/shared/lib/coaching/planPhases'
import { formatMonthDay } from '@/shared/lib/format'

/**
 * 코치 탭 훈련 단계 카드(#887) — **플랜의 이번 주 단계**를 보여준다. 단계는 날짜대로 넘어가고(대회일 고정),
 * 아래 점검은 "이번 단계에서 보는 것"이지 다음 단계로 가는 관문이 아니다. 예전 카드는 따로 저장한 단계와
 * 수동 전환 버튼을 보여줘 플랜과 어긋났다.
 */
const props = defineProps<{
  journey: PlanPhaseJourney
  checks: CoachAdaptiveProgressSummary['criteria']
}>()
defineEmits<{ (e: 'open'): void }>()

const CHECK_LABEL: Record<string, string> = {
  'easy-hr-stability': '이지런 심박',
  'tempo-ceiling-quality': '템포 심박 상한',
  'long-run-durability': '롱런 후반 페이스',
  'injury-recovery-gate': '몸 상태'
}
const STATUS_LABEL = { ready: '좋아요', watch: '지켜보는 중', blocked: '챙겨야 해요' } as const
const SHORT_LABEL: Record<TrainingPhaseName, string> = {
  Base: '기초',
  Build: '발전',
  Threshold: '역치',
  'Race Specific': '준비',
  Taper: '테이퍼',
  Recovery: '회복'
}
// 막대 라벨이 들어갈 폭을 가늠하는 기준 — 320px 폰의 카드 안쪽 폭(여백 제외, 실측 252px).
const BAR_MIN_WIDTH_PX = 252

const current = computed(() => props.journey.blocks[props.journey.currentIndex])
const next = computed(() => props.journey.blocks[props.journey.currentIndex + 1] ?? null)
const visibleChecks = computed(() =>
  props.checks
    .filter((c): c is typeof c & { status: 'ready' | 'watch' | 'blocked' } => c.status !== 'n/a')
    .map((c) => ({ ...c, label: CHECK_LABEL[c.id] ?? c.label }))
)

const bar = computed(() => {
  let week = 0
  return props.journey.blocks.map((block, index) => {
    const short = SHORT_LABEL[block.phase]
    const isCurrent = index === props.journey.currentIndex
    // 좁은 단계(1주짜리 등)는 라벨을 빼고 막대만 둔다 — 잘린 글자보다 낫다. 전체 이름은 시트에 있다.
    const fits = (block.weeks / props.journey.totalWeeks) * BAR_MIN_WIDTH_PX >= short.length * 12 + 2
    return {
      key: block.start,
      weeks: block.weeks,
      label: isCurrent || fits ? short : '',
      current: isCurrent,
      cells: Array.from({ length: block.weeks }, () => {
        week += 1
        return week < props.journey.weekInPlan ? 'done' : week === props.journey.weekInPlan ? 'now' : 'ahead'
      })
    }
  })
})
</script>

<template>
  <article class="phase-card">
    <div class="phase-identity">
      <span class="phase-eyebrow">대회까지 {{ journey.totalWeeks }}주 중 {{ journey.weekInPlan }}주차</span>
      <span class="phase-title-row">
        <strong class="phase-name">{{ PHASE_LABEL_KO[current.phase] }}</strong>
        <span class="phase-week">{{ current.weeks }}주 중 {{ journey.weekInBlock }}주째</span>
      </span>
      <p class="phase-purpose">{{ PHASE_PURPOSE_KO[current.phase] }}</p>
    </div>

    <div class="phase-bar" role="img" :aria-label="`${journey.totalWeeks}주 중 ${journey.weekInPlan}주차, ${PHASE_LABEL_KO[current.phase]}`">
      <div class="phase-bar-track">
        <span v-for="block in bar" :key="block.key" class="phase-bar-block" :style="{ flexGrow: block.weeks }">
          <span v-for="(cell, i) in block.cells" :key="i" class="phase-bar-cell" :class="`phase-bar-${cell}`" />
        </span>
      </div>
      <div class="phase-bar-labels" aria-hidden="true">
        <span
          v-for="block in bar"
          :key="block.key"
          class="phase-bar-label"
          :class="{ 'phase-bar-label-current': block.current }"
          :style="{ flexGrow: block.weeks }"
        >{{ block.label }}</span>
      </div>
    </div>

    <div v-if="next" class="phase-next">
      <span class="phase-next-tag">다음</span>
      <span class="phase-next-body">
        <strong>{{ PHASE_LABEL_KO[next.phase] }} · {{ formatMonthDay(next.start, true) }}부터</strong>
        <span>{{ PHASE_PURPOSE_KO[next.phase] }}</span>
      </span>
    </div>

    <div v-if="visibleChecks.length" class="phase-checks">
      <strong class="phase-checks-title">이번 단계에서 보는 것</strong>
      <ul>
        <li v-for="check in visibleChecks" :key="check.id" class="phase-check">
          <svg class="phase-check-icon" :class="`phase-check-${check.status}`" viewBox="0 0 24 24" role="img" :aria-label="STATUS_LABEL[check.status]">
            <path v-if="check.status === 'ready'" d="M20 6 9 17l-5-5" />
            <template v-else-if="check.status === 'watch'">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </template>
            <template v-else>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6" />
              <path d="M12 17h.01" />
            </template>
          </svg>
          <span class="phase-check-body">
            <span class="phase-check-label">{{ check.label }}</span>
            <span class="phase-check-detail">{{ check.evidence }}</span>
          </span>
        </li>
      </ul>
    </div>

    <button class="phase-more" type="button" @click="$emit('open')">
      대회까지 단계 전체 보기
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  </article>
</template>

<style scoped>
.phase-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  word-break: keep-all;
}

.phase-identity {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.phase-eyebrow {
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  color: var(--color-muted);
}

.phase-title-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.phase-name {
  font-size: var(--text-title-size);
  line-height: var(--text-title-line);
  font-weight: var(--font-weight-heavy);
  color: var(--color-text);
}

.phase-week {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.phase-purpose {
  margin: 0;
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
  color: var(--color-text);
}

.phase-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phase-bar-track,
.phase-bar-labels {
  display: flex;
  gap: var(--space-1);
}

.phase-bar-block {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  gap: 2px;
}

.phase-bar-cell {
  flex: 1 1 0;
  height: 10px;
  border-radius: 3px;
  background: var(--color-border-strong);
}

.phase-bar-done {
  background: var(--color-primary-soft);
}

.phase-bar-now {
  background: var(--color-primary);
  outline: 1px solid var(--color-primary-text);
  outline-offset: 2px;
}

.phase-bar-label {
  flex: 1 1 0;
  min-width: 0;
  white-space: nowrap;
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  color: var(--color-muted);
}

.phase-bar-label-current {
  color: var(--color-primary-text);
  font-weight: var(--font-weight-bold);
}

.phase-next {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border-radius: var(--radius-field);
  background: var(--color-surface);
}

.phase-next-tag {
  flex-shrink: 0;
  font-size: var(--text-micro-size);
  line-height: var(--text-caption-line);
  font-weight: var(--font-weight-bold);
  color: var(--color-muted);
}

.phase-next-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.phase-next-body strong {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.phase-next-body span {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.phase-checks {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-strong);
}

.phase-checks-title {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.phase-checks ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.phase-check {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.phase-check-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.phase-check-ready {
  color: var(--color-primary);
}

.phase-check-watch {
  color: var(--color-muted);
}

.phase-check-blocked {
  color: var(--color-warning);
}

.phase-check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.phase-check-label {
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
}

.phase-check-detail {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.phase-more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-field);
  background: var(--color-surface);
  box-shadow: none;
  text-shadow: none;
  color: var(--color-text);
  font: inherit;
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
}

.phase-more svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--color-muted);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

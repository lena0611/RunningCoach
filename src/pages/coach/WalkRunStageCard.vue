<script setup lang="ts">
import { computed } from 'vue'
import { C25K, C25K_TOTAL_RUNS, type BeginnerWalkRunStage } from '@/shared/lib/coaching/beginnerWalkRun'
import { formatMonthDay } from '@/shared/lib/format'

/**
 * 입문(5K 미완주) 코치 탭 단계 카드(#887). 입문 플랜엔 롱런·템포가 없어서 주기화 단계 점검 대신
 * 걷기·뛰기 사다리(NHS Couch to 5K 9주)의 진행을 보여준다. 진행은 날짜가 아니라 뛴 횟수다(SSOT §완전 초보).
 */
const props = defineProps<{
  stage: BeginnerWalkRunStage
  /** 다음 예정 세션 날짜. 없으면 회차만 보여준다. */
  nextDate: string | null
  targetDate: string | null
}>()
defineEmits<{ (e: 'open'): void }>()

const RUNS_PER_WEEK = C25K_TOTAL_RUNS / C25K.length
const completed = computed(() => (props.stage.week - 1) * RUNS_PER_WEEK + (props.stage.run - 1))
const weeks = computed(() =>
  C25K.map((_, weekIndex) =>
    Array.from({ length: RUNS_PER_WEEK }, (_, runIndex) => {
      const n = weekIndex * RUNS_PER_WEEK + runIndex
      return n < completed.value ? 'done' : n === completed.value ? 'now' : 'ahead'
    })
  )
)
</script>

<template>
  <article class="walkrun-card">
    <div class="walkrun-identity">
      <span class="walkrun-eyebrow">
        <template v-if="targetDate">대회 {{ formatMonthDay(targetDate, true) }}까지 · </template>{{ C25K.length }}주 과정
      </span>
      <strong class="walkrun-name">걷기·뛰기 {{ stage.week }}주차</strong>
      <p class="walkrun-purpose">뛰기와 걷기를 번갈아 하며, 쉬지 않고 30분 뛰는 몸을 만들어요.</p>
    </div>

    <div class="walkrun-progress" role="img" :aria-label="`${C25K_TOTAL_RUNS}회 중 ${completed}회 완료, ${stage.week}주차 ${stage.run}회차 차례`">
      <div class="walkrun-dots">
        <span v-for="(week, i) in weeks" :key="i" class="walkrun-week">
          <span v-for="(dot, j) in week" :key="j" class="walkrun-dot" :class="`walkrun-dot-${dot}`" />
        </span>
      </div>
      <div class="walkrun-progress-labels" aria-hidden="true">
        <span>{{ C25K_TOTAL_RUNS }}회 중 {{ completed }}회</span>
        <span>{{ C25K.length }}주차 · 쉬지 않고 30분</span>
      </div>
    </div>

    <div class="walkrun-next">
      <span class="walkrun-next-tag">다음</span>
      <span class="walkrun-next-body">
        <strong><template v-if="nextDate">{{ formatMonthDay(nextDate, true) }} · </template>{{ stage.week }}주차 {{ stage.run }}회차</strong>
        <span>{{ stage.mainSet }} · 앞뒤 걷기 포함 약 {{ Math.round(stage.totalMin) }}분</span>
      </span>
    </div>

    <p class="walkrun-note">버거웠으면 같은 회차를 한 번 더 해도 괜찮아요. 다음 회차는 날짜가 아니라 뛴 횟수로 넘어가요.</p>

    <div class="walkrun-after">
      <strong>{{ C25K.length }}주를 마치면</strong>
      <span>쉬지 않고 30분이면 5K를 완주할 수 있는 몸이에요. 그때부터 거리와 기록을 함께 봐요.</span>
    </div>

    <button class="walkrun-more" type="button" @click="$emit('open')">
      {{ C25K.length }}주 과정 전체 보기
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  </article>
</template>

<style scoped>
.walkrun-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface-card);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  word-break: keep-all;
}

.walkrun-identity {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.walkrun-eyebrow {
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  color: var(--color-muted);
}

.walkrun-name {
  font-size: var(--text-title-size);
  line-height: var(--text-title-line);
  font-weight: var(--font-weight-heavy);
  color: var(--color-text);
}

.walkrun-purpose {
  margin: 0;
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
  color: var(--color-text);
}

.walkrun-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.walkrun-dots {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 14px;
}

.walkrun-week {
  display: flex;
  gap: 2px;
}

.walkrun-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
}

.walkrun-dot-done {
  background: var(--color-primary);
}

.walkrun-dot-now {
  background: var(--color-text);
  outline: 1px solid var(--color-primary);
  outline-offset: 2px;
}

.walkrun-progress-labels {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-micro-size);
  line-height: var(--text-micro-line);
  color: var(--color-muted);
}

.walkrun-next {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border-radius: var(--radius-field);
  background: var(--color-surface);
}

.walkrun-next-tag {
  flex-shrink: 0;
  font-size: var(--text-micro-size);
  line-height: var(--text-caption-line);
  font-weight: var(--font-weight-bold);
  color: var(--color-muted);
}

.walkrun-next-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.walkrun-next-body strong {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.walkrun-next-body span {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.walkrun-note {
  margin: 0;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.walkrun-after {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-strong);
}

.walkrun-after strong {
  font-size: var(--text-caption-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.walkrun-after span {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}

.walkrun-more {
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

.walkrun-more svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--color-muted);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>

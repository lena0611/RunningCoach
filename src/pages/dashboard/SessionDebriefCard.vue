<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import type { SessionIntent } from '@/entities/session-intent/model'
import type { IntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import IntentFulfillmentCard from '@/shared/ui/IntentFulfillmentCard.vue'

/**
 * 운동 후 디브리핑 카드 (#378, D1 강화). 프리런(의도·성공기준)과 대칭으로 닫는다:
 * 무엇을 했고(요약) · 의도를 얼마나 달성했는지(#310) · 세션 등급(#354) · 다음.
 */
defineProps<{
  run: RunLog
  summary: string
  gradeLine: string | null
  intent: SessionIntent | null
  fulfillment: IntentFulfillment | null
  nextLine: string | null
}>()
</script>

<template>
  <article class="debrief-card">
    <strong class="debrief-title">✅ 디브리핑</strong>
    <p class="debrief-summary">{{ summary }}</p>
    <p v-if="gradeLine" class="debrief-grade">{{ gradeLine }}</p>

    <IntentFulfillmentCard v-if="intent && fulfillment" :intent="intent" :fulfillment="fulfillment" />
    <p v-else class="helper">오늘 세션을 마쳤어요. 회복 신호를 살피며 다음 세션을 준비해요.</p>

    <p v-if="nextLine" class="debrief-next">다음 · {{ nextLine }}</p>
  </article>
</template>

<style scoped>
.debrief-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}
.debrief-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}
.debrief-summary {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  color: var(--color-text);
}
.debrief-grade {
  margin: 0;
  font-size: 13px;
  color: var(--color-muted);
}
.debrief-next {
  margin: var(--space-1, 4px) 0 0;
  font-size: 12px;
  color: var(--color-muted);
}
</style>

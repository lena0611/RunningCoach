<script setup lang="ts">
import type { SessionIntent } from '@/entities/session-intent/model'
import type { IntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'

defineProps<{ intent: SessionIntent; fulfillment: IntentFulfillment }>()
</script>

<template>
  <article class="fulfillment-card">
    <span class="context-chip">의도 평가</span>
    <div class="fulfillment-block">
      <span class="fulfillment-label">의도</span>
      <p class="fulfillment-text">{{ intent.title }}<template v-if="intent.why"> · {{ intent.why }}</template></p>
    </div>
    <div class="fulfillment-block">
      <span class="fulfillment-label">결과</span>
      <p class="fulfillment-text">{{ fulfillment.resultSummary }}</p>
    </div>
    <div class="fulfillment-meter">
      <div class="fulfillment-meter-head">
        <span>의도 달성률</span>
        <strong>{{ fulfillment.pct }}%</strong>
      </div>
      <div class="gauge"><span class="gauge-fill" :style="{ width: `${fulfillment.pct}%` }" /></div>
    </div>
    <small class="fulfillment-note">기록 향상이 아니라 의도한 강도/운영을 그대로 했는지에 대한 참고 점수예요.</small>
  </article>
</template>

<style scoped>
.fulfillment-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}

.fulfillment-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fulfillment-label {
  font-size: 12px;
  color: var(--color-muted);
}

.fulfillment-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

.fulfillment-meter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fulfillment-meter-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-caption-size);
  color: var(--color-text);
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

.fulfillment-note {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}
</style>

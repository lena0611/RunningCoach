<script setup lang="ts">
import type { RunLog } from '@/entities/run/model'
import type { SessionIntent } from '@/entities/session-intent/model'
import type { IntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import type { ExtraRunEvaluation } from '@/shared/lib/coaching/restGuidance'
import IntentFulfillmentCard from '@/shared/ui/IntentFulfillmentCard.vue'

/**
 * 운동 후 디브리핑 카드 (#378, D1 강화). 프리런(의도·성공기준)과 대칭으로 닫는다:
 * 무엇을 했고(요약) · 의도를 얼마나 달성했는지(#310) · 세션 등급(#354) · 다음.
 * 예정에 없던 추가 런이면 extraEval 로 회복일 건너뛴 평가를 보여준다(#379).
 */
defineProps<{
  run: RunLog
  summary: string
  gradeLine: string | null
  intent: SessionIntent | null
  fulfillment: IntentFulfillment | null
  extraEval: ExtraRunEvaluation | null
  nextLine: string | null
  /** 이 세션 타입의 용어집 슬러그(있으면 "이 세션이 뭔가요?" 링크 → 훈련법 해설). */
  methodSlug?: string
}>()

const emit = defineEmits<{ 'open-method': [] }>()
</script>

<template>
  <article class="debrief-card">
    <strong class="debrief-title">✅ 디브리핑</strong>
    <p class="debrief-summary">{{ summary }}</p>
    <p v-if="gradeLine" class="debrief-grade">{{ gradeLine }}</p>

    <div v-if="extraEval" class="debrief-extra" :class="{ 'debrief-extra-caution': extraEval.caution }">
      <strong>{{ extraEval.headline }}</strong>
      <p>{{ extraEval.note }}</p>
    </div>
    <IntentFulfillmentCard v-else-if="intent && fulfillment" :intent="intent" :fulfillment="fulfillment" />
    <p v-else-if="!gradeLine" class="helper">오늘 세션을 마쳤어요. 회복 신호를 살피며 다음 세션을 준비해요.</p>

    <p v-if="nextLine" class="debrief-next">다음 · {{ nextLine }}</p>
    <button v-if="methodSlug" type="button" class="debrief-method-link" @click="emit('open-method')">
      이 세션이 뭔가요? ⓘ
    </button>
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
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}
.debrief-next {
  margin: var(--space-1, 4px) 0 0;
  font-size: 12px;
  color: var(--color-muted);
}
.debrief-method-link {
  align-self: flex-start;
  margin-top: var(--space-1, 4px);
  padding: 0;
  background: transparent;
  border: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
}
.debrief-extra {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3, 12px);
  border-radius: var(--radius-button, 12px);
  background: var(--color-primary-soft, var(--color-field));
}
.debrief-extra-caution {
  background: var(--color-danger-soft, var(--color-field));
}
.debrief-extra strong {
  font-size: var(--text-info-size, 14px);
  color: var(--color-text);
}
.debrief-extra p {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}
</style>

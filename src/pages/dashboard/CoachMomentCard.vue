<script setup lang="ts">
import { ref } from 'vue'
import type { CoachMoment } from '@/shared/lib/coaching/coachMoments'

/**
 * 코치 모먼트 카드 (#382). 코치가 유의미한 순간에 먼저 말 거는 표면.
 * 의도 질문(options)이 있으면 트레이니가 고르고, 코치가 분기 피드백(response)을 답한다.
 */
const props = defineProps<{ moment: CoachMoment }>()
const emit = defineEmits<{ dismiss: [key: string]; action: [moment: CoachMoment] }>()

const response = ref<string | null>(null)
const sentiment = ref<string | null>(null)

function choose(option: { sentiment: string; response: string }) {
  response.value = option.response
  sentiment.value = option.sentiment
}
</script>

<template>
  <article class="moment-card">
    <header class="moment-head">
      <span class="moment-icon" aria-hidden="true">{{ moment.icon }}</span>
      <button class="moment-dismiss" type="button" aria-label="닫기" @click="emit('dismiss', moment.key)">✕</button>
    </header>
    <p class="moment-message">{{ moment.message }}</p>

    <div v-if="moment.options && !response" class="moment-options">
      <button v-for="(opt, i) in moment.options" :key="i" type="button" class="moment-option" @click="choose(opt)">
        {{ opt.label }}
      </button>
    </div>

    <p v-if="response" class="moment-response" :class="`moment-response-${sentiment}`">{{ response }}</p>

    <div v-if="moment.action && !response" class="moment-actions">
      <button type="button" class="moment-action-primary" @click="emit('action', moment)">{{ moment.action.label }}</button>
      <button type="button" class="moment-action-ghost" @click="emit('dismiss', moment.key)">나중에</button>
    </div>
  </article>
</template>

<style scoped>
.moment-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  margin-bottom: var(--space-2, 8px);
  background: var(--color-primary-soft, var(--color-surface-card));
  border-radius: var(--radius-card, 20px);
}
.moment-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.moment-icon {
  font-size: 18px;
}
.moment-dismiss {
  background: transparent;
  border: none;
  color: var(--color-muted);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.moment-message {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
  overflow-wrap: anywhere;
}
.moment-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.moment-option {
  padding: 6px 12px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}
.moment-response {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-button, 12px);
  background: var(--color-surface-card);
}
.moment-response-caution {
  background: var(--color-danger-soft, var(--color-surface-card));
}
.moment-actions {
  display: flex;
  gap: 8px;
}
.moment-action-primary {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-button, 12px);
  border: none;
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.moment-action-ghost {
  padding: 8px 12px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
  background: transparent;
  color: var(--color-muted);
  font-size: 13px;
  cursor: pointer;
}
</style>

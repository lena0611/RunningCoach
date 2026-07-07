<script setup lang="ts">
import { computed } from 'vue'
import type { SessionIntent } from '@/entities/session-intent/model'

const props = defineProps<{ intent: SessionIntent; busy?: boolean }>()
const emit = defineEmits<{ (e: 'acknowledge'): void; (e: 'request-alternative'): void }>()

function criteriaIcon(text: string): string {
  if (text.startsWith('평균심박')) return '❤️'
  if (text.startsWith('RPE')) return '💪'
  return '⏱️'
}

const ceilingText = computed(() =>
  props.intent.targets.hrCeilingBpm ? `심박 상한 ${props.intent.targets.hrCeilingBpm}` : null
)
</script>

<template>
  <article class="prerun-card">
    <header class="prerun-head">
      <span class="prerun-eyebrow">오늘의 훈련</span>
      <span v-if="ceilingText" class="prerun-badge">{{ ceilingText }}</span>
    </header>

    <strong class="prerun-title">🏃 {{ intent.title }}</strong>

    <div class="prerun-block">
      <span class="prerun-label">왜 하나요</span>
      <p class="prerun-why">{{ intent.why }}</p>
    </div>

    <div class="prerun-block">
      <span class="prerun-label">성공 기준</span>
      <ul class="prerun-criteria">
        <li v-for="(c, i) in intent.successCriteria" :key="i">
          <span aria-hidden="true">{{ criteriaIcon(c) }}</span> {{ c }}
        </li>
      </ul>
    </div>

    <footer class="prerun-actions">
      <button type="button" class="prerun-primary" :disabled="busy" @click="emit('acknowledge')">
        이 훈련으로 갈게요
      </button>
      <button type="button" class="prerun-secondary" :disabled="busy" @click="emit('request-alternative')">
        다른 훈련 제안받기
      </button>
    </footer>
  </article>
</template>

<style scoped>
.prerun-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}

.prerun-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.prerun-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 0.02em;
}

.prerun-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-muted);
  border: 1px dashed currentColor;
}

.prerun-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.prerun-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prerun-label {
  font-size: 12px;
  color: var(--color-muted);
}

.prerun-why {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

.prerun-criteria {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-caption-size);
  color: var(--color-text);
}

.prerun-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.prerun-primary,
.prerun-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
}

.prerun-primary {
  background: var(--color-primary);
  color: #fff;
  border: none;
}

.prerun-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid rgba(120, 120, 120, 0.3);
}

.prerun-primary:disabled,
.prerun-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

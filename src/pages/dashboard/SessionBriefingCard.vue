<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import EvidenceSheet from '@/shared/ui/EvidenceSheet.vue'

/**
 * 프리런 "작전 브리핑" 카드 (#370). 4요소(목표·효과·이행지침·조심할 점)를 보여주고,
 * 근거는 인라인이 아닌 "근거" 버튼 → EvidenceSheet 로만 노출(코칭 신뢰 원칙).
 * 액션: 이 훈련으로 갈게요 / 작전 바꾸기(쉽게·어렵게).
 */
const props = defineProps<{
  briefing: SessionBriefing
  sessionType: string
  ceilingText?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  acknowledge: []
  'request-alternative': [direction: 'easier' | 'harder']
}>()

const evidenceOpen = ref(false)
const hasEvidence = computed(() => props.briefing.evidence.length > 0)
</script>

<template>
  <article class="brief-card">
    <header class="brief-head">
      <span class="brief-eyebrow">📋 오늘의 작전</span>
      <span v-if="ceilingText" class="brief-badge">{{ ceilingText }}</span>
    </header>

    <strong class="brief-title">🏃 {{ sessionType }}</strong>
    <p class="brief-goal">🎯 {{ briefing.goalLine }}</p>

    <div class="brief-block">
      <span class="brief-label">훈련 효과</span>
      <p class="brief-text">{{ briefing.effect }}</p>
    </div>

    <div class="brief-block">
      <span class="brief-label">어떻게 뛰나</span>
      <ul class="brief-list">
        <li v-for="(line, i) in briefing.execution" :key="i">{{ line }}</li>
      </ul>
    </div>

    <div v-if="briefing.cautions.length" class="brief-block brief-caution">
      <span class="brief-label">⚠ 조심할 점</span>
      <ul class="brief-list">
        <li v-for="(c, i) in briefing.cautions" :key="i">{{ c }}</li>
      </ul>
    </div>

    <button v-if="hasEvidence" type="button" class="brief-evidence-btn" @click="evidenceOpen = true">
      ⓘ 이 코칭의 근거
    </button>

    <footer class="brief-actions">
      <button type="button" class="brief-primary" :disabled="busy" @click="emit('acknowledge')">
        이 훈련으로 갈게요
      </button>
      <div class="brief-alt">
        <button type="button" class="brief-secondary" :disabled="busy" @click="emit('request-alternative', 'easier')">
          더 쉽게
        </button>
        <button type="button" class="brief-secondary" :disabled="busy" @click="emit('request-alternative', 'harder')">
          더 강하게
        </button>
      </div>
    </footer>

    <EvidenceSheet :open="evidenceOpen" :evidence="briefing.evidence" @close="evidenceOpen = false" />
  </article>
</template>

<style scoped>
.brief-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}

.brief-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brief-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
  letter-spacing: 0.02em;
}

.brief-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  color: var(--color-muted);
  border: 1px dashed currentColor;
}

.brief-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.brief-goal {
  margin: 0;
  font-size: 13px;
  color: var(--color-muted);
}

.brief-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brief-label {
  font-size: 12px;
  color: var(--color-muted);
}

.brief-text {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}

.brief-list {
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}

.brief-caution .brief-list {
  color: var(--color-text);
}

.brief-evidence-btn {
  align-self: flex-start;
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
}

.brief-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.brief-alt {
  display: flex;
  gap: 8px;
}

.brief-primary,
.brief-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.brief-primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}

.brief-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
}

.brief-primary:disabled,
.brief-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

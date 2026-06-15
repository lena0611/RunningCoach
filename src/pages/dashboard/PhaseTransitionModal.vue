<script setup lang="ts">
import { computed } from 'vue'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'

const props = defineProps<{ summary: CoachAdaptiveProgressSummary; saving?: boolean }>()
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>()

const STATUS_ICON: Record<string, string> = { ready: '✅', watch: '⏳', blocked: '❌' }
const proposal = computed(() => props.summary.phaseProposal)
</script>

<template>
  <div class="modal-scrim" role="dialog" aria-modal="true" aria-label="훈련 단계 진행 평가" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-head">
        <span class="modal-eyebrow">진행 평가</span>
        <button type="button" class="modal-x" aria-label="닫기" @click="emit('close')">✕</button>
      </header>

      <div class="modal-phase">
        <strong>{{ summary.currentPhase }}</strong>
        <template v-if="proposal.shouldTransition && proposal.toPhase">
          <span class="modal-arrow">→</span>
          <strong class="modal-next">{{ proposal.toPhase }}</strong>
        </template>
      </div>

      <p class="modal-reason">{{ proposal.reason }}</p>

      <ul class="modal-criteria">
        <li v-for="criterion in summary.criteria" :key="criterion.id">
          <span>{{ STATUS_ICON[criterion.status] ?? '·' }}</span>
          <span class="modal-criterion-label">{{ criterion.label }}</span>
          <small class="modal-criterion-evidence">{{ criterion.evidence }}</small>
        </li>
      </ul>

      <div v-if="proposal.blockers.length" class="modal-blockers">
        <span class="modal-blockers-title">남은 조건</span>
        <ul>
          <li v-for="(blocker, index) in proposal.blockers" :key="index">{{ blocker }}</li>
        </ul>
      </div>

      <footer class="modal-foot">
        <button type="button" class="ghost" :disabled="saving" @click="emit('close')">닫기</button>
        <button
          v-if="proposal.shouldTransition"
          type="button"
          class="primary"
          :disabled="saving"
          @click="emit('confirm')"
        >
          {{ saving ? '적용 중…' : `${proposal.toPhase}(으)로 전환` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
}

.modal-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
  max-height: 80vh;
  overflow-y: auto;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-eyebrow {
  font-size: 12px;
  color: var(--color-muted);
}

.modal-x {
  background: none;
  border: none;
  color: var(--color-muted);
  font-size: 16px;
  cursor: pointer;
}

.modal-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  color: var(--color-text);
}

.modal-arrow {
  color: var(--color-muted);
}

.modal-next {
  color: var(--color-primary);
}

.modal-reason {
  font-size: 14px;
  color: var(--color-text);
  margin: 0;
}

.modal-criteria {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.modal-criteria li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: baseline;
}

.modal-criterion-label {
  font-size: 14px;
  color: var(--color-text);
}

.modal-criterion-evidence {
  grid-column: 2;
  font-size: 12px;
  color: var(--color-muted);
}

.modal-blockers {
  padding: 12px;
  border-radius: 12px;
  background: rgba(120, 120, 120, 0.12);
}

.modal-blockers-title {
  font-size: 12px;
  color: var(--color-muted);
}

.modal-blockers ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.modal-blockers li {
  font-size: 13px;
  color: var(--color-text);
}

.modal-foot {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.modal-foot button {
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.modal-foot .ghost {
  flex: 0 0 auto;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid rgba(120, 120, 120, 0.3);
  color: var(--color-text);
}

.modal-foot .primary {
  background: var(--color-primary);
  color: #08130d;
}
</style>

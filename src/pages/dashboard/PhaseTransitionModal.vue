<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const props = defineProps<{ open: boolean; summary: CoachAdaptiveProgressSummary; saving?: boolean }>()
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>()

const STATUS_ICON: Record<string, string> = { ready: '✅', watch: '⏳', blocked: '❌' }
const proposal = computed(() => props.summary.phaseProposal)

const drag = useBottomSheetDrag(() => emit('close'))

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('sheet-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('sheet-open')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" @click.self="emit('close')">
      <section
        class="bottom-sheet phase-eval-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="훈련 단계 진행 평가"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>진행 평가</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="phase-eval-content">
          <div class="phase-eval-phase">
            <strong>{{ summary.currentPhase }}</strong>
            <template v-if="proposal.shouldTransition && proposal.toPhase">
              <span class="phase-eval-arrow">→</span>
              <strong class="phase-eval-next">{{ proposal.toPhase }}</strong>
            </template>
          </div>

          <p class="phase-eval-reason">{{ proposal.reason }}</p>

          <ul class="phase-eval-criteria">
            <li v-for="criterion in summary.criteria" :key="criterion.id">
              <span>{{ STATUS_ICON[criterion.status] ?? '·' }}</span>
              <span class="phase-eval-criterion-label">{{ criterion.label }}</span>
              <small class="phase-eval-criterion-evidence">{{ criterion.evidence }}</small>
            </li>
          </ul>

          <div v-if="proposal.blockers.length" class="phase-eval-blockers">
            <span class="phase-eval-blockers-title">남은 조건</span>
            <ul>
              <li v-for="(blocker, index) in proposal.blockers" :key="index">{{ blocker }}</li>
            </ul>
          </div>
        </div>

        <div v-if="proposal.shouldTransition" class="phase-eval-actions">
          <button type="button" class="ghost" :disabled="saving" @click="emit('close')">닫기</button>
          <button type="button" class="primary" :disabled="saving" @click="emit('confirm')">
            {{ saving ? '적용 중…' : `${proposal.toPhase}(으)로 전환` }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.phase-eval-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  -webkit-overflow-scrolling: touch;
}

.phase-eval-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
  color: var(--color-text);
}

.phase-eval-arrow {
  color: var(--color-muted);
}

.phase-eval-next {
  color: var(--color-primary);
}

.phase-eval-reason {
  font-size: 14px;
  color: var(--color-text);
  margin: 0;
}

.phase-eval-criteria {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.phase-eval-criteria li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: baseline;
}

.phase-eval-criterion-label {
  font-size: 14px;
  color: var(--color-text);
}

.phase-eval-criterion-evidence {
  grid-column: 2;
  font-size: 12px;
  color: var(--color-muted);
}

.phase-eval-blockers {
  padding: 12px;
  border-radius: 12px;
  background: var(--color-subtle);
}

.phase-eval-blockers-title {
  font-size: 12px;
  color: var(--color-muted);
}

.phase-eval-blockers ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.phase-eval-blockers li {
  font-size: 13px;
  color: var(--color-text);
}

.phase-eval-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.phase-eval-actions button {
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.phase-eval-actions .ghost {
  flex: 0 0 auto;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.phase-eval-actions .primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #08130d);
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import type { EvidenceRef } from '@/shared/lib/coaching/sessionBriefing'

/**
 * 코칭 근거(방법론·연구) 바텀시트 (#371, 코칭 신뢰 원칙).
 * 기본 화면엔 인라인 노출하지 않고, "근거" 단서 버튼을 탭할 때만 이 시트로 출처를 펼친다.
 */
const props = defineProps<{
  open: boolean
  evidence: EvidenceRef[]
}>()

const emit = defineEmits<{ close: [] }>()

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
    <Transition name="bottom-sheet">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" @click.self="emit('close')">
      <section
        class="bottom-sheet evidence-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="코칭 근거"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>이 코칭의 근거</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="evidence-content">
          <p class="helper">
            PaceLAB 코칭은 검증된 러닝/지구력 훈련 방법론에 뿌리를 둡니다. 오늘 처방의 근거예요.
          </p>
          <ul class="evidence-list">
            <li v-for="(e, i) in evidence" :key="i" class="evidence-item">
              <strong>{{ e.method }}</strong>
              <p>{{ e.summary }}</p>
              <a v-if="e.url" :href="e.url" target="_blank" rel="noopener noreferrer">출처 보기 ↗</a>
            </li>
          </ul>
          <p class="helper evidence-caveat">권위를 빌리되 맹신은 금물 — 컨디션·통증 신호가 늘 우선입니다.</p>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.evidence-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.evidence-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.evidence-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.evidence-item strong {
  font-size: var(--text-info-size, 14px);
  color: var(--color-text);
}

.evidence-item p {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-muted);
}

.evidence-item a {
  font-size: 13px;
  color: var(--color-primary);
}

.evidence-caveat {
  margin-top: var(--space-1, 4px);
}
</style>

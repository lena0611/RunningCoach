<script setup lang="ts">
/**
 * 앞당겨 뛴 런 갈음 제안 바텀시트(2026-09-03).
 *
 * 예정일 전날 뛴 런은 자동 크레딧하지 않으므로(SSOT §세션 변경) 코치가 묻는다.
 * 카드로 두면 스크롤해야 보여 놓치기 쉬워 시트로 올린다 — 오늘 하루만 유효한 선택이라 적시 노출이 핵심.
 *
 * 닫힘 신호를 둘로 나눈다(2026-09-03): X·배경 탭·쓸어내리기는 **결정이 아니라 '지금은 됐고'**(close)라
 * 다음에 앱을 열면 다시 묻고, '예정대로 할게요'(decline)만 오늘 하루를 잠근다. 이 시트는 갈음의 유일한
 * 진입점이라, 배경을 잘못 눌러 닫힌 걸 결정으로 굳히면 오늘 갈음할 방법이 사라진다.
 */
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import PrimaryButton from './PrimaryButton.vue'
import SecondaryButton from './SecondaryButton.vue'

defineProps<{
  open: boolean
  /** 오늘 예정 세션 라벨(예: 이지). 조사 분기를 피하려 본문에서 '세션을'로 받는다. */
  sessionLabel: string
  runTypeLabel: string
  runKm: number
}>()

const emit = defineEmits<{
  /** 결정 없이 닫음(X·배경·드래그) — 저장하지 않는다. */
  close: []
  /** '예정대로 할게요' — 오늘은 다시 묻지 않는다. */
  decline: []
  credit: []
}>()

const drag = useBottomSheetDrag(() => emit('close'))
</script>

<template>
  <Transition name="bottom-sheet">
    <div v-if="open" class="bottom-sheet-layer early-run-credit-layer" role="presentation" @click.self="emit('close')">
      <section
        class="bottom-sheet early-run-credit-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="어제 런으로 갈음"
        @click.stop
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <div>
            <span class="context-chip">오늘 훈련</span>
            <h2>어제 이미 뛰었어요</h2>
          </div>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="early-run-credit-content">
          <p class="early-run-credit-copy">
            어제 {{ runTypeLabel }} {{ Math.round(runKm * 10) / 10 }}km를 뛰었네요. 오늘 {{ sessionLabel }} 세션을 어제 런으로 갈음하고
            쉴까요?
          </p>
          <p class="early-run-credit-note">예정대로 오늘 또 뛰어도 괜찮아요. 갈음하면 오늘 훈련이 완료로 기록됩니다.</p>
        </div>

        <div class="early-run-credit-actions">
          <SecondaryButton @click="emit('decline')">예정대로 할게요</SecondaryButton>
          <PrimaryButton @click="emit('credit')">어제 런으로 갈음</PrimaryButton>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.early-run-credit-layer {
  z-index: var(--z-confirm-sheet);
}

.early-run-credit-sheet {
  gap: 14px;
  max-height: min(70vh, 560px);
}

.early-run-credit-sheet .bottom-sheet-heading > div {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.early-run-credit-sheet h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 22px;
  line-height: 1.25;
}

.early-run-credit-content {
  display: grid;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.early-run-credit-copy {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
}

.early-run-credit-note {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  line-height: 1.45;
}

.early-run-credit-actions {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 10px;
}

.early-run-credit-actions :deep(button) {
  width: 100%;
  min-height: 48px;
}
</style>

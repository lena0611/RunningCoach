<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

/**
 * 주말 트리아지 바텀시트 (제안훈련 응답, 에픽 #362; 북극성 [[coach-proactive-communication-vision]]).
 * 주 마감 임박+백로그 초과일 때 "키 세션 하나 살리고 나머지는 놓아준다". 닦달·크래밍 금지(회복=훈련의 일부).
 */
const props = defineProps<{
  open: boolean
  saveLabel: string
  releaseLabels: string[]
  busy?: boolean
}>()

const emit = defineEmits<{ save: []; release: []; close: [] }>()

const drag = useBottomSheetDrag(() => emit('close'))

watch(
  () => props.open,
  (open) => document.body.classList.toggle('sheet-open', open)
)
onBeforeUnmount(() => document.body.classList.remove('sheet-open'))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" data-no-swipe @click.self="emit('close')">
      <section
        class="bottom-sheet triage-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="이번 주 정리"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>🧭 이번 주 정리</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="triage-body">
          <p class="triage-lead">주말이 빠듯해요. 다 하려 하지 말고 이번 주 핵심 하나만 살릴까요?</p>
          <button type="button" class="triage-save" :disabled="busy" @click="emit('save')">
            ⭐ {{ saveLabel }} 하나에 집중하기
          </button>
          <button type="button" class="triage-release" :disabled="busy" @click="emit('release')">
            🍃 나머지 {{ releaseLabels.length }}개 놓아주기
          </button>
          <p v-if="releaseLabels.length" class="helper triage-release-note">
            놓아줄 세션: {{ releaseLabels.join(', ') }} · 죄책감 없이 — 회복도 훈련의 일부예요.
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.triage-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 2px 8px;
}
.triage-lead {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}
.triage-save,
.triage-release {
  padding: 12px;
  border-radius: var(--radius-button, 12px);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.triage-save {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}
.triage-release {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.25));
}
.triage-save:disabled,
.triage-release:disabled {
  opacity: 0.5;
  cursor: default;
}
.triage-release-note {
  margin: 2px 0 0;
}
</style>

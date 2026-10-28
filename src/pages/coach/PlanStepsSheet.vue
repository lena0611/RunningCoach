<script setup lang="ts">
import { onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import { useSheetA11y } from '@/shared/lib/useSheetA11y'

/**
 * 플랜 단계 목록 시트(#887) — "대회까지 단계"(주기화 단계)와 "9주 과정"(걷기·뛰기)이 같은 모양을 쓴다.
 * 지난 단계는 흐리게+체크, 지금 단계는 강조, 남은 단계는 기본.
 */
export type PlanStepRow = {
  key: string
  title: string
  meta: string
  body: string
  state: 'done' | 'now' | 'ahead'
}

const props = defineProps<{
  open: boolean
  title: string
  subtitle: string
  rows: PlanStepRow[]
  note: string
}>()

const emit = defineEmits<{ close: [] }>()

const drag = useBottomSheetDrag(() => emit('close'))
const sheetEl = ref<HTMLElement | null>(null)
useSheetA11y(toRef(props, 'open'), sheetEl, () => emit('close'))

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
          ref="sheetEl"
          tabindex="-1"
          class="bottom-sheet plan-steps-sheet"
          :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
          :style="drag.sheetStyle.value"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
          <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
            <div class="plan-steps-heading">
              <h2>{{ title }}</h2>
              <small>{{ subtitle }}</small>
            </div>
            <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </div>

          <div class="plan-steps-content">
            <ol class="plan-steps-list">
              <li v-for="row in rows" :key="row.key" class="plan-step" :class="`plan-step-${row.state}`">
                <svg v-if="row.state === 'done'" class="plan-step-mark" viewBox="0 0 24 24" role="img" aria-label="지남"><path d="M20 6 9 17l-5-5" /></svg>
                <span v-else class="plan-step-dot" aria-hidden="true" />
                <span class="plan-step-body">
                  <span class="plan-step-title-row">
                    <strong>{{ row.title }}</strong>
                    <small>{{ row.meta }}</small>
                    <span v-if="row.state === 'now'" class="plan-step-badge">지금</span>
                  </span>
                  <span class="plan-step-text">{{ row.body }}</span>
                </span>
              </li>
            </ol>
            <p class="plan-steps-note">{{ note }}</p>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.plan-steps-sheet {
  max-height: min(86vh, 760px);
}

.plan-steps-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.plan-steps-heading small {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.plan-steps-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-height: calc(min(86vh, 760px) - 96px);
  overflow-y: auto;
  overscroll-behavior: contain;
  word-break: keep-all;
}

.plan-steps-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.plan-step {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border-radius: var(--radius-field);
  background: var(--color-surface-card);
}

.plan-step-now {
  background: var(--color-primary-soft);
  outline: 1px solid var(--color-primary);
  outline-offset: -1px;
}

.plan-step-mark {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  fill: none;
  stroke: var(--color-muted-2);
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.plan-step-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin: 7px 5px 0;
  border-radius: var(--radius-pill);
  border: 2px solid var(--color-muted-2);
  box-sizing: border-box;
}

.plan-step-now .plan-step-dot {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.plan-step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.plan-step-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
}

.plan-step-title-row strong {
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.plan-step-title-row small {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
}

.plan-step-badge {
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-micro-size);
  font-weight: var(--font-weight-bold);
}

.plan-step-text {
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
  white-space: pre-line;
}

.plan-step-now .plan-step-text {
  color: var(--color-text);
}

.plan-step-done strong {
  color: var(--color-muted);
}

.plan-steps-note {
  margin: 0;
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line);
  color: var(--color-muted);
}
</style>

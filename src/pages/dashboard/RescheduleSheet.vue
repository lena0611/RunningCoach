<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

/**
 * 세션 조정(다른 날로) 피커 바텀시트 (제안훈련 응답, 에픽 #362).
 * 이번 주(월~일) 안에서 옮기길 권한다. 점유일은 스왑(두 세션 날짜 맞바꿈). 영속은 부모가 한다.
 */
type Candidate = {
  date: string
  label: string
  done: boolean
  occupantLabel: string | null
  isTarget: boolean
  selectable: boolean
}

const props = defineProps<{
  open: boolean
  title: string
  candidates: Candidate[]
  /** 키 세션 포기 전 "다른 날로?" 맥락이면 "그래도 건너뛰기"를 노출. */
  keySkip: boolean
  busy?: boolean
}>()

const emit = defineEmits<{ pick: [date: string]; skip: []; close: [] }>()

const drag = useBottomSheetDrag(() => emit('close'))

// open 토글 시 body 스크롤 락(시트 공통 규약, EvidenceSheet 미러).
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
        class="bottom-sheet reschedule-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="세션 조정"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>{{ title }}</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="reschedule-body">
          <p class="helper">이번 주 안에서 옮기길 권해요. 점유된 날은 두 세션 날짜를 맞바꿔요(스왑).</p>
          <div class="reschedule-grid">
            <button
              v-for="c in candidates"
              :key="c.date"
              type="button"
              class="reschedule-cell"
              :class="{ 'cell-target': c.isTarget, 'cell-swap': c.occupantLabel, 'cell-free': c.selectable && !c.occupantLabel }"
              :disabled="busy || !c.selectable"
              @click="emit('pick', c.date)"
            >
              <span class="cell-day">{{ c.label }}</span>
              <span class="cell-note">
                <template v-if="c.isTarget">현재</template>
                <template v-else-if="c.done">완료</template>
                <template v-else-if="c.occupantLabel">{{ c.occupantLabel }}·스왑</template>
                <template v-else-if="c.selectable">비어 있음</template>
                <template v-else>지남</template>
              </span>
            </button>
          </div>
          <button v-if="keySkip" type="button" class="reschedule-skip" :disabled="busy" @click="emit('skip')">
            옮기지 않고 이번 주는 건너뛸게요
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.reschedule-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px 8px;
}
.reschedule-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.reschedule-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 4px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.2));
  background: var(--color-surface-card);
  color: var(--color-text);
  box-shadow: none;
  cursor: pointer;
  font-size: 12px;
}
.reschedule-cell:disabled {
  opacity: 0.45;
  cursor: default;
}
.cell-day {
  font-weight: 700;
}
.cell-note {
  font-size: 10.5px;
  color: var(--color-muted);
}
.cell-free {
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}
.cell-free .cell-note {
  color: var(--color-primary);
}
.cell-swap {
  background: var(--color-warning-soft);
}
.cell-swap .cell-note {
  color: var(--color-warning-text);
}
.reschedule-skip {
  align-self: stretch;
  padding: 11px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.2));
  background: transparent;
  color: var(--color-warning-text, var(--color-muted));
  box-shadow: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
</style>

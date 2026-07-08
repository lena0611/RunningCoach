<script setup lang="ts">
import type { DisabledNotificationItem } from '@/app/stores/settingsStore'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import PrimaryButton from './PrimaryButton.vue'
import SecondaryButton from './SecondaryButton.vue'

defineProps<{
  open: boolean
  disabledItems: DisabledNotificationItem[]
}>()

const emit = defineEmits<{
  close: []
  openSettings: []
}>()

const drag = useBottomSheetDrag(() => emit('close'))
</script>

<template>
  <Transition name="bottom-sheet">
  <div v-if="open" class="bottom-sheet-layer notification-settings-layer" role="presentation" @click.self="emit('close')">
    <section
      class="bottom-sheet notification-settings-sheet"
      :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
      :style="drag.sheetStyle.value"
      role="dialog"
      aria-modal="true"
      aria-label="알림 설정 안내"
      @click.stop
    >
      <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
      <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
        <div>
          <span class="context-chip">알림 설정</span>
          <h2>꺼진 알림이 있어요</h2>
        </div>
        <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="notification-settings-content">
        <p class="notification-settings-copy">훈련 일정과 새 러닝 기록 안내를 받으려면 아래 항목을 켜두는 편이 좋습니다.</p>
        <ul class="notification-settings-list">
          <li v-for="item in disabledItems" :key="item.key">
            <strong>{{ item.title }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>

      <div class="notification-settings-actions">
        <SecondaryButton @click="emit('close')">나중에</SecondaryButton>
        <PrimaryButton @click="emit('openSettings')">설정 열기</PrimaryButton>
      </div>
    </section>
  </div>
  </Transition>
</template>

<style scoped>
.notification-settings-layer {
  z-index: var(--z-confirm-sheet);
}

.notification-settings-sheet {
  gap: 14px;
  max-height: min(78vh, 640px);
}

.notification-settings-sheet .bottom-sheet-heading > div {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.notification-settings-sheet h2 {
  overflow: hidden;
  margin: 0;
  color: var(--color-text);
  font-size: 22px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-settings-content {
  display: grid;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.notification-settings-copy {
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
}

.notification-settings-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-card);
  background: var(--color-field);
  list-style: none;
}

.notification-settings-list li {
  display: grid;
  gap: 4px;
  padding: 14px;
}

.notification-settings-list li + li {
  border-top: 1px solid var(--color-hairline);
}

.notification-settings-list strong {
  color: var(--color-text);
  font-size: var(--text-info-size);
  line-height: 1.35;
}

.notification-settings-list span {
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  line-height: 1.45;
}

.notification-settings-actions {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: 10px;
}

.notification-settings-actions :deep(button) {
  width: 100%;
  min-height: 48px;
}
</style>

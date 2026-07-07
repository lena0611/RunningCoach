<script setup lang="ts">
/**
 * SegmentTabs — 콘텐츠 내 모든 탭/전환 UI의 단일 컴포넌트 (.harness/project/tab-patterns.md).
 * variant 5종(underline/chips/segmented/pill/group) × tone 3종(ok/accent/warning).
 * 화면별 인라인 탭 재작성 금지 — 탭은 전환만 담당한다(액션은 Button).
 */
export type SegmentTabValue = string | number | boolean
export interface SegmentTabItem {
  value: SegmentTabValue
  label: string
  /** 2줄 항목(라벨 아래 보조 설명)이 필요한 폼형 segmented에서만 사용 */
  detail?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    items: SegmentTabItem[]
    active: SegmentTabValue | null
    variant?: 'underline' | 'chips' | 'segmented' | 'pill' | 'group'
    tone?: 'ok' | 'accent' | 'warning'
    ariaLabel?: string
  }>(),
  { variant: 'segmented', tone: 'ok', ariaLabel: undefined }
)

const emit = defineEmits<{ change: [value: SegmentTabValue] }>()

function onSelect(item: SegmentTabItem) {
  if (item.disabled) return
  if (item.value === props.active) return
  emit('change', item.value)
}
</script>

<template>
  <div
    class="segment-tabs"
    :class="[`st-${variant}`, `st-tone-${tone}`]"
    role="tablist"
    :aria-label="ariaLabel"
    :data-horizontal-scroll="variant === 'chips' ? '' : undefined"
  >
    <button
      v-for="item in items"
      :key="String(item.value)"
      type="button"
      role="tab"
      class="st-item"
      :class="{ active: item.value === active }"
      :aria-selected="item.value === active"
      :disabled="item.disabled"
      @click="onSelect(item)"
    >
      <span class="st-label">{{ item.label }}</span>
      <small v-if="item.detail" class="st-detail">{{ item.detail }}</small>
    </button>
  </div>
</template>

<style scoped>
/* ── tone: 활성 스킨만 바꾼다. 비활성은 variant 공통 ── */
.st-tone-ok {
  --st-bg: var(--tab-ok-bg);
  --st-text: var(--tab-ok-text);
  --st-border: var(--tab-ok-border);
  --st-solid: var(--tab-ok-solid);
}
.st-tone-accent {
  --st-bg: var(--tab-accent-bg);
  --st-text: var(--tab-accent-text);
  --st-border: var(--tab-accent-border);
  --st-solid: var(--tab-accent-solid);
}
.st-tone-warning {
  --st-bg: var(--tab-warning-bg);
  --st-text: var(--tab-warning-text);
  --st-border: var(--tab-warning-border);
  --st-solid: var(--tab-warning-solid);
}

.segment-tabs {
  display: flex;
  min-width: 0;
}

.st-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 32px;
  border: 1px solid var(--tab-inactive-border);
  background: var(--tab-inactive-bg);
  color: var(--tab-inactive-text);
  font-weight: var(--tab-inactive-weight);
  line-height: 1.2;
  cursor: pointer;
  box-shadow: none;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.st-item.active {
  background: var(--st-bg);
  border-color: var(--st-border);
  color: var(--st-text);
  font-weight: var(--tab-active-weight);
}
.st-item:disabled {
  opacity: 0.45;
  cursor: default;
}
.st-detail {
  font-size: 10px;
  font-weight: 500;
  color: inherit;
  opacity: 0.75;
}

/* ── underline: 최상위 뷰 전환 (한 화면 1개) ── */
.st-underline {
  gap: var(--tab-under-gap);
  border-bottom: 1px solid var(--tab-inactive-border);
}
.st-underline .st-item {
  position: relative;
  padding: var(--tab-under-pad);
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: var(--tab-under-font-size);
}
.st-underline .st-item.active {
  background: transparent;
  color: var(--color-text);
}
.st-underline .st-item.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(-1 * var(--tab-under-bar) / 2);
  height: var(--tab-under-bar);
  border-radius: var(--tab-under-bar);
  background: var(--st-solid);
}

/* ── chips: 가변 항목, 줄바꿈 없이 가로 스크롤 ── */
.st-chips {
  gap: var(--tab-chip-gap);
  overflow-x: auto;
  scrollbar-width: none;
}
.st-chips::-webkit-scrollbar {
  display: none;
}
.st-chips .st-item {
  flex: 0 0 auto;
  padding: var(--tab-chip-pad);
  border-radius: var(--tab-chip-radius);
  font-size: var(--tab-chip-font-size);
}

/* ── segmented: 등폭 2~4개 단일 선택 ── */
.st-segmented {
  gap: var(--tab-seg-gap);
}
.st-segmented .st-item {
  flex: 1;
  min-width: 0;
  padding: var(--tab-seg-pad);
  border-radius: var(--tab-seg-radius);
  font-size: var(--tab-seg-font-size);
}

/* ── pill: 배타적 2개 모드 토글 ── */
.st-pill {
  display: inline-flex;
  gap: var(--tab-pill-gap);
  padding: var(--tab-pill-wrap-pad);
  border: 1px solid var(--tab-inactive-border);
  border-radius: var(--tab-pill-radius);
  background: var(--tab-inactive-bg);
}
.st-pill .st-item {
  flex: 1;
  border: 0;
  border-radius: var(--tab-pill-radius);
  background: transparent;
  padding: 6px 14px;
  font-size: var(--tab-pill-font-size);
  transition: background 0.2s ease, color 0.2s ease;
}
.st-pill .st-item.active {
  background: var(--st-solid);
  color: var(--color-on-primary, #06241a);
}

/* ── group: 카드 내부 조밀 전환 (붙은 박스 + 내부 구분선) ── */
.st-group {
  gap: 0;
  border: 1px solid var(--tab-inactive-border);
  border-radius: var(--tab-group-radius);
  background: var(--color-surface);
  overflow: hidden;
}
.st-group .st-item {
  flex: 1;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: var(--tab-group-pad);
  font-size: var(--tab-group-font-size);
}
.st-group .st-item + .st-item {
  border-left: 1px solid var(--tab-inactive-border);
}
.st-group .st-item.active {
  background: var(--st-bg);
  color: var(--st-text);
}
</style>

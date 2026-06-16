<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 주간 훈련 캐러셀 (#369). 오늘 기준 한 주를 데이 스트립으로 보여주고, 선택된 날의 슬라이드를
 * 중앙에 풀 콘텐츠로 렌더한다. 슬라이드 콘텐츠는 부모가 scoped slot 으로 주입한다.
 *
 * 제스처: 영역을 data-no-swipe 로 두어 탭 홈의 좌우 스와이프(탭 전환, App.vue isSwipeBlockedTarget)
 * 와 분리한다. 그 위에서 자체 좌우 드래그 스와이프로 날짜를 넘긴다 — 탭 컨벤션과 동일하게
 * 인텐트 임계 + 방향 락(세로 우세면 페이지 스크롤 양보)으로 세로 스크롤과 충돌하지 않는다.
 * (touch-action: pan-y 로 세로 팬은 브라우저에 양보)
 */
export type CarouselDay = {
  date: string
  /** 요일+일 라벨(예: "화 16"). */
  label: string
  state: 'past' | 'today' | 'future' | 'rest' | 'done'
  /** 칩에 표시할 짧은 세션 라벨/아이콘 텍스트. */
  chip: string
}

const props = defineProps<{
  days: CarouselDay[]
  activeIndex: number
}>()

const emit = defineEmits<{
  'update:activeIndex': [index: number]
}>()

const canPrev = computed(() => props.activeIndex > 0)
const canNext = computed(() => props.activeIndex < props.days.length - 1)

function select(index: number) {
  if (index < 0 || index >= props.days.length || index === props.activeIndex) return
  emit('update:activeIndex', index)
}

// === 좌우 드래그 스와이프 (탭 컨벤션과 동일한 인텐트/방향 락) ===
const SWIPE_INTENT = 8 // 의도 판정 최소 이동(px)
const NAV_RATIO = 0.22 // 슬라이드 폭의 이 비율 넘으면 날짜 이동
const dragX = ref(0)
const dragging = ref(false)
let startX = 0
let startY = 0
let pointerId: number | null = null
let locked: 'pending' | 'horizontal' | 'vertical' | null = null

const slideStyle = computed(() => ({
  transform: `translateX(${dragX.value}px)`,
  transition: dragging.value ? 'none' : 'transform 0.2s ease'
}))

function onPointerDown(event: PointerEvent) {
  if (!event.isPrimary) return
  startX = event.clientX
  startY = event.clientY
  pointerId = event.pointerId
  locked = 'pending'
  dragX.value = 0
}

function onPointerMove(event: PointerEvent) {
  if (pointerId !== event.pointerId || !locked) return
  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (locked === 'pending') {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_INTENT) return
    if (Math.abs(dy) > Math.abs(dx)) {
      locked = 'vertical' // 세로 우세 → 페이지 스크롤에 양보
      return
    }
    locked = 'horizontal'
    dragging.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }
  if (locked !== 'horizontal') return
  event.preventDefault()
  // 양 끝에서는 저항(고무줄).
  const atEdge = (dx > 0 && !canPrev.value) || (dx < 0 && !canNext.value)
  dragX.value = atEdge ? dx * 0.3 : dx
}

function onPointerUp(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  if (locked === 'horizontal') {
    const width = (event.currentTarget as HTMLElement).clientWidth || 1
    if (dragX.value <= -width * NAV_RATIO && canNext.value) select(props.activeIndex + 1)
    else if (dragX.value >= width * NAV_RATIO && canPrev.value) select(props.activeIndex - 1)
  }
  dragX.value = 0
  dragging.value = false
  locked = null
  pointerId = null
}
</script>

<template>
  <section class="week-carousel" data-no-swipe>
    <div class="week-strip" role="tablist" aria-label="주간 훈련">
      <button
        v-for="(d, i) in days"
        :key="d.date"
        type="button"
        role="tab"
        :aria-selected="i === activeIndex"
        class="week-chip"
        :class="[`week-chip-${d.state}`, { 'week-chip-active': i === activeIndex }]"
        @click="select(i)"
      >
        <span class="week-chip-day">{{ d.label }}</span>
        <span class="week-chip-tag">{{ d.chip }}</span>
      </button>
    </div>

    <div class="week-slide-nav">
      <button type="button" class="week-arrow" :disabled="!canPrev" aria-label="이전 날" @click="select(activeIndex - 1)">‹</button>
      <div
        class="week-slide"
        :style="slideStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <slot :day="days[activeIndex]" :index="activeIndex" />
      </div>
      <button type="button" class="week-arrow" :disabled="!canNext" aria-label="다음 날" @click="select(activeIndex + 1)">›</button>
    </div>
  </section>
</template>

<style scoped>
.week-carousel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.week-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.week-strip::-webkit-scrollbar {
  display: none;
}

.week-chip {
  flex: 0 0 auto;
  min-width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid transparent;
  background: var(--color-surface-card);
  color: var(--color-muted);
  cursor: pointer;
  font-size: 11px;
}

.week-chip-active {
  border-color: var(--color-primary);
  color: var(--color-text);
  background: var(--color-primary-soft, var(--color-surface-card));
}

.week-chip-today .week-chip-day {
  color: var(--color-primary);
  font-weight: 700;
}

.week-chip-day {
  font-weight: 600;
}

.week-chip-tag {
  font-size: 10px;
  white-space: nowrap;
}

.week-chip-done .week-chip-tag::before {
  content: '✓ ';
}

.week-slide-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.week-slide {
  flex: 1;
  min-width: 0;
  /* 세로 팬은 브라우저(페이지 스크롤)에 양보, 좌우 드래그만 자체 처리 */
  touch-action: pan-y;
  will-change: transform;
}

.week-arrow {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill, 999px);
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.week-arrow:disabled {
  opacity: 0.25;
  cursor: default;
}
</style>

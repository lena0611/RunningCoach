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
  /**
   * done: 런 매칭. today/future: 예정. rest: 세션 없음(휴식).
   * open: 현재 주 지난 날 미수행(따라잡기 가능). missed: 닫힌 주 미수행 확정. skipped: 사용자 포기.
   * (past 는 레거시 — 주 고정 스트립에선 open/missed/rest 로 대체.)
   */
  state: 'past' | 'today' | 'future' | 'rest' | 'done' | 'open' | 'missed' | 'skipped'
  /** 칩에 표시할 짧은 세션 라벨/아이콘 텍스트. */
  chip: string
  /** 같은 날 더블(#455, AM+PM 2세션)이면 true → "×2 AM·PM" shoulder 배지. */
  double?: boolean
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
        :aria-label="d.double ? `${d.label} · 같은 날 2세션(오전·오후)` : undefined"
        @click="select(i)"
      >
        <span v-if="d.double" class="week-chip-double">×2</span>
        <span class="week-chip-day">{{ d.label }}</span>
        <span class="week-chip-tag">{{ d.chip }}</span>
      </button>
    </div>

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
  </section>
</template>

<style scoped>
.week-carousel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  min-width: 0;
  max-width: 100%;
}

.week-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  /* 상단 여백 = shoulder 배지(top:-7px)가 overflow 로 잘리지 않게 확보 */
  padding: 9px 0 2px;
  scrollbar-width: none;
}
.week-strip::-webkit-scrollbar {
  display: none;
}

.week-chip {
  position: relative;
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

/* 같은 날 더블(#455) shoulder 배지 — 2세션 이상인 날만(달력 run-count chip 규칙).
   컴팩트 알림형: 우상단 코너에 작게, 배경색 링으로 칩/이웃과 분리(겹침·쏠림 방지). AM·PM은 상세 패널·aria가 전달. */
.week-chip-double {
  position: absolute;
  top: -8px;
  right: -2px;
  min-width: 18px;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  padding: 2px 5px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  box-shadow: 0 0 0 2px var(--color-bg, var(--color-surface-card));
  white-space: nowrap;
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

/* 현재 주 미수행(따라잡기 가능) — 주의(amber) */
.week-chip-open {
  border-color: color-mix(in srgb, var(--color-warning) 45%, transparent);
}
.week-chip-open .week-chip-tag {
  color: var(--color-warning-text);
}
.week-chip-open .week-chip-tag::before {
  content: '⚠ ';
}

/* 닫힌 주 미수행 확정 — 더 가라앉은 amber */
.week-chip-missed .week-chip-day,
.week-chip-missed .week-chip-tag {
  color: var(--color-warning-text);
  opacity: 0.85;
}
.week-chip-missed .week-chip-tag::before {
  content: '⚠ ';
}

/* 사용자 포기 — 점선·취소선 muted */
.week-chip-skipped {
  border-style: dashed;
}
.week-chip-skipped .week-chip-tag {
  color: var(--color-muted);
  text-decoration: line-through;
}

.week-slide {
  width: 100%;
  min-width: 0;
  /* 세로 팬은 브라우저(페이지 스크롤)에 양보, 좌우 드래그만 자체 처리 */
  touch-action: pan-y;
  will-change: transform;
}
</style>

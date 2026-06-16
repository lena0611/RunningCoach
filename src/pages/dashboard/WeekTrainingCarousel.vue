<script setup lang="ts">
import { computed } from 'vue'

/**
 * 주간 훈련 캐러셀 (#369). 오늘 기준 한 주를 데이 스트립으로 보여주고, 선택된 날의 슬라이드를
 * 중앙에 풀 콘텐츠로 렌더한다. 슬라이드 콘텐츠는 부모가 scoped slot 으로 주입한다.
 *
 * 제스처: 탭 홈의 좌우 스와이프(탭 전환, tab-swipe-pager-contract)와 충돌하지 않도록 칩 탭 +
 * 화살표 네비게이션으로 동작한다. 영역은 data-no-swipe 로 탭 pager 와 분리한다.
 * 스와이프 제스처는 제스처 계약 합의 + 실기기 검증 후속(의도적 보류).
 *
 * lazy: active 가 바뀔 때 'activate' 를 emit 해 부모가 그 날 콘텐츠를 그때 채우게 한다.
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
  activate: [index: number]
}>()

const canPrev = computed(() => props.activeIndex > 0)
const canNext = computed(() => props.activeIndex < props.days.length - 1)

function select(index: number) {
  if (index < 0 || index >= props.days.length || index === props.activeIndex) return
  emit('update:activeIndex', index)
  emit('activate', index)
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
      <div class="week-slide">
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

<script setup lang="ts">
import type { CarouselDay } from '@/pages/coach/WeekTrainingCarousel.vue'

/**
 * 요약 홈 주간 스트립(리디자인 ①b) — 월~일 7요일 칩(주간 SSOT = 월요일 시작, useTrainingWeek.scheduleDays).
 * 오늘 = primary 테두리 강조, 요일별 스케줄 세션 타입 dot(run-type-* 타입색), 완료한 날 ✓, 선언 휴식 💤.
 * 인터랙션은 최소(YAGNI): 탭하면 코치 탭(주간 캐러셀)으로 이동만 한다.
 */
defineProps<{ days: CarouselDay[]; today: string }>()
const emit = defineEmits<{ select: [] }>()

function weekdayOf(day: CarouselDay): string {
  return day.label.split(' ')[0] ?? ''
}
function dayNumOf(day: CarouselDay): string {
  return String(Number(day.date.slice(8, 10)))
}
/** RunTypeIcon/RunTypeBadge 와 동일 슬러그 규칙 — 전역 run-type-* 색 변수를 재사용한다. */
function typeSlug(type: string): string {
  return type.toLowerCase().replaceAll(' ', '-').replaceAll('+', 'plus')
}
</script>

<template>
  <div class="week-strip" role="group" aria-label="이번 주 훈련 일정">
    <button
      v-for="day in days"
      :key="day.date"
      type="button"
      class="week-strip-day"
      :class="{ 'is-today': day.date === today }"
      :aria-label="`${day.label} · ${day.chip} — 코치 탭에서 보기`"
      @click="emit('select')"
    >
      <span class="week-strip-weekday">{{ weekdayOf(day) }}</span>
      <span class="week-strip-date num-mono">{{ dayNumOf(day) }}</span>
      <span class="week-strip-mark" aria-hidden="true">
        <template v-if="day.state === 'done'">✓</template>
        <template v-else-if="day.state === 'rested'">💤</template>
        <i v-else-if="day.type" class="week-strip-dot" :class="`run-type-${typeSlug(day.type)}`" />
      </span>
    </button>
  </div>
</template>

<style scoped>
.week-strip {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.week-strip-day {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0 7px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-chip, 8px);
  background: var(--color-surface);
  box-shadow: none;
  cursor: pointer;
}

.week-strip-weekday {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-muted-2);
  line-height: 1;
}

.week-strip-date {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-muted);
  line-height: 1;
}

.week-strip-mark {
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  line-height: 1;
  color: var(--color-primary);
}

/* 전역 run-type-* 클래스가 이 요소에 --run-type-color 를 지정한다. */
.week-strip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--run-type-color, var(--color-muted));
}

/* 오늘 강조 = primary(green) 테두리 (디자인 Row5 FINAL) */
.week-strip-day.is-today {
  border: 1.5px solid var(--color-primary);
  background: var(--color-primary-soft);
}
.week-strip-day.is-today .week-strip-weekday,
.week-strip-day.is-today .week-strip-date {
  color: var(--color-primary);
  font-weight: 800;
}
</style>

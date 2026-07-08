<script setup lang="ts">
/**
 * WeekStrip — 요약 홈 날짜 스트립 (.harness/project/tab-patterns.md).
 * 월~일 7칸 등폭, 오늘 = primary 링, 상태 마커(완료 ✓ / 선언휴식 💤 / 예정 타입 dot).
 * 지오메트리·색은 --weekstrip-* 토큰만 참조한다.
 * 인터랙션은 최소(YAGNI): 탭하면 select emit (요약 홈에선 코치 탭 이동).
 */
export interface WeekStripDay {
  date: string
  /** 요일+일 라벨(예: "화 16") — 첫 토큰을 요일로 쓴다. */
  label: string
  /** done: 완료 ✓ · rested: 선언 휴식 💤 · 그 외 type 있으면 타입색 dot */
  state: string
  /** 접근성 라벨용 짧은 세션 설명 */
  chip: string
  type?: string | null
}

defineProps<{ days: WeekStripDay[]; today: string }>()
const emit = defineEmits<{ select: [] }>()

function weekdayOf(day: WeekStripDay): string {
  return day.label.split(' ')[0] ?? ''
}
function dayNumOf(day: WeekStripDay): string {
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
  gap: var(--weekstrip-gap);
  min-width: 0;
}

.week-strip-day {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--weekstrip-cell-pad);
  border: 1px solid var(--tab-inactive-border);
  border-radius: var(--weekstrip-cell-radius);
  background: var(--color-surface);
  box-shadow: none;
  cursor: pointer;
}

.week-strip-weekday {
  font-size: var(--weekstrip-day-size);
  font-weight: 600;
  color: var(--tab-inactive-text);
  line-height: 1;
}

.week-strip-date {
  font-size: var(--weekstrip-date-size);
  font-weight: 700;
  color: var(--color-muted);
  line-height: 1;
}

.week-strip-mark {
  height: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-micro-size);
  line-height: 1;
  color: var(--color-primary);
}

/* 전역 run-type-* 클래스가 이 요소에 --run-type-color 를 지정한다. 크기 기준 = 완료 도트 토큰 +2px */
.week-strip-dot {
  width: calc(var(--weekstrip-done-dot) + 2px);
  height: calc(var(--weekstrip-done-dot) + 2px);
  border-radius: 50%;
  background: var(--run-type-color, var(--color-muted));
}

.week-strip-day.is-today {
  border: var(--weekstrip-today-border);
  background: var(--weekstrip-today-bg);
}
.week-strip-day.is-today .week-strip-weekday,
.week-strip-day.is-today .week-strip-date {
  color: var(--color-primary);
  font-weight: 800;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
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
  /** 같은 날 더블(#455, AM+PM 2세션)이면 ×2 shoulder 배지. */
  double?: boolean
}

const props = defineProps<{
  days: WeekStripDay[]
  today: string
  /**
   * 선택된 날짜(#745). 주면 **선택 위젯**이 된다 — 코치 탭의 데이 스트립이 이 모드로 쓴다
   * (tablist/tab/aria-selected + 활성 스킨). 안 주면 요약 홈의 단순 프리뷰(role=group)다.
   *
   * 이렇게 한 컴포넌트로 합친 이유: 같은 "한 주"를 두 탭이 서로 다른 모양으로 보여줘 사용자가
   * 다른 것으로 읽었다. 캐러셀의 제스처·슬라이드는 그대로 두고 **스트립만** 공유한다
   * (tab-patterns §6 이 경계한 건 위젯 통째 이전이지 시각 언어 통일이 아니다).
   */
  active?: string | null
}>()
// 선택한 **날짜**를 실어 보낸다(#745). 예전엔 payload 없이 select 만 올려서 요약에서 3일을 눌러도
// 코치 탭은 오늘로 열렸다 — 사용자가 고른 날이 사라지는 조용한 유실이었다.
const emit = defineEmits<{ select: [date: string] }>()

function weekdayOf(day: WeekStripDay): string {
  return day.label.split(' ')[0] ?? ''
}
function dayNumOf(day: WeekStripDay): string {
  return String(Number(day.date.slice(8, 10)))
}
const selectable = computed(() => props.active !== undefined && props.active !== null)
/** 선택 모드면 "고르기", 프리뷰면 "코치 탭에서 보기" — 실제로 일어나는 일을 말한다. */
function ariaLabelOf(day: WeekStripDay): string {
  const double = day.double ? ' · 같은 날 2세션(오전·오후)' : ''
  return `${day.label} · ${day.chip}${double}${selectable.value ? '' : ' — 코치 탭에서 보기'}`
}
/** RunTypeIcon/RunTypeBadge 와 동일 슬러그 규칙 — 전역 run-type-* 색 변수를 재사용한다. */
function typeSlug(type: string): string {
  return type.toLowerCase().replaceAll(' ', '-').replaceAll('+', 'plus')
}
</script>

<template>
  <div class="week-strip" :role="selectable ? 'tablist' : 'group'" aria-label="이번 주 훈련 일정">
    <button
      v-for="day in days"
      :key="day.date"
      type="button"
      :role="selectable ? 'tab' : undefined"
      :aria-selected="selectable ? day.date === props.active : undefined"
      class="week-strip-day"
      :class="{ 'is-today': day.date === today, 'is-active': selectable && day.date === props.active }"
      :aria-label="ariaLabelOf(day)"
      @click="emit('select', day.date)"
    >
      <span v-if="day.double" class="week-strip-double" aria-hidden="true">×2</span>
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
/*
  선택 모드(#745, 코치 탭). 활성은 색+굵기+보더 3중으로 표시한다(tab-patterns §5 — 색만으로 구분 금지).
  '오늘'과 '선택'은 다른 축이라 함께 붙을 수 있다 — 선택이 더 강한 신호이므로 뒤에 둬 우선한다.
*/
.week-strip-day.is-active {
  border-color: var(--tab-ok-border);
  background: var(--tab-ok-bg);
}
.week-strip-day.is-active .week-strip-weekday,
.week-strip-day.is-active .week-strip-date {
  color: var(--tab-ok-text);
  font-weight: 800;
}
/* 같은 날 더블(#455) shoulder 배지 — 칸 우상단에 겹쳐 레이아웃을 밀지 않는다. */
.week-strip-day {
  position: relative;
}
.week-strip-double {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: var(--text-micro-size);
  font-weight: 700;
  color: var(--color-muted-2);
  line-height: 1;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
/**
 * WeekStrip — 요약·코치 공용 날짜 스트립 (.harness/project/tab-patterns.md).
 * 월~일 7칸 등폭. 날짜는 **원형 인디케이터**가 감싸고(애플 날씨식), 채움색으로 오늘과 그 외를 가른다:
 * 오늘 = primary, 오늘이 아닌 선택일 = 흰색.
 *
 * 상태는 **원 안팎에 싣는다**(기록 탭 달력과 같은 언어, 2026-09-03): 예정 세션 타입 = 타입색 옅은 채움,
 * 완료 = 타입색 링, 선언 휴식 = 중립 채움. 예전엔 날짜 아래 별도 줄에 dot/✓/💤 를 찍어
 * 줄이 하나 더 필요했고, 같은 칸의 정보가 두 층으로 흩어졌다.
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
  // 상태를 색/링으로만 두면 스크린리더에 사라진다(tab-patterns §5 — 색만으로 구분 금지).
  const state = day.state === 'done' ? ' · 완료' : day.state === 'rested' ? ' · 휴식' : ''
  return `${day.label} · ${day.chip}${state}${double}${selectable.value ? '' : ' — 코치 탭에서 보기'}`
}
/**
 * 원형 채움 대상인가. 선택 모드(코치)면 **고른 날**, 프리뷰(요약)면 **오늘**이 채워진다 —
 * 요약엔 선택 개념이 없어 오늘을 안 채우면 스트립에 초점이 하나도 없다.
 * 채움색은 CSS 가 is-today 로 가른다(오늘 primary / 그 외 흰색).
 */
function isFilled(day: WeekStripDay): boolean {
  return selectable.value ? day.date === props.active : day.date === props.today
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
      <span
        class="week-strip-disc"
        :class="[
          {
            'is-filled': isFilled(day),
            'is-done': day.state === 'done',
            'is-rested': day.state === 'rested',
            'has-session': Boolean(day.type) && day.state !== 'rested'
          },
          day.type ? `run-type-${typeSlug(day.type)}` : ''
        ]"
      >
        <span class="week-strip-date num-mono">{{ dayNumOf(day) }}</span>
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
  /* 요일 글자와 날짜 원 사이 숨 — 붙어 있으면 두 줄이 한 덩어리로 뭉쳐 읽힌다(2026-09-03). */
  gap: var(--weekstrip-label-gap);
  padding: var(--weekstrip-cell-pad);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
}

/* 날짜를 감싸는 원 — 상태(채움·링)를 여기 싣는다. 비어 있어도 자리를 지켜 줄이 흔들리지 않는다. */
.week-strip-disc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--weekstrip-disc-size);
  height: var(--weekstrip-disc-size);
  border-radius: 50%;
  background: transparent;
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

/*
  상태 스킨(기록 탭 달력과 같은 언어). 전역 run-type-* 클래스가 이 요소에 --run-type-color 를 준다.
  예정 세션 = 타입색 옅은 채움 / 완료 = 타입색 링 / 선언 휴식 = 중립 채움.
*/
.week-strip-disc.has-session {
  background: color-mix(in srgb, var(--run-type-color, var(--color-primary)) var(--weekstrip-type-fill-mix), transparent);
}
.week-strip-disc.has-session .week-strip-date {
  color: color-mix(in srgb, var(--run-type-color, var(--color-primary)) 85%, var(--color-text));
}
.week-strip-disc.is-done {
  box-shadow: var(--weekstrip-ring);
}
.week-strip-disc.is-rested {
  background: var(--weekstrip-rest-fill);
}

/* 오늘은 채워지지 않아도 숫자를 primary 로 — 애플 날씨가 '오늘'을 늘 색으로 표시하는 것과 같다. */
.week-strip-day.is-today .week-strip-disc:not(.is-filled) .week-strip-date {
  color: var(--color-primary);
}
/* 채움: 오늘 = primary, 오늘이 아닌 선택일 = 흰색. 대비색은 각 토큰 짝으로 고정한다. */
.week-strip-disc.is-filled {
  background: var(--weekstrip-active-fill);
}
.week-strip-disc.is-filled .week-strip-date {
  color: var(--weekstrip-active-fill-text);
  font-weight: 800;
}
.week-strip-day.is-today .week-strip-disc.is-filled {
  background: var(--weekstrip-today-fill);
}
.week-strip-day.is-today .week-strip-disc.is-filled .week-strip-date {
  color: var(--weekstrip-today-fill-text);
}


.week-strip-day.is-today .week-strip-weekday {
  color: var(--color-primary);
  font-weight: 800;
}
/*
  선택 모드(#745, 코치 탭). 활성 표시는 색만이 아니라 **채운 원 + 굵기**로 준다(tab-patterns §5).
  '오늘'과 '선택'은 다른 축이라 함께 붙을 수 있고, 그때는 오늘 색(primary)이 이긴다 — 위 is-today 규칙.
*/
.week-strip-day.is-active .week-strip-weekday {
  color: var(--color-text);
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

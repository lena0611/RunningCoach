<script setup lang="ts">
import { computed, ref } from 'vue'
import WeekStrip from '@/shared/ui/WeekStrip.vue'

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
   * rested: 사용자가 선언한 휴식 기간(#473) — 차분한 💤, 경고색·취소선 없음(missed/skipped 와 구분).
   * (past 는 레거시 — 주 고정 스트립에선 open/missed/rest 로 대체.)
   */
  state: 'past' | 'today' | 'future' | 'rest' | 'done' | 'open' | 'missed' | 'skipped' | 'rested'
  /** 칩에 표시할 짧은 세션 라벨/아이콘 텍스트. */
  chip: string
  /** 그 날의 런/표시 세션 타입(RunType) — 요약 홈 WeekStrip 의 타입색 dot 용. 없으면 null. */
  type?: string | null
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

/** 공유 스트립은 날짜를 준다(#745) — 인덱스 계약은 이 컴포넌트 안에만 남긴다. */
const activeDate = computed(() => props.days[props.activeIndex]?.date ?? null)
/** 오늘 표시는 스트립이 담당한다. 캐러셀은 '오늘' 개념을 따로 안 들고 있어 로컬 날짜로 만든다. */
const todayDate = computed(() => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
})
function selectByDate(date: string) {
  select(props.days.findIndex((d) => d.date === date))
}

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
    <!--
      데이 스트립은 요약 홈과 **같은 컴포넌트**를 쓴다(#745). 예전엔 코치만 다른 칩(세션명 텍스트)이라
      같은 "한 주"가 탭마다 다른 것으로 읽혔다. 세션명은 바로 아래 슬라이드가 전부 보여주므로
      스트립에서 빠져도 정보가 사라지지 않는다. 제스처·슬라이드는 이 컴포넌트가 그대로 소유한다
      (tab-patterns §6 이 경계한 건 위젯 통째 이전이지 시각 언어 통일이 아니다).
    -->
    <WeekStrip :days="days" :today="todayDate" :active="activeDate" @select="selectByDate" />

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



/* 같은 날 더블(#455) shoulder 배지 — 2세션 이상인 날만(달력 run-count chip 규칙).
   컴팩트 알림형: 우상단 코너에 작게, 배경색 링으로 칩/이웃과 분리(겹침·쏠림 방지). AM·PM은 상세 패널·aria가 전달. */






/* 현재 주 미수행(따라잡기 가능) — 주의(amber) */

/* 닫힌 주 미수행 확정 — 더 가라앉은 amber */

/* 사용자 포기 — 점선·취소선 muted */

/* 선언한 휴식(#473) — 차분한 회복. 경고색·취소선 금지(쉬는 건 실패가 아니다).
   부드러운 primary-soft 틴트로 "의도된·돌봄받는 휴식"을 표현하고, 라벨은 💤(scheduleDays 가 주입). */

.week-slide {
  width: 100%;
  min-width: 0;
  /* 세로 팬은 브라우저(페이지 스크롤)에 양보, 좌우 드래그만 자체 처리 */
  touch-action: pan-y;
  will-change: transform;
}
</style>

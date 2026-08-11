<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
// 웹컴포넌트 <hover-tilt> 등록 (스프링 물리·터치 처리 내장)
import 'hover-tilt/vue'
import TrophyIcon from './TrophyIcon.vue'
import { trophyArtFor } from './trophyArt'
import type { TrophyCardItem } from './trophyCatalog'

/**
 * 전리품 카드 — **앱에서 전리품 카드가 나오는 모든 자리가 이 컴포넌트 하나다** (디자인 핸드오프
 * `trophy-cards.md` §1 HoloTrophyCard).
 *
 * 왜 하나여야 하나: 예전엔 자리마다 다른 컴포넌트였다 — 홈 스트립은 선 픽토그램 타일(`TrophyTile`),
 * 컬렉션은 밝은 카드지, 상세는 검정+금박 금속 카드(`TrophySkinCard`). **한 카드의 얼굴이 세 개**라서
 * 홈에서 본 카드와 컬렉션에서 본 카드가 같은 카드로 보이지 않았다(2026-08-11 실기기 지적). 수집이
 * 목적인 기능에서 카드 정체성이 갈리면 컬렉션이 성립하지 않는다.
 *
 * 핸드오프 프리셋은 `classic-sunbeam` — **밝은 카드지 + 아트창 안 스펙트럼 회절띠 + 얇은 교차광**.
 * 명세에 "다크 금속 카드가 아님"이 못박혀 있다. 금속 카드(2026-07 리스킨)는 이 카드로 대체됐다.
 *
 * ⚠️ 색을 토큰으로 안 올린 이유: 기존 `--trophy-*` 토큰은 **다크 배경 타일용**(bg-a #3a2f12 …)이고,
 * 이 카드는 정반대인 **밝은 카드지에 어두운 잉크**다. 두 표면이 같은 이름을 공유하면 서로를 오염시킨다.
 * 카드지 팔레트는 이 컴포넌트 한 곳에서만 쓰이므로 여기 스코프한다(티어 액센트는 공용 토큰 재사용).
 *
 * 틸트·포인터 추적은 `hover-tilt` 가 담당하고, 포일/시닌/스페큘러는 그가 노출하는 CSS 변수
 * (`--hover-tilt-x/y` 0..1, `--hover-tilt-opacity` 활성도)로 **순수 CSS** 구동한다 —
 * 포인터 리스너를 직접 달지 않아 reduced-motion·터치·스크롤 취소가 라이브러리와 함께 움직인다.
 *
 * 잠금 카드는 같은 골격에 점선 보더 + 무채색 엠블럼 + 진행바로만 달라진다(별도 컴포넌트를 만들지 않는다 —
 * 획득/미획득이 같은 컬렉션에 나란히 서므로 구조가 어긋나면 그리드가 들쭉날쭉해진다).
 */
const props = withDefaults(
  defineProps<{
    card: TrophyCardItem
    /**
     * `thumb` 홈 스트립(≈80px) · `grid` 컬렉션(240×330) · `full` 상세 모달(300×420).
     *
     * thumb 에서 제목·스탯·근거·푸터를 지우는 건 취향이 아니라 물리다 — 80px 폭에 그 줄들을 넣으면
     * 전부 두세 글자에서 잘린다. 대신 카드지·티어보더·아트는 그대로 남겨 **같은 카드로 보이게** 한다.
     */
    size?: 'thumb' | 'grid' | 'full'
    /** 모달처럼 눌러서 갈 곳이 없는 자리에선 false — 아무 일도 안 하는 버튼을 만들지 않는다. */
    clickable?: boolean
    /**
     * 뒤집을 수 있는 카드(뒷면 보유). 기본은 `full` 만 — 실물 카드처럼 뒤집는 건 카드 하나를
     * 손에 든 상태(상세)에서 의미가 있고, 그리드/스트립에서 카드가 뒤집히면 목록이 소란스러워진다.
     */
    flippable?: boolean
  }>(),
  { size: 'grid', clickable: true, flippable: undefined }
)
const emit = defineEmits<{ select: [] }>()

const earned = computed(() => props.card.earned)
const canFlip = computed(() => props.flippable ?? props.size === 'full')

/**
 * 포인터를 따라 기울이는가. **상세(`full`)에서만.**
 *
 * 목록에서 카드가 터치를 받으면 그만큼 문서 스크롤이 죽는다 — 컬렉션은 화면이 카드로 가득해서
 * 스크롤을 시작할 여백이 없었다. 카드 한 장을 손에 든 상태(상세)에서만 반응하게 두고, 목록에서는
 * 정적 인쇄물처럼 둔다. 틸트가 없으면 `--hover-tilt-*` 변수도 없으므로 포일·시닌은 기본값
 * (정지 상태)으로 그려진다.
 */
const tilts = computed(() => props.size === 'full')

/** 뒷면 표시 상태. 카드를 누르면 뒤집힌다(상세에서만 — 그리드에선 누름이 '열기'다). */
const flipped = ref(false)

/**
 * 뒷면 DOM 존재 여부. **처음 뒤집을 때 비로소 만든다.**
 *
 * 뒷면도 카드 한 장 전체(그라디언트 카드지 + 문양)라, 항상 매달아 두면 아무도 안 뒤집는 카드까지
 * 두 장씩 그려 둔 셈이 된다. 뒤집기는 명시적인 탭 한 번으로만 일어나므로 그때 만들면 충분하다.
 */
const hasBack = ref(false)

/**
 * 뒤집는 중 여부. **iOS 에서 3D 회전이 버벅이는 원인이 여기 있다.**
 *
 * 카드 안에는 `mix-blend-mode` 레이어가 5장(에치·시닌·스페큘러·아트 포일·아트 시닌) 있고, 블렌드는
 * GPU 가 레이어를 독립 합성하지 못하게 만든다. 동심원·격자 같은 radial/repeating 그라디언트도
 * 프레임마다 다시 그려진다. 뒤집는 0.6초 동안만 그 레이어들을 끄고, 멈추면 **한 프레임에 스냅으로**
 * 되돌린다 — 페이드로 되돌리면 그 페이드가 다시 프레임을 잡아먹는다(트레이스 실측: 복귀 페이드
 * 구간에 DroppedFrame 10개 연속).
 */
const animating = ref(false)

function endAnimating() {
  animating.value = false
}

async function onCardClick() {
  if (canFlip.value) {
    animating.value = true
    // 뒷면을 먼저 DOM 에 올리고 다음 프레임에 뒤집는다 — 같은 프레임에 만들면서 돌리면
    // 뒷면이 래스터되기 전에 회전이 시작돼 첫 프레임이 빈 채로 지나간다.
    if (!hasBack.value) {
      hasBack.value = true
      await nextTick()
    }
    flipped.value = !flipped.value
    return
  }
  if (props.clickable) emit('select')
}
const isThumb = computed(() => props.size === 'thumb')

/** 카드 전용 아트(금속 릴리프). 없는 카드는 픽토그램으로 폴백한다 — 수치가 각인돼 돌려 쓸 수 없다. */
const art = computed(() => trophyArtFor(props.card))

/** 우상단 메트릭 — 배지 접두어(PR 등)까지 붙여 카드 종류를 한눈에 읽게. */
const metric = computed(() => {
  const { badgePrefix, badgeValue } = props.card
  return badgePrefix ? `${badgePrefix} ${badgeValue}` : badgeValue
})

/**
 * thumb 전용 짧은 제목. "10K 자기기록"은 80px 폭에서 두 줄로 깨지므로 카드 종류가 드러나는
 * 최소 표기로 줄인다(획득 카드는 값까지 — 스트립에서 값이 보이는 게 자랑거리다).
 */
const shortTitle = computed(() => {
  const c = props.card
  switch (c.kind) {
    case 'pb':
      return `${c.badgeValue} PR`
    case 'milestone':
      return `첫 ${c.badgeValue}`
    case 'streak':
      return earned.value ? `${c.valueText} 스트릭` : '스트릭'
    case 'weekly':
      return earned.value ? `주 ${c.valueText}` : '주간 최다'
    case 'monthly':
      return earned.value ? `월 ${c.valueText}` : '월간 최다'
    default:
      return c.title.replace('누적 ', '')
  }
})

const statLabel = computed(() => {
  if (earned.value) return props.card.statLabel ?? '기록'
  return props.card.progress?.label ?? '진행'
})

const statValue = computed(() => {
  if (earned.value) return props.card.valueText ?? '—'
  return props.card.progress?.valueText ?? '미기록'
})

const dateText = computed(() => (earned.value ? (props.card.achievedAt ?? '').replaceAll('-', '.') || '획득' : '미획득'))

const progressPct = computed(() => {
  const p = props.card.progress
  if (!p || p.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.current / p.target) * 100)))
})
</script>

<template>
  <!-- 틸트가 필요한 자리(상세)만 <hover-tilt> 로 감싼다. 썸네일·그리드는 정적 div —
       tilt-factor 를 0 으로 죽이는 것과 다르다: hover-tilt 는 포인터/터치 리스너를 붙이므로,
       화면이 카드로 가득한 컬렉션에서 **카드가 터치를 받아 문서 스크롤로 넘어가지 않았다**
       (2026-08-11 사용자 진단). 리스너가 아예 없어야 터치가 그대로 흘러간다. -->
  <component
    :is="tilts ? 'hover-tilt' : 'div'"
    class="htc-frame"
    :tilt-factor="tilts ? (earned ? -0.9 : -0.5) : undefined"
    :scale-factor="tilts ? (earned ? 1.05 : 1.025) : undefined"
    :glare-intensity="tilts ? 0 : undefined"
    :exit-delay="tilts ? 150 : undefined"
  >
    <div
      class="htc-flip"
      :class="[`flip-${size}`, { 'is-flipped': flipped, 'is-animating': animating }]"
      @transitionend="endAnimating"
    >
    <component
      :is="clickable || canFlip ? 'button' : 'div'"
      :type="clickable || canFlip ? 'button' : undefined"
      class="htc htc-face htc-front"
      :class="[`tier-${card.tier}`, `size-${size}`, { locked: !earned }]"
      :aria-label="canFlip ? `${card.title} — 뒤집어 발급 규칙 보기` : `${card.title} — ${earned ? '획득' : '미획득'}`"
      @click="onCardClick"
    >
      <span class="htc-etch" aria-hidden="true" />
      <span class="htc-inner-frame" aria-hidden="true" />

      <span class="htc-head">
        <span class="htc-tier">{{ earned ? card.tier.toUpperCase() : 'LOCKED' }}</span>
        <span v-if="!isThumb" class="htc-metric">{{ metric }}</span>
      </span>

      <span v-if="!isThumb" class="htc-title">{{ card.title }}</span>

      <span class="htc-art">
        <span class="htc-art-rings" aria-hidden="true" />
        <span class="htc-art-ground" aria-hidden="true" />
        <span class="htc-art-foil" aria-hidden="true" />
        <span class="htc-art-shine" aria-hidden="true" />
        <img v-if="art" class="htc-emblem htc-emblem-art" :src="art" :alt="card.title" width="384" height="384" loading="lazy" decoding="async" />
        <TrophyIcon v-else class="htc-emblem" :kind="card.kind" :locked="!earned" :size="isThumb ? 26 : 64" />
      </span>

      <span v-if="isThumb" class="htc-thumb-label">{{ shortTitle }}</span>

      <template v-else>
        <span class="htc-stat">
          <span v-if="earned" class="htc-stat-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5" /></svg>
          </span>
          <span class="htc-stat-label">{{ statLabel }}</span>
          <span class="htc-stat-value">{{ statValue }}</span>
        </span>

        <span v-if="!earned && card.progress" class="htc-progress" aria-hidden="true">
          <span class="htc-progress-fill" :style="{ width: `${progressPct}%` }" />
        </span>

        <!-- 달성 근거 — 획득이면 "무엇으로 받았나", 미획득이면 "어떻게 열리나". 둘 다 카드에 남을 값이다. -->
        <span v-if="card.description" class="htc-why">{{ card.description }}</span>

        <span class="htc-foot">
          <span>{{ dateText }}</span>
          <span>{{ earned ? 'HOLO' : '잠금' }}</span>
        </span>
      </template>

      <span class="htc-shine" aria-hidden="true" />
      <span class="htc-specular" aria-hidden="true" />
    </component>

    <!-- 뒷면 — 실물 카드 뒷면처럼 로고와 문양만. 정보는 앞면이 다 갖고 있고, 뒷면에 정보를 또
         쌓으면 카드가 아니라 설명서가 된다. -->
    <button
      v-if="hasBack"
      type="button"
      class="htc htc-face htc-back"
      :class="[`tier-${card.tier}`, `size-${size}`, { locked: !earned }]"
      :aria-label="`${card.title} 뒷면 — 앞면으로 돌리기`"
      @click="onCardClick"
    >
      <span class="htc-inner-frame" aria-hidden="true" />
      <span class="htc-back-guilloche" aria-hidden="true" />

      <span class="htc-back-mark">
        <span class="htc-back-brand">PACELAB</span>
        <span class="htc-back-rule-line" aria-hidden="true" />
        <span class="htc-back-sub">TROPHY COLLECTION</span>
      </span>

      <span class="htc-shine" aria-hidden="true" />
    </button>
    </div>
  </component>
</template>

<style scoped>
.htc-frame {
  display: block;
  width: 100%;
  /* 세로 팬은 항상 브라우저에 넘긴다. 예전엔 `none` 이라 카드 위에서 시작한 드래그를 카드가 삼켜
     컬렉션이 스크롤되지 않았다(데스크톱 휠로는 멀쩡해 QA에서 안 잡혔다). 목록 카드는 이제
     hover-tilt 를 아예 붙이지 않지만, 상세에서 틸트할 때도 세로 팬을 막을 이유는 없다. */
  touch-action: pan-y;
}

/* 카드지 팔레트 — 티어별. 밝은 종이 + 어두운 잉크(디자인 "Trophy Collection"). */
.htc {
  --stock: linear-gradient(178deg, #f4f6fa, #e8ecf2 42%, #d8dee7);
  --edge: #aab3bf;
  --edge-in: rgba(120, 134, 152, 0.45);
  --art-bg: linear-gradient(168deg, #fbfcfe, #e9edf3 60%, #d9dfe8);
  --ring: rgba(120, 134, 152, 0.14);
  --ground: rgba(120, 134, 152, 0.14);
  --spot: 0.9;
  --ink: #1e2530;
  --sub-ink: #6b7686;
  --chip-ink: #2a323d;
  --chip-bg: linear-gradient(180deg, #f0f3f7, #c8d0da);
  --chip-edge: #a3adba;
  --stat-bg: rgba(120, 134, 152, 0.13);
  --stat-edge: rgba(120, 134, 152, 0.3);
  --frame-style: solid;
  /* TrophyIcon 은 --tc-chip/--tc-text 로 칠한다(원래는 다크 타일용 변수). 정의하지 않으면
     fill 은 초기값 black 으로, **stroke 는 none 으로 떨어져 아이콘이 통째로 사라진다**
     (2026-08-11 실측: 주간·월간·클럽 엠블럼이 안 보였다). 카드지 잉크로 매핑해 두 톤으로 칠한다. */
  --tc-chip: var(--ink);
  --tc-text: var(--sub-ink);

  /* 사이즈 다이얼 — 세 자리(thumb/grid/full)가 같은 골격을 쓰고 이 값들만 갈아끼운다. */
  --pad: 12px;
  --radius: 16px;
  --bw: 2px;
  --emblem-w: 66%;

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  /* 근거 설명 한 줄이 들어가면서 240/290 에서 높아졌다 — 아트창을 깎는 대신 카드를 키웠다.
     아트가 이 카드의 주인공이고, 그리드 카드에서 아트가 작아지면 컬렉션의 인상이 무너진다. */
  aspect-ratio: 240 / 330;
  padding: var(--pad) var(--pad) calc(var(--pad) - 1px);
  border: var(--bw) var(--frame-style) var(--edge);
  border-radius: var(--radius);
  background: var(--stock);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  color: var(--ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  /* 카드 내부의 무효화가 바깥으로 새지 않게 한다 — 회전 중 합성 범위를 카드로 묶는다.
     카드는 이미 overflow:hidden 이라 페인트 격리로 잘리는 것도 없다. */
  contain: paint;
}

.htc.tier-gold {
  --stock: linear-gradient(178deg, #f2e8c6, #eee3bd 42%, #e3d5a8);
  --edge: var(--trophy-gold-border);
  --edge-in: rgba(154, 124, 44, 0.5);
  --art-bg: linear-gradient(168deg, #fbf5df, #efe4bf 60%, #e4d5a5);
  --ring: rgba(154, 124, 44, 0.15);
  --ground: rgba(154, 124, 44, 0.14);
  --spot: 0.85;
  --ink: #2c2412;
  --sub-ink: #7a6a3c;
  --chip-ink: #3b2f10;
  --chip-bg: linear-gradient(180deg, #f0d78d, #d9b44a);
  --chip-edge: #b3903c;
  --stat-bg: rgba(154, 124, 44, 0.14);
  --stat-edge: rgba(154, 124, 44, 0.3);
}

.htc.tier-silver {
  --edge: var(--trophy-silver-border);
}

.htc.tier-bronze {
  --stock: linear-gradient(178deg, #f6e8da, #eddcc9 42%, #e0cab1);
  --edge: var(--trophy-bronze-border);
  --edge-in: rgba(150, 100, 60, 0.45);
  --art-bg: linear-gradient(168deg, #fdf4ea, #f0e0cd 60%, #e5d0b6);
  --ring: rgba(150, 100, 60, 0.15);
  --ground: rgba(150, 100, 60, 0.14);
  --spot: 0.85;
  --ink: #33241a;
  --sub-ink: #87664c;
  --chip-ink: #3f2a18;
  --chip-bg: linear-gradient(180deg, #e8b98d, #c98a56);
  --chip-edge: #a9713f;
  --stat-bg: rgba(150, 100, 60, 0.14);
  --stat-edge: rgba(150, 100, 60, 0.3);
}

/* 잠금 — 골격은 그대로, 채도와 프레임만 죽인다(그리드 정렬 유지). */
.htc.locked {
  --stock: linear-gradient(178deg, #e9ebee, #dfe2e7 45%, #d2d6dd);
  --edge: #a8afb9;
  --edge-in: rgba(130, 138, 150, 0.5);
  --art-bg: #e4e7ec;
  --ring: rgba(130, 138, 150, 0.1);
  --ground: rgba(130, 138, 150, 0.1);
  --spot: 0.55;
  --ink: #5b6472;
  --sub-ink: #78818e;
  --chip-ink: #6b7280;
  --chip-bg: #cdd2d9;
  --chip-edge: #b3bac3;
  --stat-bg: rgba(130, 138, 150, 0.14);
  --stat-edge: rgba(130, 138, 150, 0.28);
  --frame-style: dashed;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
}

/* 대각 에치 — 카드지의 인쇄 질감. overlay 라 밝은 종이 위에서만 은은하게 뜬다. */
.htc-etch {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: var(--radius);
  pointer-events: none;
  mix-blend-mode: overlay;
  opacity: 0.22;
  background:
    repeating-linear-gradient(52deg, transparent 0 20px, #63e8ff 21px 22px, transparent 23px 42px),
    repeating-linear-gradient(132deg, transparent 0 27px, #fff08a 28px 29px, transparent 30px 54px);
}
.htc.locked .htc-etch {
  opacity: 0;
}

.htc-inner-frame {
  position: absolute;
  inset: 5px;
  z-index: 2;
  border: 1.5px var(--frame-style) var(--edge-in);
  border-radius: 12px;
  pointer-events: none;
}

.htc-head,
.htc-title,
.htc-art,
.htc-stat,
.htc-progress,
.htc-why,
.htc-foot {
  position: relative;
  z-index: 4;
}

.htc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.htc-tier {
  font: 800 9px/1 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--chip-ink);
  background: var(--chip-bg);
  border: 1px solid var(--chip-edge);
  border-radius: 4px;
  padding: 3px 7px;
}
.htc-metric {
  font: 700 11px/1 var(--font-mono);
  color: var(--sub-ink);
  font-variant-numeric: tabular-nums;
}

.htc-title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  word-break: keep-all;
}

.htc-art {
  flex: 1;
  /* min-height:0 이 없으면 flex 아이템이 콘텐츠 높이 아래로 줄지 못해, 진행바가 붙는 잠금 카드가
     aspect-ratio 박스를 밀어내 획득 카드보다 높아진다(그리드 행이 어긋남). 아트창이 차이를 흡수한다. */
  min-height: 0;
  margin-top: 8px;
  border: 1.5px var(--frame-style) var(--edge-in);
  border-radius: 9px;
  background: var(--art-bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 동심원 + 중앙 스포트 — 각인된 메달 느낌 */
.htc-art-rings {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      circle at 50% 52%,
      transparent 0 13px,
      var(--ring) 13px 14px,
      transparent 14px 30px,
      var(--ring) 30px 31px,
      transparent 31px 52px,
      var(--ring) 52px 53px,
      transparent 53px 80px,
      var(--ring) 80px 81px,
      transparent 81px
    ),
    radial-gradient(58% 52% at 50% 46%, rgba(255, 255, 255, var(--spot)), rgba(255, 255, 255, 0) 72%);
}
.htc-art-ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42%;
  background: linear-gradient(180deg, transparent, var(--ground));
}
/* 회절 포일 — 포인터 x 에 따라 색이 흐른다(시야각 변색) */
.htc-art-foil {
  position: absolute;
  inset: 0;
  mix-blend-mode: color-burn;
  /* 목업 대비 낮춤(.32→.2): 목업의 아트창엔 리치한 일러스트가 있어 강한 color-burn 이 "포일"로 읽히지만,
     우리 엠블럼은 단색 SVG 라 같은 값이 초록 얼룩으로 보인다. 포인터 활성 시에만 살짝 올려 광택을 살린다. */
  opacity: calc(0.2 + var(--hover-tilt-opacity, 0) * 0.14);
  background: linear-gradient(116deg, #8d7cff -15%, #63e8ff 15%, #ff78d3 34%, #fff08a 49%, #72ffc1 65%, #8d7cff 84%, #63e8ff 115%);
  background-size: 250% 100%;
  background-position: calc((1 - var(--hover-tilt-x, 0.5)) * 100%) center;
}
.htc-art-shine {
  position: absolute;
  inset: 0;
  mix-blend-mode: soft-light;
  opacity: calc(0.34 + var(--hover-tilt-opacity, 0) * 0.24);
  background:
    repeating-linear-gradient(128deg, transparent 0 8%, rgba(255, 240, 138, 0.78) 9% 10%, transparent 11% 20%),
    linear-gradient(110deg, transparent 19%, #63e8ff 38%, #ff78d3 46%, #fff08a 52%, #72ffc1 60%, transparent 80%);
  background-size: 145% 145%, 280% 100%;
  background-position:
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc((1 - var(--hover-tilt-x, 0.5)) * 100%) center;
}
.htc.locked .htc-art-foil,
.htc.locked .htc-art-shine {
  opacity: 0;
}

/* 엠블럼 — 포인터에 살짝 시차 이동(카드 안에서 떠 있는 느낌) */
.htc-emblem {
  position: relative;
  z-index: 1;
  color: var(--ink);
  filter: drop-shadow(0 4px 6px rgba(70, 60, 30, 0.36));
  /* 카드가 기울 때 엠블럼이 안에서 살짝 어긋나 떠 보인다. 기울기만 키우고 이걸 안 키우면
     카드가 통짜 판자처럼 돈다.
     부호가 음수인 이유: 누른 쪽이 **들어가는** 방향으로 기울므로(아래 tilt-factor 주석), 떠 있는
     엠블럼은 앞으로 나온 쪽(= 누른 곳의 반대편)으로 밀려 보여야 한다. 같은 방향으로 움직이면
     들어간 쪽으로 파고드는 것처럼 보인다. */
  transform: translate(
    calc((0.5 - var(--hover-tilt-x, 0.5)) * 8px),
    calc((0.5 - var(--hover-tilt-y, 0.5)) * 8px)
  );
}
/* 아트는 픽토그램보다 크게 — 아트창을 채우는 주인공이다. */
.htc-emblem-art {
  width: var(--emblem-w);
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
  /* 아트창(`overflow:hidden`)보다 커지면 트로피가 위아래로 잘린다 — 잠금 카드에서 스탯 값이 2줄이
     되며 아트창이 납작해지자 실제로 컵 상단과 받침이 잘려 나갔다(2026-08-11 실기기). 폭 기준
     정사각이라 창이 짧아지는 순간 반드시 넘친다. 창 높이를 상한으로 걸어 항상 안에 들어오게 한다. */
  max-height: 100%;
  max-width: 100%;
}
/* 잠금은 채도를 빼 "아직 못 받은 것"으로 읽힌다.
   ⚠️ 선택자를 `img.` 로 좁힌 이유: 아트 <img> 는 클래스가 `htc-emblem htc-emblem-art` 둘 다라서,
   아래 `.htc.locked .htc-emblem { filter: none }`(픽토그램용)과 특이성이 같아 **뒤에 오는 쪽이 이긴다**.
   그래서 잠금 아트가 컬러 그대로 떴다(2026-08-11 실측). 요소 선택자를 더해 확실히 이기게 한다. */
.htc.locked img.htc-emblem-art {
  filter: grayscale(1) brightness(0.86);
  opacity: 0.42;
  transform: none;
}

.htc.locked .htc-emblem {
  color: var(--sub-ink);
  filter: none;
  opacity: 0.5;
  transform: none;
}

.htc-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  padding: 7px 9px;
  border: 1px solid var(--stat-edge);
  border-radius: 7px;
  background: var(--stat-bg);
}
/* 체크 — "달성했다"를 아이콘으로 한 번 더 말한다(라벨만으론 상태가 안 읽힌다) */
.htc-stat-check {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: var(--chip-bg);
  border: 1px solid var(--chip-edge);
  color: var(--chip-ink);
  flex: none;
}
.htc-stat-check svg {
  width: 9px;
  height: 9px;
}
.htc-stat-label {
  font: 600 10.5px/1 var(--font-sans);
  color: var(--sub-ink);
  /* 줄바꿈 금지 — 미획득 카드의 "최장 거리"가 긴 값(`0.4 / 21.1km`)에 밀려 "최장 거 / 리"로 쪼개졌다
     (2026-08-11 실기기). 라벨은 고정폭으로 두고 남는 폭을 값에 넘긴다. */
  white-space: nowrap;
  flex: none;
}
.htc-stat-value {
  margin-left: auto;
  font: 800 12px/1 var(--font-mono);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 0;
  /* 값도 접지 않는다 — `16.2 / 21.1km` 이 2줄로 접히면서 스탯 행이 두 배가 되고, 그만큼
     아트창이 눌려 트로피가 잘렸다(2026-08-11 실기기). 라벨·값 둘 다 한 줄로 두고,
     2열 그리드에서 둘이 함께 들어갈 만큼만 값을 줄인다. */
  white-space: nowrap;
}
.htc.size-grid .htc-stat-value {
  font-size: 11px;
}
.htc.size-grid .htc-stat {
  gap: 5px;
  padding: 7px 8px;
}

/* 근거 설명 — 2줄로 묶는다. 2열 그리드에선 카드가 좁아 3줄이 되면 푸터를 밀어낸다. */
.htc-why {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  margin-top: 7px;
  font: 500 9.5px/1.42 var(--font-sans);
  color: var(--sub-ink);
  word-break: keep-all;
}

.htc-progress {
  display: block;
  height: 4px;
  margin-top: 6px;
  border-radius: 3px;
  background: var(--stat-bg);
  overflow: hidden;
}
.htc-progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--sub-ink);
}

.htc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 근거가 1줄이든 2줄이든 푸터는 카드 바닥에 붙는다 — 카드마다 푸터 높이가 다르면 그리드가 어수선하다. */
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--stat-edge);
  font: 600 9px/1 var(--font-mono);
  color: var(--sub-ink);
}

/* 카드 전면 시닌 + 스페큘러 — 활성도(opacity)와 위치 모두 hover-tilt 변수 구동 */
.htc-shine {
  position: absolute;
  inset: 0;
  z-index: 6;
  border-radius: var(--radius);
  pointer-events: none;
  mix-blend-mode: overlay;
  opacity: calc(0.2 + var(--hover-tilt-opacity, 0) * 0.2);
  background:
    repeating-linear-gradient(128deg, transparent 0 8%, rgba(255, 240, 138, 0.78) 9% 10%, transparent 11% 20%),
    linear-gradient(110deg, transparent 19%, #63e8ff 38%, #ff78d3 46%, #fff08a 52%, #72ffc1 60%, transparent 80%);
  background-size: 145% 145%, 280% 100%;
  background-position:
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc((1 - var(--hover-tilt-x, 0.5)) * 100%) center;
}
.htc.locked .htc-shine {
  opacity: 0;
}
.htc-specular {
  position: absolute;
  inset: 0;
  z-index: 8;
  border-radius: var(--radius);
  pointer-events: none;
  mix-blend-mode: soft-light;
  opacity: calc(var(--hover-tilt-opacity, 0) * 0.85);
  background: radial-gradient(
    58% 48% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    rgba(255, 255, 255, 0.6),
    rgba(255, 255, 255, 0) 66%
  );
}
.htc.locked .htc-specular {
  opacity: 0;
}

/* ── 사이즈: thumb (홈 스트립) ─────────────────────────────────────
   80px 폭이라 제목·스탯·근거·푸터는 넣을 자리가 없다. 남기는 건 "무슨 카드인지"를 만드는 최소 3개 —
   티어칩·아트·짧은 라벨. 카드지와 티어보더가 그대로라 컬렉션의 큰 카드와 같은 카드로 읽힌다. */
.htc.size-thumb {
  --pad: 7px;
  --radius: 11px;
  --bw: 1.5px;
  --emblem-w: 82%;
  aspect-ratio: 5 / 7;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.38), inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}
.htc.size-thumb .htc-inner-frame {
  inset: 3px;
  border-radius: 8px;
  border-width: 1px;
}
.htc.size-thumb .htc-tier {
  font-size: 7px;
  padding: 2px 4px;
  letter-spacing: 0.06em;
}
.htc.size-thumb .htc-art {
  margin-top: 5px;
  border-radius: 7px;
}
.htc-thumb-label {
  position: relative;
  z-index: 4;
  margin-top: 5px;
  font: 700 9.5px/1.2 var(--font-mono);
  color: var(--ink);
  text-align: center;
  word-break: keep-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 사이즈: full (상세 모달) ───────────────────────────────────────
   근거 설명을 clamp 하지 않는다 — 카드를 크게 띄운 이유가 그 문장을 읽히게 하는 것이다. */
.htc.size-full {
  --pad: 16px;
  --radius: 20px;
  --bw: 2.5px;
  --emblem-w: 62%;
  aspect-ratio: 300 / 420;
}
.htc.size-full .htc-inner-frame {
  inset: 7px;
  border-radius: 15px;
}
.htc.size-full .htc-tier {
  font-size: 10px;
  padding: 4px 9px;
}
.htc.size-full .htc-metric {
  font-size: 13px;
}
.htc.size-full .htc-title {
  margin-top: 10px;
  font-size: 18px;
}
.htc.size-full .htc-art {
  margin-top: 11px;
  border-radius: 12px;
}
.htc.size-full .htc-stat {
  margin-top: 12px;
  padding: 9px 12px;
}
.htc.size-full .htc-stat-label {
  font-size: 12px;
}
.htc.size-full .htc-stat-value {
  font-size: 15px;
}
.htc.size-full .htc-why {
  -webkit-line-clamp: none;
  line-clamp: none;
  display: block;
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.5;
}
.htc.size-full .htc-foot {
  padding-top: 10px;
  font-size: 10.5px;
}

/* ── 3D 뒤집기 ──────────────────────────────────────────────────────
   등장 애니메이션(한 바퀴 회전)은 제거했다. iOS 에서 끝까지 부드럽게 만들지 못해 사용자가 못 쓰겠다고
   판단했고(2026-08-11), 상세 등장은 모달의 단순한 팝(페이드 + 살짝 확대)이 담당한다. 남은 3D 동작은
   뒤집기 하나뿐이라 여기만 `preserve-3d` 를 쓴다.

   ⚠️ 프레임 판정은 `requestAnimationFrame` 간격으로 하지 말 것 — CSS 애니메이션은 컴포지터에서
   돌기 때문에 래스터가 밀려도 메인 스레드 rAF 는 16.7ms 로 태연히 찍힌다. 실제로 "드롭 0" 이
   나왔는데 기기에서는 끊겼다. 트레이스의 `DroppedFrame`·합성 정보로만 판정한다.

   앞/뒤가 같은 상자를 공유해야 두께 없이 한 장으로 읽히므로, 앞면이 흐름에서 크기를 정하고
   뒷면이 그 위에 absolute 로 겹친다. */
.htc-flip {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.62s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.htc-flip.is-flipped {
  transform: rotateY(180deg);
}
.htc-flip.is-animating {
  will-change: transform;
}
.htc-face {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.htc-back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
  /* 뒷면은 아트창이 없어 콘텐츠가 위아래로 흩어진다 — 인쇄물처럼 중앙 정렬로 모은다. */
  align-items: center;
  text-align: center;
}

/* 뒤집는 동안에는 프레임마다 다시 그려지는 레이어를 전부 끈다. 블렌드(GPU 독립 합성 불가)뿐 아니라
   동심원·격자 같은 radial/repeating 그라디언트도 포함한다. 특이성(0,3,0)이 원래 규칙(0,1,0)을
   이기므로 !important 없이 덮인다.
   ⚠️ 되돌아올 때 **페이드를 걸지 않는다** — 0.3s 페이드를 걸었더니 회전 종료 직후 레이어 8장이
   동시에 서서히 합성되면서 DroppedFrame 10개가 연속 발생했다(트레이스 실측). 한 프레임에 스냅으로
   켜면 비싼 합성이 1회로 끝나고, opacity 0.2 안팎의 은은한 오버레이라 팝이 눈에 띄지 않는다. */
.htc-flip.is-animating .htc-etch,
.htc-flip.is-animating .htc-shine,
.htc-flip.is-animating .htc-specular,
.htc-flip.is-animating .htc-art-foil,
.htc-flip.is-animating .htc-art-shine,
.htc-flip.is-animating .htc-art-rings,
.htc-flip.is-animating .htc-art-ground,
.htc-flip.is-animating .htc-back-guilloche {
  opacity: 0;
}
.htc-flip.is-animating .htc {
  /* 큰 blur 그림자도 회전 중엔 매 프레임 다시 계산된다. 도는 동안만 얇게. */
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.4);
}

/* 카드 뒷면 문양 — 지폐/증서 질감. 동심원(앞면 아트창과 같은 어휘) + 45° 격자.
   앞면과 달리 mix-blend-mode 를 쓰지 않는다 — 뒤집기 중에 합성 비용이 그대로 프레임 드랍이 된다. */
.htc-back-guilloche {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.6;
  background:
    radial-gradient(
      circle at 50% 50%,
      transparent 0 30px,
      var(--ring) 30px 31px,
      transparent 31px 60px,
      var(--ring) 60px 61px,
      transparent 61px 94px,
      var(--ring) 94px 95px,
      transparent 95px 132px,
      var(--ring) 132px 133px,
      transparent 133px
    ),
    repeating-linear-gradient(45deg, transparent 0 9px, var(--ring) 9px 10px, transparent 10px 19px),
    repeating-linear-gradient(-45deg, transparent 0 9px, var(--ring) 9px 10px, transparent 10px 19px);
}

/* 워드마크 — 뒷면의 유일한 콘텐츠. 카드 정중앙에 놓는다. */
.htc-back-mark {
  position: relative;
  z-index: 4;
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}
.htc-back-brand {
  font: 800 19px/1 var(--font-mono);
  letter-spacing: 0.26em;
  /* 워드마크는 카드지에 눌러 찍힌 듯 — 밝은 하이라이트 + 어두운 그림자 한 줄. */
  color: var(--ink);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.65);
}
.htc-back-rule-line {
  width: 64px;
  height: 1px;
  background: var(--edge);
  opacity: 0.7;
}
.htc-back-sub {
  font: 600 9px/1 var(--font-mono);
  letter-spacing: 0.3em;
  color: var(--sub-ink);
}


@media (prefers-reduced-motion: reduce) {
  .htc-emblem {
    transform: none;
  }
  .htc-flip {
    transition: none;
  }
}
</style>

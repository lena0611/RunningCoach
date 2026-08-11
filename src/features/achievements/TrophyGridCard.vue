<script setup lang="ts">
import { computed } from 'vue'
// 웹컴포넌트 <hover-tilt> 등록 (TrophySkinCard 와 동일 라이브러리 — 스프링 물리·터치 처리 내장)
import 'hover-tilt/vue'
import TrophyIcon from './TrophyIcon.vue'
import type { TrophyCardItem } from './trophyCatalog'

/**
 * 컬렉션 그리드용 전리품 카드 (디자인: "Trophy Collection").
 *
 * 기존 `TrophyTile` 은 아이콘 하나만 얹은 납작한 타일이라 "전리품"이라는 말이 무색했다. 이 카드는
 * 실물 트레이딩 카드의 구조를 그대로 가져온다 — **밝은 카드지**(티어별 크림/화이트/베이지) + 티어 보더
 * + 이중 프레임 + 대각 에치 + 아트창(동심원·회절 포일·시닌) + 스탯 행 + 하단 푸터.
 *
 * ⚠️ 색을 토큰으로 안 올린 이유: 기존 `--trophy-*` 토큰은 **다크 배경 타일용**(bg-a #3a2f12 …)이고,
 * 이 카드는 정반대인 **밝은 카드지에 어두운 잉크**다. 두 표면이 같은 이름을 공유하면 서로를 오염시킨다.
 * 카드지 팔레트는 이 컴포넌트 한 곳에서만 쓰이므로 여기 스코프한다(티어 액센트는 공용 토큰 재사용).
 *
 * 틸트·포인터 추적은 `hover-tilt` 가 담당하고, 포일/시닌/스페큘러는 그가 노출하는 CSS 변수
 * (`--hover-tilt-x/y` 0..1, `--hover-tilt-opacity` 활성도)로 **순수 CSS** 구동한다 —
 * 포인터 리스너를 직접 달지 않아 reduced-motion·터치·스크롤 취소가 라이브러리와 함께 움직인다.
 *
 * 잠금 카드는 같은 골격에 점선 보더 + 회색 엠블럼 + 진행바로만 달라진다(별도 컴포넌트를 만들지 않는다 —
 * 획득/미획득이 같은 컬렉션에 나란히 서므로 구조가 어긋나면 그리드가 들쭉날쭉해진다).
 */
const props = defineProps<{ card: TrophyCardItem }>()
defineEmits<{ select: [] }>()

const earned = computed(() => props.card.earned)

/** 우상단 메트릭 — 배지 접두어(PR 등)까지 붙여 카드 종류를 한눈에 읽게. */
const metric = computed(() => {
  const { badgePrefix, badgeValue } = props.card
  return badgePrefix ? `${badgePrefix} ${badgeValue}` : badgeValue
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
  <hover-tilt
    class="tgc-frame"
    :tilt-factor="earned ? 0.4 : 0.2"
    :scale-factor="earned ? 1.03 : 1.01"
    :glare-intensity="0"
    :exit-delay="150"
  >
    <button
      type="button"
      class="tgc"
      :class="[`tier-${card.tier}`, { locked: !earned }]"
      :aria-label="`${card.title} — ${earned ? '획득' : '미획득'}`"
      @click="$emit('select')"
    >
      <span class="tgc-etch" aria-hidden="true" />
      <span class="tgc-inner-frame" aria-hidden="true" />

      <span class="tgc-head">
        <span class="tgc-tier">{{ earned ? card.tier.toUpperCase() : 'LOCKED' }}</span>
        <span class="tgc-metric">{{ metric }}</span>
      </span>

      <span class="tgc-title">{{ card.title }}</span>

      <span class="tgc-art">
        <span class="tgc-art-rings" aria-hidden="true" />
        <span class="tgc-art-ground" aria-hidden="true" />
        <span class="tgc-art-foil" aria-hidden="true" />
        <span class="tgc-art-shine" aria-hidden="true" />
        <TrophyIcon class="tgc-emblem" :kind="card.kind" :locked="!earned" :size="72" />
      </span>

      <span class="tgc-stat">
        <span class="tgc-stat-label">{{ statLabel }}</span>
        <span class="tgc-stat-value">{{ statValue }}</span>
      </span>

      <span v-if="!earned && card.progress" class="tgc-progress" aria-hidden="true">
        <span class="tgc-progress-fill" :style="{ width: `${progressPct}%` }" />
      </span>

      <span class="tgc-foot">
        <span>{{ dateText }}</span>
        <span>{{ earned ? 'HOLO' : '잠금' }}</span>
      </span>

      <span class="tgc-shine" aria-hidden="true" />
      <span class="tgc-specular" aria-hidden="true" />
    </button>
  </hover-tilt>
</template>

<style scoped>
.tgc-frame {
  display: block;
  width: 100%;
  touch-action: none;
}

/* 카드지 팔레트 — 티어별. 밝은 종이 + 어두운 잉크(디자인 "Trophy Collection"). */
.tgc {
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

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  aspect-ratio: 240 / 290;
  padding: 12px 12px 11px;
  border: 2px var(--frame-style) var(--edge);
  border-radius: 16px;
  background: var(--stock);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  color: var(--ink);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}

.tgc.tier-gold {
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

.tgc.tier-silver {
  --edge: var(--trophy-silver-border);
}

.tgc.tier-bronze {
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
.tgc.locked {
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
.tgc-etch {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 16px;
  pointer-events: none;
  mix-blend-mode: overlay;
  opacity: 0.22;
  background:
    repeating-linear-gradient(52deg, transparent 0 20px, #63e8ff 21px 22px, transparent 23px 42px),
    repeating-linear-gradient(132deg, transparent 0 27px, #fff08a 28px 29px, transparent 30px 54px);
}
.tgc.locked .tgc-etch {
  opacity: 0;
}

.tgc-inner-frame {
  position: absolute;
  inset: 5px;
  z-index: 2;
  border: 1.5px var(--frame-style) var(--edge-in);
  border-radius: 12px;
  pointer-events: none;
}

.tgc-head,
.tgc-title,
.tgc-art,
.tgc-stat,
.tgc-progress,
.tgc-foot {
  position: relative;
  z-index: 4;
}

.tgc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.tgc-tier {
  font: 800 9px/1 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--chip-ink);
  background: var(--chip-bg);
  border: 1px solid var(--chip-edge);
  border-radius: 4px;
  padding: 3px 7px;
}
.tgc-metric {
  font: 700 11px/1 var(--font-mono);
  color: var(--sub-ink);
  font-variant-numeric: tabular-nums;
}

.tgc-title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  word-break: keep-all;
}

.tgc-art {
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
.tgc-art-rings {
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
.tgc-art-ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42%;
  background: linear-gradient(180deg, transparent, var(--ground));
}
/* 회절 포일 — 포인터 x 에 따라 색이 흐른다(시야각 변색) */
.tgc-art-foil {
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
.tgc-art-shine {
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
.tgc.locked .tgc-art-foil,
.tgc.locked .tgc-art-shine {
  opacity: 0;
}

/* 엠블럼 — 포인터에 살짝 시차 이동(카드 안에서 떠 있는 느낌) */
.tgc-emblem {
  position: relative;
  z-index: 1;
  color: var(--ink);
  filter: drop-shadow(0 4px 6px rgba(70, 60, 30, 0.36));
  transform: translate(
    calc((var(--hover-tilt-x, 0.5) - 0.5) * 5px),
    calc((var(--hover-tilt-y, 0.5) - 0.5) * 5px)
  );
}
.tgc.locked .tgc-emblem {
  color: var(--sub-ink);
  filter: none;
  opacity: 0.5;
  transform: none;
}

.tgc-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  padding: 7px 9px;
  border: 1px solid var(--stat-edge);
  border-radius: 7px;
  background: var(--stat-bg);
}
.tgc-stat-label {
  font: 600 10.5px/1 var(--font-sans);
  color: var(--sub-ink);
}
.tgc-stat-value {
  margin-left: auto;
  font: 800 12px/1 var(--font-mono);
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.tgc-progress {
  display: block;
  height: 4px;
  margin-top: 6px;
  border-radius: 3px;
  background: var(--stat-bg);
  overflow: hidden;
}
.tgc-progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--sub-ink);
}

.tgc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--stat-edge);
  font: 600 9px/1 var(--font-mono);
  color: var(--sub-ink);
}

/* 카드 전면 시닌 + 스페큘러 — 활성도(opacity)와 위치 모두 hover-tilt 변수 구동 */
.tgc-shine {
  position: absolute;
  inset: 0;
  z-index: 6;
  border-radius: 16px;
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
.tgc.locked .tgc-shine {
  opacity: 0;
}
.tgc-specular {
  position: absolute;
  inset: 0;
  z-index: 8;
  border-radius: 16px;
  pointer-events: none;
  mix-blend-mode: soft-light;
  opacity: calc(var(--hover-tilt-opacity, 0) * 0.85);
  background: radial-gradient(
    58% 48% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    rgba(255, 255, 255, 0.6),
    rgba(255, 255, 255, 0) 66%
  );
}
.tgc.locked .tgc-specular {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tgc-emblem {
    transform: none;
  }
}
</style>

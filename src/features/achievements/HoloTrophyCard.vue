<script setup lang="ts">
import { computed } from 'vue'
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
  }>(),
  { size: 'grid', clickable: true }
)
defineEmits<{ select: [] }>()

const earned = computed(() => props.card.earned)
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
  <hover-tilt
    class="htc-frame"
    :tilt-factor="earned ? 0.4 : 0.2"
    :scale-factor="earned ? 1.03 : 1.01"
    :glare-intensity="0"
    :exit-delay="150"
  >
    <component
      :is="clickable ? 'button' : 'div'"
      :type="clickable ? 'button' : undefined"
      class="htc"
      :class="[`tier-${card.tier}`, `size-${size}`, { locked: !earned }]"
      :aria-label="`${card.title} — ${earned ? '획득' : '미획득'}`"
      @click="clickable && $emit('select')"
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
  </hover-tilt>
</template>

<style scoped>
.htc-frame {
  display: block;
  width: 100%;
  touch-action: none;
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
  transform: translate(
    calc((var(--hover-tilt-x, 0.5) - 0.5) * 5px),
    calc((var(--hover-tilt-y, 0.5) - 0.5) * 5px)
  );
}
/* 아트는 픽토그램보다 크게 — 아트창을 채우는 주인공이다. */
.htc-emblem-art {
  width: var(--emblem-w);
  height: auto;
  aspect-ratio: 1;
  object-fit: contain;
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
  /* 값이 길면 값이 줄바꿈된다 — 라벨을 쪼개는 것보다 낫다(라벨은 뜻이 깨지고, 값은 안 깨진다). */
  text-align: right;
  min-width: 0;
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

@media (prefers-reduced-motion: reduce) {
  .htc-emblem {
    transform: none;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
// 웹컴포넌트 <hover-tilt> 등록 + Vue 템플릿 타이핑 (pokemon-cards-css 원작자 라이브러리)
import 'hover-tilt/vue'
import type { TrophyCardItem, TrophyKind } from './trophyCatalog'
import skinPb from '@/assets/achievements/card-skin-pb.webp'
import skinMilestone from '@/assets/achievements/card-skin-milestone.webp'
import skinStreak from '@/assets/achievements/card-skin-streak.webp'
import skinWeekly from '@/assets/achievements/card-skin-weekly.webp'
import skinMonthly from '@/assets/achievements/card-skin-monthly.webp'
import skinClub from '@/assets/achievements/card-skin-club.webp'

/**
 * 획득 전리품의 풀카드 스킨 렌더 (2026-07 아트 리스킨).
 *
 * AI 생성 이미지 1장이 카드 전체(프레임+구획+엠블럼)이고, DOM 텍스트를 이미지 구획의
 * % 좌표에 오버레이한다. 6종 스킨은 같은 프레임 템플릿에서 파생되어 구획 좌표를 공유한다.
 * 이미지 교체 시 좌표계(제목띠·원형 뱃지·기록 칩·하단 패널)가 유지되는지 확인할 것.
 *
 * 틸트·포인터 추적은 hover-tilt 웹컴포넌트가 담당(스프링 물리 내장, exit 시 자연 복귀).
 * 라이브러리가 노출하는 CSS 변수(0..1)로 홀로 레이어를 순수 CSS 구동한다:
 *   --hover-tilt-x/y = 포인터 위치, --hover-tilt-opacity = 활성도(스프링 애니메이션).
 * 홀로 레이어(아래→위): 스킨 이미지 → 텍스트 → 티어별 이리데선트 포일(color-dodge,
 * 포인터 radial 마스크) → 유리 시닌 → 프리즘 스트릭(스펙트럼 밴드×2 + 흰 심 + 그레인).
 * 프리즘 스트릭의 사실감 3요소: ①color-dodge라 매트한 바탕엔 안 먹고 금속 부조만 발광
 * ②hue-rotate가 포인터 x에 연동(시야각 변색) ③feTurbulence 그레인과 multiply(포일 가루 질감).
 * 잠금 카드는 TrophyCard가 렌더.
 */
const props = withDefaults(defineProps<{ card: TrophyCardItem; interactive?: boolean }>(), { interactive: true })

// 전 kind 필수(Record) — 새 kind 추가 시 스킨 없이는 타입 에러로 잡힌다.
const SKIN_BY_KIND: Record<TrophyKind, string> = {
  pb: skinPb,
  milestone: skinMilestone,
  streak: skinStreak,
  weekly: skinWeekly,
  monthly: skinMonthly,
  club: skinClub
}
const skin = computed(() => SKIN_BY_KIND[props.card.kind])

// 원형 뱃지에 긴 값(예: 500km)이 들어가면 글자수 기준으로 축소해 원 안에 맞춘다.
const badgeValueSize = computed(() => {
  const n = props.card.badgeValue.length
  return n <= 3 ? '14px' : n <= 5 ? '12px' : '10px'
})

const footDate = computed(() => (props.card.achievedAt ?? '').replaceAll('-', '.'))
</script>

<template>
  <hover-tilt
    :class="interactive ? 'skin-frame' : 'skin-frame static'"
    :tilt-factor="0.4"
    :scale-factor="1.03"
    :glare-intensity="0"
    :exit-delay="150"
  >
    <div class="skin-card" :class="`tier-${card.tier}`">
      <img class="skin-img" :src="skin" alt="" />

      <!-- 제목띠 (이미지 구획: x 12.5~72%, y 5.5~15.1%) -->
      <div class="skin-title-zone">
        <span class="skin-tier">{{ card.tier.toUpperCase() }}</span>
        <h3 class="skin-title">{{ card.title }}</h3>
      </div>

      <!-- 우상단 원형 뱃지 (중심 84.8%, 10.9%) -->
      <div class="skin-badge">
        <em v-if="card.badgePrefix">{{ card.badgePrefix }}</em>
        <strong :style="{ fontSize: badgeValueSize }">{{ card.badgeValue }}</strong>
      </div>

      <!-- 아트창 하단 기록 칩 -->
      <span v-if="card.valueText" class="skin-value">{{ card.valueText }}</span>

      <!-- 하단 정보 패널 (x 11~89%, y 77.6~93.2%) -->
      <div class="skin-panel">
        <div class="skin-stat">
          <span class="skin-stat-check" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5" /></svg>
          </span>
          <span class="skin-stat-label">{{ card.statLabel }}</span>
          <span v-if="card.valueText" class="skin-stat-value">{{ card.valueText }}</span>
        </div>
        <p class="skin-desc">{{ card.description }}</p>
        <div class="skin-foot">
          <span>{{ footDate }}</span>
          <span>HOLO</span>
        </div>
      </div>

      <div class="skin-layer skin-foil" aria-hidden="true" />
      <div class="skin-layer skin-glass" aria-hidden="true" />
      <div class="skin-layer skin-shine" aria-hidden="true" />
    </div>
  </hover-tilt>
</template>

<style scoped>
.skin-frame {
  display: block;
  width: 100%;
  max-width: 320px;
  touch-action: none;
}
.skin-frame.static {
  pointer-events: none;
}

/* 높이는 카드 자신의 aspect-ratio로 — shadow 컨테이너(height:auto)를 거치면 %높이가 붕괴한다 */
.skin-card {
  --sk-text: var(--trophy-gold-text);
  --sk-chip: var(--trophy-gold-chip);
  --sk-ink: var(--trophy-gold-bg-b);
  --sk-border: var(--trophy-gold-border);
  position: relative;
  width: 100%;
  aspect-ratio: 1024 / 1536;
  border-radius: 16px;
  overflow: hidden;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.55),
    0 0 44px color-mix(in srgb, var(--sk-border) 22%, transparent);
}
.skin-card.tier-silver {
  --sk-text: var(--trophy-silver-text);
  --sk-chip: var(--trophy-silver-chip);
  --sk-ink: var(--trophy-silver-bg-b);
  --sk-border: var(--trophy-silver-border);
}
.skin-card.tier-bronze {
  --sk-text: var(--trophy-bronze-text);
  --sk-chip: var(--trophy-bronze-chip);
  --sk-ink: var(--trophy-bronze-bg-b);
  --sk-border: var(--trophy-bronze-border);
}

.skin-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ---- 텍스트 오버레이 (이미지 구획 % 좌표 — 6종 스킨 공통 좌표계) ---- */
.skin-title-zone {
  position: absolute;
  left: 12.5%;
  right: 28%;
  top: 5.5%;
  height: 9.6%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.skin-tier {
  font: 700 8px/1 var(--font-mono);
  letter-spacing: 0.22em;
  color: color-mix(in srgb, var(--sk-text) 70%, transparent);
}
.skin-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--sk-text);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skin-badge {
  position: absolute;
  left: 84.8%;
  top: 10.9%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.skin-badge em {
  font: 800 8px/1 var(--font-sans);
  font-style: normal;
  color: var(--sk-text);
}
.skin-badge strong {
  font: 800 14px/1.15 var(--font-mono);
  color: var(--sk-text);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.skin-value {
  position: absolute;
  left: 50%;
  top: 68.5%;
  transform: translate(-50%, -50%);
  font: 800 14px/1 var(--font-mono);
  color: var(--sk-ink);
  background: var(--sk-chip);
  padding: 3px 9px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.skin-panel {
  position: absolute;
  left: 11%;
  right: 11%;
  top: 77.6%;
  bottom: 6.8%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 2px;
}
.skin-stat {
  display: flex;
  align-items: center;
  gap: 6px;
}
.skin-stat-check {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: var(--sk-chip);
  color: var(--sk-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.skin-stat-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--sk-text);
}
.skin-stat-value {
  margin-left: auto;
  font: 800 14px/1 var(--font-mono);
  color: var(--color-strong);
}
.skin-desc {
  margin: 0;
  font: 500 10px/1.45 var(--font-sans);
  color: color-mix(in srgb, var(--sk-text) 72%, var(--color-muted));
}
.skin-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font: 600 9px/1 var(--font-mono);
  color: color-mix(in srgb, var(--sk-text) 60%, var(--color-muted-2));
}

/* ---- 홀로 레이어 (hover-tilt CSS 변수 구동: x/y = 0..1 포인터, opacity = 0..1 스프링) ---- */
.skin-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 티어별 이리데선트 포일 — 베이스 금속과 같은 온도의 색군만 써서 dodge 그린 시프트를 막는다 */
.skin-foil {
  z-index: 3;
  background-image: linear-gradient(
    115deg,
    #c9a24a 0%,
    #e8d0a8 14%,
    #e09aac 32%,
    #b494e0 48%,
    #dea878 64%,
    #e8d0a8 80%,
    #c9a24a 100%
  );
  background-size: 300% 300%;
  background-position: calc((1 - var(--hover-tilt-x, 0.5)) * 100%) calc((1 - var(--hover-tilt-y, 0.5)) * 100%);
  mix-blend-mode: color-dodge;
  opacity: calc(0.06 + var(--hover-tilt-opacity, 0) * 0.16);
  -webkit-mask-image: radial-gradient(
    52% 46% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    #000 0%,
    rgba(0, 0, 0, 0.5) 45%,
    transparent 72%
  );
  mask-image: radial-gradient(
    52% 46% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    #000 0%,
    rgba(0, 0, 0, 0.5) 45%,
    transparent 72%
  );
}
/* 브론즈: 웜 코퍼(구리·로즈·앰버) */
.skin-card.tier-bronze .skin-foil {
  background-image: linear-gradient(
    115deg,
    #b57a4a 0%,
    #e0b894 14%,
    #d98a6a 32%,
    #b48ab4 48%,
    #cf9a5f 64%,
    #e0b894 80%,
    #b57a4a 100%
  );
}
/* 실버: 쿨톤(은·블루·바이올렛) — 중립 은 금속 위라 그린 시프트 없음 */
.skin-card.tier-silver .skin-foil {
  background-image: linear-gradient(
    115deg,
    #9fb6c9 0%,
    #dde6ef 14%,
    #8fc0e8 32%,
    #b9a6e8 48%,
    #a9c9dc 64%,
    #dde6ef 80%,
    #9fb6c9 100%
  );
}
/* 유리 시닌 — 상단 고정 광택 + 포인터 추적 하이라이트(::after) */
.skin-glass {
  z-index: 5;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.05) 14%, rgba(255, 255, 255, 0) 32%, rgba(255, 255, 255, 0) 100%);
}
.skin-glass::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    80% 60% at calc(var(--hover-tilt-x, 0.5) * 100%) calc((var(--hover-tilt-y, 0.5) - 0.18) * 100%),
    rgba(255, 255, 255, 0.24),
    rgba(255, 255, 255, 0.04) 42%,
    rgba(255, 255, 255, 0) 70%
  );
  opacity: var(--hover-tilt-opacity, 0);
}
/* 프리즘 스트릭 — 스펙트럼 밴드×2 + 흰 하이라이트 심 + 글리터, 최하층 그레인과 multiply */
.skin-shine {
  z-index: 6;
  background:
    radial-gradient(1.6px 1.6px at 20% 30%, rgba(255, 255, 255, 0.6), transparent 60%),
    radial-gradient(1.6px 1.6px at 65% 55%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.4px 1.4px at 40% 80%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.4px 1.4px at 82% 22%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.5px 1.5px at 12% 68%, rgba(255, 255, 255, 0.45), transparent 60%),
    linear-gradient(115deg, transparent 48.7%, rgba(255, 255, 255, 0.62) 50%, transparent 51.3%),
    linear-gradient(
      115deg,
      transparent 46.5%,
      rgba(255, 96, 96, 0.3) 47.8%,
      rgba(255, 196, 96, 0.36) 49%,
      rgba(140, 230, 150, 0.28) 50%,
      rgba(96, 170, 255, 0.33) 51%,
      rgba(190, 120, 255, 0.3) 52.2%,
      transparent 53.5%
    ),
    linear-gradient(
      115deg,
      transparent 57%,
      rgba(255, 150, 96, 0.14) 58.5%,
      rgba(120, 200, 255, 0.14) 60%,
      transparent 61.5%
    ),
    url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='180'%20height='180'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='2'%20stitchTiles='stitch'/%3E%3CfeColorMatrix%20type='saturate'%20values='0'/%3E%3C/filter%3E%3Crect%20width='180'%20height='180'%20filter='url(%23n)'%20opacity='0.55'/%3E%3C/svg%3E");
  background-size: 120px 120px, 120px 120px, 120px 120px, 120px 120px, 120px 120px, 240% 240%, 240% 240%, 240% 240%, 180px 180px;
  background-position:
    calc((1 - var(--hover-tilt-x, 0.5)) * 100%) calc((1 - var(--hover-tilt-y, 0.5)) * 100%),
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc((1 - var(--hover-tilt-x, 0.5)) * 100%) calc((1 - var(--hover-tilt-y, 0.5)) * 100%),
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc((1 - var(--hover-tilt-x, 0.5)) * 100%) calc((1 - var(--hover-tilt-y, 0.5)) * 100%),
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    0px 0px;
  background-blend-mode: normal, normal, normal, normal, normal, multiply, multiply, multiply, normal;
  mix-blend-mode: color-dodge;
  filter: hue-rotate(calc((var(--hover-tilt-x, 0.5) - 0.5) * 90deg));
  opacity: calc(var(--hover-tilt-opacity, 0) * 0.85);
  -webkit-mask-image: radial-gradient(
    120% 110% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    #000 0%,
    rgba(0, 0, 0, 0.75) 40%,
    rgba(0, 0, 0, 0.25) 70%,
    transparent 92%
  );
  mask-image: radial-gradient(
    120% 110% at calc(var(--hover-tilt-x, 0.5) * 100%) calc(var(--hover-tilt-y, 0.5) * 100%),
    #000 0%,
    rgba(0, 0, 0, 0.75) 40%,
    rgba(0, 0, 0, 0.25) 70%,
    transparent 92%
  );
}
</style>

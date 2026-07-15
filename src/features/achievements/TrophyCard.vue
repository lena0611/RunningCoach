<script setup lang="ts">
import { computed } from 'vue'
// 웹컴포넌트 <hover-tilt> 등록 + Vue 템플릿 타이핑
import 'hover-tilt/vue'
import TrophyIcon from './TrophyIcon.vue'
import TrophySkinCard from './TrophySkinCard.vue'
import type { TrophyCardItem } from './trophyCatalog'

/**
 * 전리품 카드 디스패처 + 잠금 카드 렌더.
 *
 * 획득 카드는 TrophySkinCard(풀카드 아트 스킨, 2026-07 리스킨)에 위임하고,
 * 이 컴포넌트 본체는 미획득(잠금) 카드 렌더(무채색 점선 프레임 + 진행도)만 담당한다.
 *
 * 틸트는 hover-tilt 웹컴포넌트(스프링 물리) — 잠금은 획득보다 절제된 계수(0.25).
 * 잠금 카드 레이어(아래→위): 몸체 → 베이스 패턴(리본 격자+업적 아이콘) → 노이즈 모틀
 * → 콘텐츠 → 유리 시닌(고정 광택 + 포인터 하이라이트).
 */
const props = withDefaults(defineProps<{ card: TrophyCardItem; interactive?: boolean }>(), { interactive: true })

const progressPct = computed(() => {
  const p = props.card.progress
  if (!p || p.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.current / p.target) * 100)))
})
</script>

<template>
  <TrophySkinCard v-if="card.earned" :card="card" :interactive="interactive" />
  <hover-tilt
    v-else
    :class="interactive ? 'trophy-frame' : 'trophy-frame static'"
    :tilt-factor="0.25"
    :scale-factor="1.03"
    :glare-intensity="0"
    :exit-delay="150"
  >
    <div class="trophy-card" :class="`tier-${card.tier}`">
      <div class="trophy-layer trophy-base" aria-hidden="true" />
      <div class="trophy-layer trophy-noise" aria-hidden="true" />
      <div class="trophy-content">
        <div class="trophy-head">
          <span class="trophy-chip">LOCKED</span>
          <span class="trophy-badge">
            <em v-if="card.badgePrefix">{{ card.badgePrefix }}</em>
            <strong>{{ card.badgeValue }}</strong>
          </span>
        </div>
        <h3 class="trophy-title">{{ card.title }}</h3>
        <div class="trophy-art">
          <TrophyIcon :kind="card.kind" :locked="true" :size="72" />
        </div>
        <div v-if="card.progress" class="trophy-progress">
          <div class="trophy-progress-row">
            <span>{{ card.progress.label }}</span>
            <strong>{{ card.progress.valueText }}</strong>
          </div>
          <div class="trophy-progress-track"><div class="trophy-progress-fill" :style="{ width: `${progressPct}%` }" /></div>
        </div>
        <p class="trophy-desc">{{ card.description }}</p>
        <div class="trophy-foot">
          <span class="trophy-locked-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            미획득
          </span>
        </div>
      </div>
      <div class="trophy-layer trophy-glass" aria-hidden="true" />
    </div>
  </hover-tilt>
</template>

<style scoped>
.trophy-frame {
  display: block;
  width: 100%;
  max-width: 320px;
  border-radius: 18px;
  touch-action: none;
}
.trophy-frame.static {
  pointer-events: none;
}

/* 잠금 몸체 — 실버 바탕 계열의 무채색 + 점선 보더(데모 카드 3 이식).
   높이는 카드 자신의 aspect-ratio로 — shadow 컨테이너를 거치면 %높이가 붕괴한다 */
.trophy-card {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 7;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(160deg, var(--trophy-silver-bg-b), var(--trophy-silver-bg-c));
  border: 2px dashed var(--color-border-strong);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
}

.trophy-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: 16px;
  pointer-events: none;
}
/* 리본(북마크) 인터로킹 격자 + 업적 아이콘 — 데모 SVG data-URI 그대로(%27 인코딩 유지 필수) */
.trophy-base {
  background-image: url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2788%27%20height=%27112%27%3E%3Cg%20fill=%27%23ffffff%27%3E%3Cpath%20d=%27M0%200H44V28L22%2016L0%2028Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M0%2028L22%2016L44%2028V84L22%2072L0%2084Z%27%20fill-opacity=%27.06%27/%3E%3Cpath%20d=%27M0%2084L22%2072L44%2084V112H0Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M44%200L66%20-12L88%200V56L66%2044L44%2056Z%27%20fill-opacity=%27.06%27/%3E%3Cpath%20d=%27M44%2056L66%2044L88%2056V112L66%20100L44%20112Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M44%20112L66%20100L88%20112Z%27%20fill-opacity=%27.06%27/%3E%3C/g%3E%3Cg%20fill=%27%23ffffff%27%20opacity=%27.5%27%3E%3Cpath%20d=%27M22%2044l3.2%206.5%207.2%201-5.2%205.1%201.2%207.2-6.4-3.4-6.4%203.4%201.2-7.2-5.2-5.1%207.2-1z%27/%3E%3Cpath%20d=%27M59%2014h14v6a7%207%200%200%201-14%200z%27/%3E%3Crect%20x=%2764.5%27%20y=%2725%27%20width=%273%27%20height=%274%27/%3E%3Cpath%20d=%27M61%2030h10l1.5%203h-13z%27/%3E%3Cpath%20d=%27M17%20107l-3-8h6zM27%20107l3-8h-6z%27/%3E%3Ccircle%20cx=%2722%27%20cy=%27112%27%20r=%276%27/%3E%3Ccircle%20cx=%2722%27%20cy=%270%27%20r=%276%27/%3E%3Crect%20x=%2760%27%20y=%2770%27%20width=%271.8%27%20height=%2718%27/%3E%3Cpath%20d=%27M63%2071h10l-2.6%203.2%202.6%203.2h-10z%27/%3E%3C/g%3E%3C/svg%3E);
  background-size: 88px 112px;
  opacity: 0.1;
}
/* 노이즈 모틀 — 금속 포일 질감 */
.trophy-noise {
  background-image: url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27300%27%20height=%27300%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%27.028%27%20numOctaves=%274%27%20seed=%277%27/%3E%3C/filter%3E%3Crect%20width=%27300%27%20height=%27300%27%20filter=%27url%28%23n%29%27/%3E%3C/svg%3E);
  background-size: 320px 320px;
  opacity: 0.05;
}

.trophy-content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 13px 13px 12px;
}
.trophy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trophy-chip {
  font: 700 10px/1 var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--color-muted-2);
  background: var(--color-surface-2);
  padding: 4px 7px;
  border-radius: 5px;
}
.trophy-badge {
  display: flex;
  align-items: baseline;
  gap: 3px;
}
.trophy-badge em {
  font: 800 12px/1 var(--font-sans);
  font-style: normal;
  color: var(--color-muted-2);
}
.trophy-badge strong {
  font: 800 12px/1 var(--font-mono);
  color: var(--color-muted-2);
}
.trophy-title {
  margin: 9px 0 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--color-muted-2);
}

.trophy-art {
  position: relative;
  margin-top: 9px;
  flex: 1 1 auto;
  min-height: 112px;
  border-radius: 10px;
  border: 1.5px dashed var(--color-border-strong);
  background: var(--color-bg-soft);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.trophy-progress {
  margin-top: 11px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}
.trophy-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trophy-progress-row span {
  font-size: var(--text-micro-size);
  font-weight: 600;
  color: var(--color-muted-2);
}
.trophy-progress-row strong {
  font: 700 12px/1 var(--font-mono);
  color: var(--color-muted);
}
.trophy-progress-track {
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface-2);
  margin-top: 8px;
  overflow: hidden;
}
.trophy-progress-fill {
  height: 6px;
  border-radius: 3px;
  background: var(--color-border-strong);
}

.trophy-desc {
  margin: 9px 2px 0;
  font: 500 11px/1.5 var(--font-sans);
  color: var(--color-muted-2);
}
.trophy-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 9px;
  border-top: 1px solid var(--color-border);
}
.trophy-locked-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 600 10px/1 var(--font-sans);
  color: var(--color-muted-2);
}

/* 유리 시닌 — 상단 고정 광택 + 포인터 추적 하이라이트(hover-tilt 변수 구동) */
.trophy-glass {
  z-index: 5;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 16%, rgba(255, 255, 255, 0) 34%, rgba(255, 255, 255, 0) 100%);
}
.trophy-glass::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    80% 60% at calc(var(--hover-tilt-x, 0.5) * 100%) calc((var(--hover-tilt-y, 0.5) - 0.18) * 100%),
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.02) 42%,
    rgba(255, 255, 255, 0) 70%
  );
  opacity: var(--hover-tilt-opacity, 0);
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TrophyIcon from './TrophyIcon.vue'
import type { TrophyCardItem } from './trophyCatalog'

/**
 * 홀로그래픽 전리품 카드 (리디자인 ② — Trophy Cards.dc.html 이식, pokemon-cards-css 방식).
 *
 * 레이어(아래→위): 몸체(티어 그라디언트+보더) → 베이스 패턴(리본 격자+업적 아이콘, blend 없음)
 * → 노이즈 모틀(feTurbulence) → 콘텐츠 → 포일 발광(color-dodge, 포인터 radial 마스크)
 * → 유리 시닌(155deg) → 홀로 시닌 밴드+글리터. 원형 radial 글레어는 제거 확정(README).
 * 틸트: 계수 16(코너 실측 ±8°/축, 잠금 10=±5°) + scale 1.03, leave 시 0.5s ease 복귀
 *   (README 기본 계수 10/8에서 사용자 피드백으로 상향 — 2026-07-04 "틸팅을 좀 더").
 * 패턴 위치는 카드 고정 — 움직이는 것은 마스크·그라디언트 각도뿐.
 * 모바일: 포인터 드래그(touch-action:none)로 동일 동작(deviceorientation 권한 대신 터치 폴백).
 */
const props = withDefaults(defineProps<{ card: TrophyCardItem; interactive?: boolean }>(), { interactive: true })

const locked = computed(() => !props.card.earned)
const active = ref(false)
const px = ref(0.5)
const py = ref(0.5)

function onMove(event: PointerEvent) {
  if (!props.interactive) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!rect.width || !rect.height) return
  px.value = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  py.value = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  active.value = true
}

function onLeave() {
  active.value = false
  px.value = 0.5
  py.value = 0.5
}

const cardStyle = computed(() => {
  const max = locked.value ? 10 : 16
  const rx = active.value ? (0.5 - py.value) * max : 0
  const ry = active.value ? (px.value - 0.5) * max : 0
  return {
    transform: `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${active.value ? 1.03 : 1})`,
    transition: active.value ? 'transform 0.08s ease-out, box-shadow 0.3s ease' : 'transform 0.5s ease, box-shadow 0.5s ease'
  }
})

const glassStyle = computed(() => {
  if (!active.value) return undefined
  const x = (px.value * 100).toFixed(1)
  const y = (py.value * 100 - 18).toFixed(1)
  return {
    background: `radial-gradient(80% 60% at ${x}% ${y}%, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.05) 42%, rgba(255, 255, 255, 0) 70%), linear-gradient(155deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 30%)`
  }
})

const shineStyle = computed(() => {
  if (!active.value || locked.value) return undefined
  const bx = (100 - px.value * 100).toFixed(1)
  const by = (100 - py.value * 100).toFixed(1)
  return {
    backgroundPosition: `${bx}% ${by}%, ${(px.value * 100).toFixed(1)}% ${(py.value * 100).toFixed(1)}%`,
    opacity: 0.4,
    transition: 'opacity 0.1s ease-out'
  }
})

const foilStyle = computed(() => {
  if (!active.value || locked.value) return undefined
  const x = (px.value * 100).toFixed(1)
  const y = (py.value * 100).toFixed(1)
  const bx = (100 - px.value * 100).toFixed(1)
  const by = (100 - py.value * 100).toFixed(1)
  const mask = `radial-gradient(52% 46% at ${x}% ${y}%, #000 0%, rgba(0, 0, 0, 0.5) 45%, transparent 72%)`
  return {
    maskImage: mask,
    webkitMaskImage: mask,
    backgroundPosition: `0px 0px, ${bx}% ${by}%`,
    opacity: 0.9,
    transition: 'opacity 0.1s ease-out'
  }
})

const artHoloStyle = computed(() => {
  if (!active.value || locked.value) return undefined
  return { backgroundPosition: `${(100 - px.value * 100).toFixed(1)}% ${(100 - py.value * 100).toFixed(1)}%` }
})

const progressPct = computed(() => {
  const p = props.card.progress
  if (!p || p.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.current / p.target) * 100)))
})

const footDate = computed(() => (props.card.achievedAt ?? '').replaceAll('-', '.'))
</script>

<template>
  <div class="trophy-frame" :class="{ interactive }" @pointermove="onMove" @pointerleave="onLeave" @pointercancel="onLeave">
    <div class="trophy-card" :class="[`tier-${card.tier}`, { locked, active }]" :style="cardStyle">
      <div class="trophy-layer trophy-base" aria-hidden="true" />
      <div class="trophy-layer trophy-noise" aria-hidden="true" />
      <div class="trophy-content">
        <div class="trophy-head">
          <span class="trophy-chip">{{ locked ? 'LOCKED' : card.tier.toUpperCase() }}</span>
          <span class="trophy-badge">
            <em v-if="card.badgePrefix">{{ card.badgePrefix }}</em>
            <strong>{{ card.badgeValue }}</strong>
          </span>
        </div>
        <h3 class="trophy-title">{{ card.title }}</h3>
        <div class="trophy-art">
          <div v-if="!locked" class="trophy-art-holo" :style="artHoloStyle" aria-hidden="true" />
          <TrophyIcon :kind="card.kind" :locked="locked" :size="72" />
          <span v-if="!locked && card.kind === 'pb' && card.valueText" class="trophy-art-value">{{ card.valueText }}</span>
        </div>
        <div v-if="!locked" class="trophy-stat">
          <span class="trophy-stat-check" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9 17.5 20 6.5" /></svg>
          </span>
          <span class="trophy-stat-label">{{ card.statLabel }}</span>
          <span v-if="card.valueText" class="trophy-stat-value">{{ card.valueText }}</span>
        </div>
        <div v-else-if="card.progress" class="trophy-progress">
          <div class="trophy-progress-row">
            <span>{{ card.progress.label }}</span>
            <strong>{{ card.progress.valueText }}</strong>
          </div>
          <div class="trophy-progress-track"><div class="trophy-progress-fill" :style="{ width: `${progressPct}%` }" /></div>
        </div>
        <p class="trophy-desc">{{ card.description }}</p>
        <div class="trophy-foot">
          <template v-if="!locked">
            <span class="trophy-date">{{ footDate }}</span>
            <span class="trophy-holo-tag">HOLO</span>
          </template>
          <span v-else class="trophy-locked-tag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            미획득
          </span>
        </div>
      </div>
      <div v-if="!locked" class="trophy-layer trophy-foil" :style="foilStyle" aria-hidden="true" />
      <div class="trophy-layer trophy-glass" :style="glassStyle" aria-hidden="true" />
      <div v-if="!locked" class="trophy-layer trophy-shine" :style="shineStyle" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.trophy-frame {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 5 / 7;
  border-radius: 18px;
  perspective: 1000px;
}
.trophy-frame.interactive {
  touch-action: none;
}

.trophy-card {
  --tc-bg-a: var(--trophy-gold-bg-a);
  --tc-bg-b: var(--trophy-gold-bg-b);
  --tc-bg-c: var(--trophy-gold-bg-c);
  --tc-border: var(--trophy-gold-border);
  --tc-chip: var(--trophy-gold-chip);
  --tc-text: var(--trophy-gold-text);
  --tc-art-tint: var(--color-primary);
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 18px;
  transform-style: preserve-3d;
  overflow: hidden;
  background: linear-gradient(160deg, var(--tc-bg-a), var(--tc-bg-b) 55%, var(--tc-bg-c));
  border: 2px solid var(--tc-border);
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.55),
    0 0 44px color-mix(in srgb, var(--tc-border) 22%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.trophy-card.active:not(.locked) {
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.55),
    0 0 60px color-mix(in srgb, var(--tc-border) 40%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}
.trophy-card.tier-silver {
  --tc-bg-a: var(--trophy-silver-bg-a);
  --tc-bg-b: var(--trophy-silver-bg-b);
  --tc-bg-c: var(--trophy-silver-bg-c);
  --tc-border: var(--trophy-silver-border);
  --tc-chip: var(--trophy-silver-chip);
  --tc-text: var(--trophy-silver-text);
  --tc-art-tint: var(--color-accent);
}
.trophy-card.tier-bronze {
  --tc-bg-a: var(--trophy-bronze-bg-a);
  --tc-bg-b: var(--trophy-bronze-bg-b);
  --tc-bg-c: var(--trophy-bronze-bg-c);
  --tc-border: var(--trophy-bronze-border);
  --tc-chip: var(--trophy-bronze-chip);
  --tc-text: var(--trophy-bronze-text);
  --tc-art-tint: var(--trophy-bronze-chip);
}
/* 잠금 몸체 — 실버 바탕 계열의 무채색 + 점선 보더(데모 카드 3 이식) */
.trophy-card.locked {
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
  opacity: 0.14;
}
.trophy-card.locked .trophy-base {
  opacity: 0.1;
}
/* 노이즈 모틀 — 금속 포일 질감 */
.trophy-noise {
  background-image: url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27300%27%20height=%27300%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%27.028%27%20numOctaves=%274%27%20seed=%277%27/%3E%3C/filter%3E%3Crect%20width=%27300%27%20height=%27300%27%20filter=%27url%28%23n%29%27/%3E%3C/svg%3E);
  background-size: 320px 320px;
  opacity: 0.07;
}
.trophy-card.locked .trophy-noise {
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
  color: var(--tc-bg-b);
  background: var(--tc-chip);
  padding: 4px 7px;
  border-radius: 5px;
}
.trophy-card.locked .trophy-chip {
  color: var(--color-muted-2);
  background: var(--color-surface-2);
}
.trophy-badge {
  display: flex;
  align-items: baseline;
  gap: 3px;
}
.trophy-badge em {
  font: 800 15px/1 var(--font-sans);
  font-style: normal;
  color: var(--tc-text);
}
.trophy-badge strong {
  font: 800 20px/1 var(--font-mono);
  color: var(--color-strong);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}
.trophy-card.locked .trophy-badge em,
.trophy-card.locked .trophy-badge strong {
  color: var(--color-muted-2);
  text-shadow: none;
  font-size: 12px;
}
.trophy-title {
  margin: 9px 0 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--color-strong);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.trophy-card.locked .trophy-title {
  color: var(--color-muted-2);
  text-shadow: none;
}

.trophy-art {
  position: relative;
  margin-top: 9px;
  flex: 1 1 auto;
  min-height: 112px;
  border-radius: 10px;
  border: 1.5px solid color-mix(in srgb, var(--tc-chip) 50%, transparent);
  background: radial-gradient(120px 90px at 50% 38%, color-mix(in srgb, var(--tc-art-tint) 18%, var(--tc-bg-c)), var(--tc-bg-c));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.trophy-card.locked .trophy-art {
  border: 1.5px dashed var(--color-border-strong);
  background: var(--color-bg-soft);
}
.trophy-art-holo {
  position: absolute;
  inset: 0;
  opacity: 0.2;
  background: linear-gradient(115deg, transparent 30%, color-mix(in srgb, var(--tc-chip) 85%, transparent) 48%, color-mix(in srgb, var(--tc-art-tint) 85%, transparent) 56%, transparent 74%);
  background-size: 220% 220%;
  mix-blend-mode: screen;
}
.trophy-art-value {
  position: relative;
  font: 800 15px/1 var(--font-mono);
  color: var(--tc-bg-b);
  background: var(--tc-chip);
  padding: 3px 8px;
  border-radius: 6px;
}

.trophy-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}
.trophy-stat-check {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--tc-chip);
  color: var(--tc-bg-b);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.trophy-stat-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--tc-text);
}
.trophy-stat-value {
  margin-left: auto;
  font: 800 15px/1 var(--font-mono);
  color: var(--color-strong);
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
  font-size: 11px;
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
  color: color-mix(in srgb, var(--tc-text) 72%, var(--color-muted));
}
.trophy-card.locked .trophy-desc {
  color: var(--color-muted-2);
}
.trophy-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 9px;
  border-top: 1px solid color-mix(in srgb, var(--tc-chip) 25%, transparent);
}
.trophy-card.locked .trophy-foot {
  border-top: 1px solid var(--color-border);
  justify-content: center;
}
.trophy-date {
  font: 600 10px/1 var(--font-mono);
  color: color-mix(in srgb, var(--tc-text) 65%, var(--color-muted-2));
}
.trophy-holo-tag {
  font: 600 10px/1 var(--font-sans);
  color: color-mix(in srgb, var(--tc-text) 65%, var(--color-muted-2));
}
.trophy-locked-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: 600 10px/1 var(--font-sans);
  color: var(--color-muted-2);
}

/* 포일 발광 — 패턴은 카드 고정(0,0), 티어 그라디언트 각도·radial 마스크만 포인터 추적 */
.trophy-foil {
  z-index: 3;
  background-image: url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2788%27%20height=%27112%27%3E%3Cg%20fill=%27%23ffffff%27%3E%3Cpath%20d=%27M0%200H44V28L22%2016L0%2028Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M0%2028L22%2016L44%2028V84L22%2072L0%2084Z%27%20fill-opacity=%27.06%27/%3E%3Cpath%20d=%27M0%2084L22%2072L44%2084V112H0Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M44%200L66%20-12L88%200V56L66%2044L44%2056Z%27%20fill-opacity=%27.06%27/%3E%3Cpath%20d=%27M44%2056L66%2044L88%2056V112L66%20100L44%20112Z%27%20fill-opacity=%27.12%27/%3E%3Cpath%20d=%27M44%20112L66%20100L88%20112Z%27%20fill-opacity=%27.06%27/%3E%3C/g%3E%3Cg%20fill=%27%23ffffff%27%20opacity=%27.5%27%3E%3Cpath%20d=%27M22%2044l3.2%206.5%207.2%201-5.2%205.1%201.2%207.2-6.4-3.4-6.4%203.4%201.2-7.2-5.2-5.1%207.2-1z%27/%3E%3Cpath%20d=%27M59%2014h14v6a7%207%200%200%201-14%200z%27/%3E%3Crect%20x=%2764.5%27%20y=%2725%27%20width=%273%27%20height=%274%27/%3E%3Cpath%20d=%27M61%2030h10l1.5%203h-13z%27/%3E%3Cpath%20d=%27M17%20107l-3-8h6zM27%20107l3-8h-6z%27/%3E%3Ccircle%20cx=%2722%27%20cy=%27112%27%20r=%276%27/%3E%3Ccircle%20cx=%2722%27%20cy=%270%27%20r=%276%27/%3E%3Crect%20x=%2760%27%20y=%2770%27%20width=%271.8%27%20height=%2718%27/%3E%3Cpath%20d=%27M63%2071h10l-2.6%203.2%202.6%203.2h-10z%27/%3E%3C/g%3E%3C/svg%3E), linear-gradient(115deg, var(--tc-foil-a), var(--tc-foil-b), var(--tc-foil-c), var(--tc-text), var(--tc-foil-a));
  background-size: 88px 112px, 300% 300%;
  background-blend-mode: color-dodge;
  mix-blend-mode: color-dodge;
  opacity: 0.06;
  transition: opacity 0.6s ease;
  -webkit-mask-image: radial-gradient(60% 55% at 50% 42%, #000 0%, rgba(0, 0, 0, 0.35) 50%, transparent 78%);
  mask-image: radial-gradient(60% 55% at 50% 42%, #000 0%, rgba(0, 0, 0, 0.35) 50%, transparent 78%);
}
.trophy-card.tier-gold {
  --tc-foil-a: var(--trophy-gold-foil-a);
  --tc-foil-b: var(--trophy-gold-foil-b);
  --tc-foil-c: var(--trophy-gold-foil-c);
}
.trophy-card.tier-silver {
  --tc-foil-a: var(--trophy-silver-foil-a);
  --tc-foil-b: var(--trophy-silver-foil-b);
  --tc-foil-c: var(--trophy-silver-foil-c);
}
.trophy-card.tier-bronze {
  --tc-foil-a: var(--trophy-bronze-foil-a);
  --tc-foil-b: var(--trophy-bronze-foil-b);
  --tc-foil-c: var(--trophy-bronze-foil-c);
}

/* 유리 시닌 — 상단 155deg 광택 띠, 포인터 따라 이동(잠금 포함 전 카드) */
.trophy-glass {
  z-index: 5;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 14%, rgba(255, 255, 255, 0) 32%, rgba(255, 255, 255, 0) 100%);
}
.trophy-card.locked .trophy-glass {
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 16%, rgba(255, 255, 255, 0) 34%, rgba(255, 255, 255, 0) 100%);
}

/* 홀로 시닌 — 사선 흰 밴드(저강도) + 글리터 도트, color-dodge. 원형 글레어 아님 */
.trophy-shine {
  z-index: 6;
  background:
    radial-gradient(1.6px 1.6px at 20% 30%, rgba(255, 255, 255, 0.6), transparent 60%),
    radial-gradient(1.6px 1.6px at 65% 55%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.4px 1.4px at 40% 80%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.4px 1.4px at 82% 22%, rgba(255, 255, 255, 0.5), transparent 60%),
    radial-gradient(1.5px 1.5px at 12% 68%, rgba(255, 255, 255, 0.45), transparent 60%),
    linear-gradient(115deg, rgba(255, 255, 255, 0) 36%, rgba(255, 255, 255, 0.26) 47%, rgba(255, 255, 255, 0.38) 52%, rgba(255, 255, 255, 0.26) 57%, rgba(255, 255, 255, 0) 70%);
  background-size: 120px 120px, 120px 120px, 120px 120px, 120px 120px, 120px 120px, 240% 240%;
  mix-blend-mode: color-dodge;
  opacity: 0;
  transition: opacity 0.5s ease;
}
</style>

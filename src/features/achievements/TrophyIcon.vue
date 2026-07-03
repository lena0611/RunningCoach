<script setup lang="ts">
import type { TrophyKind } from './trophyCatalog'

/**
 * 전리품 카드 종류별 픽토그램 (리디자인 ②).
 * 색은 부모의 --tc-chip/--tc-text(티어 로컬 변수)를 currentColor 계열로 상속받아 칠한다.
 * locked 이면 외곽선만 회색(--color-muted-2 계열)으로 그린다.
 */
defineProps<{ kind: TrophyKind; size?: number; locked?: boolean }>()
</script>

<template>
  <!-- 잠금: 자물쇠 외곽선 실루엣 (kind 무관) -->
  <svg v-if="locked" :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.6" class="trophy-icon trophy-icon-locked" aria-hidden="true">
    <rect x="10" y="18" width="20" height="14" rx="3" />
    <path d="M14 18v-4a6 6 0 0 1 12 0v4" />
  </svg>
  <!-- PB: 트로피 -->
  <svg v-else-if="kind === 'pb'" :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" class="trophy-icon" aria-hidden="true">
    <path d="M13 8h14v6a7 7 0 0 1-14 0z" fill="var(--tc-chip)" />
    <path d="M13 10h-4a4 4 0 0 0 4 4M27 10h4a4 4 0 0 1-4 4" fill="none" stroke="var(--tc-text)" stroke-width="2.4" stroke-linecap="round" />
    <rect x="18.4" y="20" width="3.2" height="5" fill="var(--tc-chip)" />
    <path d="M12 27h16l2 5H10z" fill="var(--tc-chip)" />
  </svg>
  <!-- 마일스톤: 결승 깃발 -->
  <svg v-else-if="kind === 'milestone'" :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" class="trophy-icon" aria-hidden="true">
    <rect x="12" y="6" width="2.6" height="28" rx="1.3" fill="var(--tc-text)" />
    <path d="M16.5 8h14l-4 5 4 5h-14z" fill="var(--tc-chip)" />
  </svg>
  <!-- 스트릭: 불꽃 (티어 무관 앰버 — 꾸준함 시그니처) -->
  <svg v-else-if="kind === 'streak'" :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" class="trophy-icon" aria-hidden="true">
    <path d="M20 6c5 7 8 9 8 15a8 8 0 0 1-16 0c0-4 2-6 4-8 .7 3 3 3.6 4.3 2.3-1.6-4.3 0-7-.3-9.3z" fill="var(--color-warning)" />
  </svg>
  <!-- 주/월 최다: 캘린더 + 볼륨 바 -->
  <svg v-else-if="kind === 'weekly' || kind === 'monthly'" :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" class="trophy-icon" aria-hidden="true">
    <rect x="8" y="10" width="24" height="22" rx="3" fill="none" stroke="var(--tc-chip)" stroke-width="2.4" />
    <path d="M14 7v5M26 7v5" stroke="var(--tc-text)" stroke-width="2.4" stroke-linecap="round" />
    <path d="M14 26v-5M20 26v-9M26 26v-3" stroke="var(--tc-chip)" stroke-width="2.6" stroke-linecap="round" />
  </svg>
  <!-- 누적 클럽: 도로 -->
  <svg v-else :width="size ?? 26" :height="size ?? 26" viewBox="0 0 40 40" class="trophy-icon" aria-hidden="true">
    <path d="M16 8 10 32M24 8l6 24" stroke="var(--tc-chip)" stroke-width="2.6" stroke-linecap="round" fill="none" />
    <path d="M20 10v4M20 19v4M20 28v4" stroke="var(--tc-text)" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="4 5" />
  </svg>
</template>

<style scoped>
.trophy-icon {
  display: block;
}
.trophy-icon-locked {
  color: var(--color-muted-2);
  opacity: 0.55;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import TrophyIcon from './TrophyIcon.vue'
import type { TrophyCardItem } from './trophyCatalog'

/**
 * 전리품 미니 타일 (리디자인 ② — Row 7 L1 카드 스트립 + L2 컬렉션 그리드 겸용).
 * 획득=티어 프레임(그라디언트+티어 보더+칩), 미획득=잠금 실루엣(점선).
 * showProgress(컬렉션 그리드)면 미획득 타일에 진행바, 획득 타일에 대표 값을 덧붙인다.
 */
const props = defineProps<{ card: TrophyCardItem; showProgress?: boolean }>()
defineEmits<{ select: [] }>()

const shortLabel = computed(() => {
  const c = props.card
  switch (c.kind) {
    case 'pb':
      return `${c.badgeValue} PR`
    case 'milestone':
      return `첫 ${c.badgeValue}`
    case 'streak':
      return c.earned ? `${c.valueText} 스트릭` : '스트릭'
    case 'weekly':
      return c.earned ? `주 ${c.valueText}` : '주간 최다'
    case 'monthly':
      return c.earned ? `월 ${c.valueText}` : '월간 최다'
    default:
      return c.title.replace('누적 ', '').replace(' 클럽', ' 클럽')
  }
})

const progressPct = computed(() => {
  const p = props.card.progress
  if (!p || p.target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((p.current / p.target) * 100)))
})
</script>

<template>
  <button type="button" class="trophy-tile" :class="[`tier-${card.tier}`, { locked: !card.earned }]" :aria-label="`${card.title} — ${card.earned ? '획득' : '미획득'}`" @click="$emit('select')">
    <span v-if="card.earned" class="trophy-tile-chip">{{ card.tier.toUpperCase() }}</span>
    <TrophyIcon :kind="card.kind" :locked="!card.earned" :size="showProgress ? 34 : 26" />
    <span class="trophy-tile-label">{{ shortLabel }}</span>
    <template v-if="showProgress">
      <span v-if="card.earned && card.valueText" class="trophy-tile-value">{{ card.valueText }}</span>
      <span v-else-if="card.progress" class="trophy-tile-progress">
        <span class="trophy-tile-progress-track"><span class="trophy-tile-progress-fill" :style="{ width: `${progressPct}%` }" /></span>
        <span class="trophy-tile-progress-text">{{ card.progress.valueText }}</span>
      </span>
    </template>
  </button>
</template>

<style scoped>
.trophy-tile {
  --tc-chip: var(--color-muted);
  --tc-text: var(--color-text);
  flex: 1;
  aspect-ratio: 5 / 7;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 6px;
  border: 1.5px solid transparent;
  background: var(--color-bg-soft);
  cursor: pointer;
  font-family: inherit;
}
.trophy-tile.tier-gold {
  --tc-chip: var(--trophy-gold-chip);
  --tc-text: var(--trophy-gold-text);
  background: linear-gradient(160deg, var(--trophy-gold-bg-a), var(--trophy-gold-bg-b) 60%);
  border-color: var(--trophy-gold-border);
}
.trophy-tile.tier-silver {
  --tc-chip: var(--trophy-silver-chip);
  --tc-text: var(--trophy-silver-text);
  background: linear-gradient(160deg, var(--trophy-silver-bg-a), var(--trophy-silver-bg-b) 60%);
  border-color: var(--trophy-silver-border);
}
.trophy-tile.tier-bronze {
  --tc-chip: var(--trophy-bronze-chip);
  --tc-text: var(--trophy-bronze-text);
  background: linear-gradient(160deg, var(--trophy-bronze-bg-a), var(--trophy-bronze-bg-b) 60%);
  border-color: var(--trophy-bronze-border);
}
.trophy-tile.locked {
  background: var(--color-bg-soft);
  border: 1.5px dashed var(--color-border-strong);
}
.trophy-tile-chip {
  position: absolute;
  top: 6px;
  left: 6px;
  font: 700 7px/1 var(--font-mono);
  letter-spacing: 0.04em;
  color: var(--color-bg);
  background: var(--tc-chip);
  padding: 2px 4px;
  border-radius: 3px;
}
.tier-gold .trophy-tile-chip {
  color: var(--trophy-gold-bg-b);
}
.tier-silver .trophy-tile-chip {
  color: var(--trophy-silver-bg-b);
}
.tier-bronze .trophy-tile-chip {
  color: var(--trophy-bronze-bg-b);
}
.trophy-tile-label {
  font: 800 9px/1.2 var(--font-mono);
  color: var(--tc-text);
  text-align: center;
  word-break: keep-all;
}
.trophy-tile.locked .trophy-tile-label {
  font: 600 8.5px/1.2 var(--font-sans);
  color: var(--color-muted-2);
}
.trophy-tile-value {
  font: 700 11px/1 var(--font-mono);
  color: var(--color-text);
}
.trophy-tile-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 82%;
}
.trophy-tile-progress-track {
  display: block;
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: var(--color-surface-2);
  overflow: hidden;
}
.trophy-tile-progress-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--color-border-strong);
}
.trophy-tile-progress-text {
  font: 600 8.5px/1 var(--font-mono);
  color: var(--color-muted-2);
}
</style>

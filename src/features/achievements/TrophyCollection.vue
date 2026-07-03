<script setup lang="ts">
import { computed, ref } from 'vue'
import TrophyTile from './TrophyTile.vue'
import type { TrophyCardItem, TrophyTier } from './trophyCatalog'

/**
 * 전리품 컬렉션 그리드 (리디자인 ② L2 — README §8).
 * 진행 헤더(획득/전체 + 티어별 카운트 + 진행바) → 필터 칩 → 2열 타일 그리드(미획득=잠금+진행바).
 * 타일 탭 → 카드 상세(L3) 는 부모가 select 이벤트로 연다.
 */
const props = defineProps<{ cards: TrophyCardItem[] }>()
defineEmits<{ select: [card: TrophyCardItem] }>()

type Filter = 'all' | TrophyTier | 'locked'
const filter = ref<Filter>('all')
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'gold', label: '골드' },
  { key: 'silver', label: '실버' },
  { key: 'bronze', label: '브론즈' },
  { key: 'locked', label: '미획득' }
]

const earnedCount = computed(() => props.cards.filter((c) => c.earned).length)
const tierCount = (tier: TrophyTier) => props.cards.filter((c) => c.tier === tier && c.earned).length
const progressPct = computed(() => (props.cards.length ? Math.round((earnedCount.value / props.cards.length) * 100) : 0))

const visibleCards = computed(() => {
  if (filter.value === 'all') return props.cards
  if (filter.value === 'locked') return props.cards.filter((c) => !c.earned)
  return props.cards.filter((c) => c.tier === filter.value)
})
</script>

<template>
  <div class="trophy-collection">
    <div class="trophy-collection-head">
      <span class="trophy-collection-count"><strong>{{ earnedCount }}</strong><span class="trophy-collection-total">/{{ cards.length }}</span></span>
      <div class="trophy-collection-track"><div class="trophy-collection-fill" :style="{ width: `${progressPct}%` }" /></div>
      <div class="trophy-collection-tiers">
        <span class="tier-chip tier-chip-gold">골드 {{ tierCount('gold') }}</span>
        <span class="tier-chip tier-chip-silver">실버 {{ tierCount('silver') }}</span>
        <span class="tier-chip tier-chip-bronze">브론즈 {{ tierCount('bronze') }}</span>
      </div>
    </div>

    <div class="trophy-collection-filters" role="tablist" aria-label="컬렉션 필터">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        role="tab"
        :aria-selected="filter === f.key"
        :class="{ active: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <div class="trophy-collection-grid">
      <TrophyTile v-for="card in visibleCards" :key="card.id" :card="card" show-progress @select="$emit('select', card)" />
    </div>
    <p v-if="!visibleCards.length" class="trophy-collection-empty">이 필터에 해당하는 카드가 없어요.</p>
  </div>
</template>

<style scoped>
.trophy-collection-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.trophy-collection-count strong {
  font: 800 20px/1 var(--font-mono);
  color: var(--color-celebrate-text);
}
.trophy-collection-total {
  font: 700 14px/1 var(--font-mono);
  color: var(--color-muted-2);
}
.trophy-collection-track {
  flex: 1;
  min-width: 90px;
  height: 7px;
  border-radius: 4px;
  background: var(--color-surface-2);
  overflow: hidden;
}
.trophy-collection-fill {
  height: 7px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-celebrate));
}
.trophy-collection-tiers {
  display: flex;
  gap: 7px;
  width: 100%;
}
.tier-chip {
  font: 600 11px/1 var(--font-sans);
  padding: 5px 9px;
  border-radius: 999px;
}
.tier-chip-gold {
  color: var(--trophy-gold-chip);
  background: color-mix(in srgb, var(--trophy-gold-border) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--trophy-gold-border) 42%, transparent);
}
.tier-chip-silver {
  color: var(--trophy-silver-chip);
  background: color-mix(in srgb, var(--trophy-silver-border) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--trophy-silver-border) 34%, transparent);
}
.tier-chip-bronze {
  color: var(--trophy-bronze-chip);
  background: color-mix(in srgb, var(--trophy-bronze-chip) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--trophy-bronze-chip) 38%, transparent);
}

.trophy-collection-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.trophy-collection-filters button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  color: var(--color-muted);
  font: 600 12px/1 var(--font-sans);
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
}
.trophy-collection-filters button.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 700;
}

.trophy-collection-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.trophy-collection-empty {
  margin: 18px 1px 0;
  font: 500 12px/1.5 var(--font-sans);
  color: var(--color-muted-2);
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import HoloTrophyCard from './HoloTrophyCard.vue'
import type { TrophyCardItem, TrophyKind, TrophyTier } from './trophyCatalog'

/**
 * 전리품 컬렉션 그리드 (디자인 "Trophy Collection").
 *
 * 진행 헤더 → 필터 칩 → **그룹별 카드 그리드**. 예전엔 14장을 한 그리드에 납작한 타일로 늘어놨는데,
 * 그러면 "PB 4장 · 마일스톤 4장 · …" 같은 **컬렉션의 구조가 안 보인다**. 획득 동기는 "무엇을 모으는
 * 중인지"에서 나오므로 4개 묶음(자기기록/마일스톤/스트릭/볼륨)으로 나누고 각 묶음에 티어·설명을 단다.
 *
 * 필터는 유지한다 — 그룹은 구조를 보여주고, 필터는 "미획득만" 처럼 목적 있는 탐색을 돕는다.
 * 필터로 비워진 그룹은 헤더까지 감춰 빈 제목만 남지 않게 한다.
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

/** 컬렉션 묶음 — 카드 kind 를 사용자가 이해하는 4개 축으로 접는다(볼륨은 주간·월간·클럽을 함께). */
const GROUPS: { key: string; title: string; desc: string; kinds: TrophyKind[] }[] = [
  { key: 'pb', title: '자기기록 · PB', desc: '개인 최고 기록을 경신할 때', kinds: ['pb'] },
  { key: 'milestone', title: '마일스톤 · 첫 달성', desc: '처음 해내는 순간', kinds: ['milestone'] },
  { key: 'streak', title: '스트릭 · 습관', desc: '연속으로 이어갈 때', kinds: ['streak'] },
  { key: 'volume', title: '볼륨 · 누적', desc: '쌓아 올린 거리', kinds: ['weekly', 'monthly', 'club'] }
]

/**
 * 그룹 티어 라벨 — **그룹 전체가 한 티어일 때만** 표시한다.
 * 볼륨 그룹은 주간·월간(실버) + 클럽(브론즈)이 섞여서, 최고 티어 하나를 적으면 "SILVER" 라고
 * 써놓고 브론즈 카드를 함께 보여주는 거짓말이 된다(2026-08-11 실측). 섞이면 라벨을 생략한다.
 */
const visibleGroups = computed(() =>
  GROUPS.map((group) => {
    const cards = visibleCards.value.filter((card) => group.kinds.includes(card.kind))
    const tiers = new Set<TrophyTier>(cards.map((card) => card.tier))
    return {
      ...group,
      cards,
      tier: tiers.size === 1 ? [...tiers][0] : null,
      earned: cards.filter((card) => card.earned).length
    }
  }).filter((group) => group.cards.length > 0)
)
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

    <section v-for="group in visibleGroups" :key="group.key" class="trophy-group">
      <header class="trophy-group-head">
        <span v-if="group.tier" class="trophy-group-dot" :class="`tier-${group.tier}`" aria-hidden="true" />
        <h3 class="trophy-group-title">{{ group.title }}</h3>
        <span v-if="group.tier" class="trophy-group-tier">{{ group.tier.toUpperCase() }}</span>
        <span class="trophy-group-count">{{ group.earned }}/{{ group.cards.length }}</span>
        <span class="trophy-group-desc">{{ group.desc }}</span>
      </header>
      <div class="trophy-collection-grid">
        <HoloTrophyCard v-for="card in group.cards" :key="card.id" :card="card" size="grid" @select="$emit('select', card)" />
      </div>
    </section>
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

/* 그룹 헤더 — 점(티어) · 제목 · 티어 라벨 · 획득수 · 설명 */
.trophy-group + .trophy-group {
  margin-top: 22px;
}
.trophy-group-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.trophy-group-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  align-self: center;
  background: var(--color-border-strong);
}
.trophy-group-dot.tier-gold {
  background: var(--trophy-gold-chip);
}
.trophy-group-dot.tier-silver {
  background: var(--trophy-silver-chip);
}
.trophy-group-dot.tier-bronze {
  background: var(--trophy-bronze-chip);
}
.trophy-group-title {
  margin: 0;
  font: 800 14px/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--color-text);
}
.trophy-group-tier {
  font: 600 10px/1 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--color-muted-2);
}
.trophy-group-count {
  font: 700 11px/1 var(--font-mono);
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}
.trophy-group-desc {
  font: 500 11px/1.4 var(--font-sans);
  color: var(--color-muted-2);
  word-break: keep-all;
}

.trophy-collection-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
/* 카드 정보량이 많아 좁은 화면에선 2열이 빽빽하다 — 아주 좁을 때만 1열로 떨어뜨린다. */
@media (max-width: 22rem) {
  .trophy-collection-grid {
    grid-template-columns: 1fr;
  }
}
.trophy-collection-empty {
  margin: 18px 1px 0;
  font: 500 12px/1.5 var(--font-sans);
  color: var(--color-muted-2);
}
</style>

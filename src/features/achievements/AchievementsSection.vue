<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RunLog } from '@/entities/run/model'
import { computeAchievements, type AchievementContext } from '@/shared/lib/achievement/achievements'
import { formatDuration, formatPace } from '@/shared/lib/format'
import StackPage from '@/shared/ui/StackPage.vue'
import HoloTrophyCard from './HoloTrophyCard.vue'
import TrophyCollection from './TrophyCollection.vue'
import { buildTrophyCatalog, distanceLabel, CANONICAL_DISTANCES_M, type TrophyCardItem } from './trophyCatalog'
import { loadTrophySeen, reconcileTrophySeen, saveTrophySeen } from './trophySeen'

/**
 * 업적 홈 (리디자인 ② — Row 7 L1). 계정 드로어 → App 레벨 StackPage 가 호스팅.
 * 훈련/레이싱 토글 → 전리품 카드 스트립 → 거리별 PB 그리드(캐노니컬 4) → 기록 → 마일스톤 → 꾸준함.
 * L2(컬렉션)=중첩 StackPage push, L3(카드 상세)=Teleport 모달(홀로그래픽 카드 1장).
 */
const props = defineProps<{ runs: RunLog[] }>()

const activeContext = ref<AchievementContext>('training')
const set = computed(() => computeAchievements(props.runs))
const hasRace = computed(() => props.runs.some((run) => (run.tags ?? []).includes('self-race')))

const catalogTraining = computed(() => buildTrophyCatalog(set.value, props.runs, 'training'))
const catalogRace = computed(() => buildTrophyCatalog(set.value, props.runs, 'race'))
const cards = computed(() => (activeContext.value === 'race' ? catalogRace.value : catalogTraining.value))

// NEW 배지: 저장 지문과 대조해 갱신·신규 획득만 켠다. 최초 방문은 조용히 베이스라인.
// 방문 중 값은 고정(다음 방문에서 소거) — StackPage 가 open 마다 v-if 재마운트하므로 방문 단위로 동작.
const newIds = ref<Set<string>>(new Set())
watch(
  () => props.runs,
  (runs) => {
    if (!runs.length) return
    const { newIds: ids, nextSeen } = reconcileTrophySeen([...catalogTraining.value, ...catalogRace.value], loadTrophySeen())
    newIds.value = ids
    saveTrophySeen(nextSeen)
  },
  { immediate: true }
)

/**
 * 스트립 카운터도 **이 탭 고유 카드만** 센다 — 꾸준함·클럽 6장은 훈련/레이싱 통합 집계라 어느 탭에서도
 * 획득으로 들어오고, 그걸 함께 세면 레이싱 400m 계정의 레이싱 탭이 `6/14` 로 보인다(2026-08-11 지적).
 * 통합 집계 카드의 존재는 컬렉션 헤더에서 따로 밝힌다.
 */
const contextCards = computed(() => cards.value.filter((c) => c.scope === 'context'))
const earnedCount = computed(() => contextCards.value.filter((c) => c.earned).length)

/** L1 스트립: 최근 획득 2장 + 다음 잠금 1장 + '+N 더 보기'. */
const stripCards = computed(() => {
  const earned = cards.value.filter((c) => c.earned).sort((a, b) => (b.achievedAt ?? '').localeCompare(a.achievedAt ?? ''))
  const picked: TrophyCardItem[] = earned.slice(0, 2)
  for (const card of cards.value) {
    if (picked.length >= 3) break
    if (!card.earned && !picked.includes(card)) picked.push(card)
  }
  if (picked.length < 3) {
    for (const card of earned.slice(2)) {
      if (picked.length >= 3) break
      picked.push(card)
    }
  }
  return picked
})
const stripMoreCount = computed(() => Math.max(0, cards.value.length - stripCards.value.length))

const collectionOpen = ref(false)
const detailCard = ref<TrophyCardItem | null>(null)

function onStripSelect(card: TrophyCardItem) {
  if (card.earned) detailCard.value = card
  else collectionOpen.value = true
}

/** 거리별 PB 그리드 — 캐노니컬 4거리(5K/10K/하프/풀), 미달성=점선. */
const pbCells = computed(() =>
  cards.value
    .filter((c) => c.kind === 'pb')
    .map((c) => ({ id: c.id, label: c.badgeValue, earned: c.earned, valueText: c.valueText, isNew: newIds.value.has(c.id) }))
)

const ctxView = computed(() => {
  const ctx = activeContext.value
  return {
    longestDistance: set.value.longestDistance.find((r) => r.context === ctx) ?? null,
    longestDuration: set.value.longestDuration.find((r) => r.context === ctx) ?? null,
    fastestPace: set.value.fastestPace.find((r) => r.context === ctx) ?? null,
    milestones: new Set(set.value.firstMilestones.filter((m) => m.context === ctx).map((m) => m.distanceM))
  }
})

const recordItems = computed(() => {
  const v = ctxView.value
  const items: { label: string; value: string; unit?: string; accent?: boolean }[] = []
  if (v.longestDistance) items.push({ label: '최장 거리', value: v.longestDistance.distanceKm.toFixed(2), unit: 'km' })
  if (v.longestDuration) items.push({ label: '최장 시간', value: formatDuration(v.longestDuration.durationSec) })
  if (v.fastestPace) items.push({ label: '최속 페이스', value: formatPace(v.fastestPace.avgPaceSec), unit: '/km', accent: true })
  return items
})

const cumulative = computed(() => set.value.cumulative)
</script>

<template>
  <div class="achievements-detail">
    <div class="achievement-context-toggle" role="tablist">
      <button type="button" role="tab" :aria-selected="activeContext === 'training'" :class="{ active: activeContext === 'training' }" @click="activeContext = 'training'">훈련</button>
      <button type="button" role="tab" :aria-selected="activeContext === 'race'" :class="{ active: activeContext === 'race' }" @click="activeContext = 'race'">레이싱</button>
    </div>

    <p v-if="activeContext === 'race' && !hasRace" class="helper">
      아직 레이싱(자기와의 대결) 기록이 없어요. 첫 레이싱을 하면 레이싱 카드와 PB가 여기 쌓입니다.
    </p>

    <!-- 전리품 카드 스트립 -->
    <section class="ach-section">
      <div class="ach-sec-head">
        <span>전리품 카드</span>
        <button type="button" class="ach-strip-count" aria-label="전리품 컬렉션 열기" @click="collectionOpen = true">
          <strong>{{ earnedCount }}</strong><span class="ach-strip-total">/{{ contextCards.length }}</span> <span class="ach-strip-arrow">→</span>
        </button>
      </div>
      <div class="ach-strip">
        <HoloTrophyCard v-for="card in stripCards" :key="card.id" :card="card" size="thumb" @select="onStripSelect(card)" />
        <button v-if="stripMoreCount > 0" type="button" class="ach-strip-more" aria-label="전리품 컬렉션 더 보기" @click="collectionOpen = true">
          <strong>+{{ stripMoreCount }}</strong>
          <span>더 보기</span>
        </button>
      </div>
    </section>

    <!-- 거리별 PB -->
    <section class="ach-section">
      <div class="ach-sec-head"><span>거리별 PB</span></div>
      <div class="ach-pb-grid">
        <div v-for="cell in pbCells" :key="cell.id" class="ach-pb-cell" :class="{ locked: !cell.earned, fresh: cell.isNew }">
          <div class="ach-pb-label">
            <span>{{ cell.label }}</span>
            <span v-if="cell.isNew" class="ach-new-badge">NEW</span>
          </div>
          <div v-if="cell.earned" class="ach-pb-value">{{ cell.valueText }}</div>
          <div v-else class="ach-pb-missing">미달성</div>
        </div>
      </div>
    </section>

    <!-- 기록 -->
    <section v-if="recordItems.length" class="ach-section">
      <div class="ach-sec-head"><span>기록</span></div>
      <div class="ach-records">
        <div v-for="item in recordItems" :key="item.label" class="ach-record-row">
          <span class="ach-record-label">{{ item.label }}</span>
          <span class="ach-record-value" :class="{ accent: item.accent }">{{ item.value }}<span v-if="item.unit" class="ach-record-unit">{{ item.unit }}</span></span>
        </div>
      </div>
    </section>

    <!-- 마일스톤 -->
    <section class="ach-section">
      <div class="ach-sec-head"><span>마일스톤</span></div>
      <div class="ach-milestones">
        <span v-for="m in CANONICAL_DISTANCES_M" :key="m" class="ach-milestone-chip" :class="{ done: ctxView.milestones.has(m) }">
          <svg v-if="ctxView.milestones.has(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5" /></svg>
          <template v-else>·&nbsp;</template>{{ distanceLabel(m) }}
        </span>
      </div>
    </section>

    <!-- 꾸준함 (전체 통합) -->
    <section class="ach-section">
      <div class="ach-sec-head">
        <span>꾸준함</span>
        <span class="ach-sec-note">훈련·레이싱 전체</span>
      </div>
      <div class="ach-consistency">
        <div class="ach-consistency-cell">
          <span class="ach-flame" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2 3 5 4.5 5 8.5A5 5 0 0 1 7 12c0-1.5.6-2.6 1.5-3.5C9 10 10 10.5 11 10c-.5-2 .5-4.5 1-7z" /></svg>
          </span>
          <div class="ach-consistency-value warm">{{ cumulative.longestStreak?.days ?? 0 }}<span class="ach-record-unit">일</span></div>
          <div class="ach-consistency-caption">최장 연속</div>
        </div>
        <div class="ach-consistency-cell">
          <div class="ach-consistency-caption top">주 최고</div>
          <div class="ach-consistency-value">{{ cumulative.bestWeeklyVolume?.distanceKm ?? 0 }}<span class="ach-record-unit">km</span></div>
        </div>
        <div class="ach-consistency-cell">
          <div class="ach-consistency-caption top">월 최고</div>
          <div class="ach-consistency-value">{{ cumulative.bestMonthlyVolume?.distanceKm ?? 0 }}<span class="ach-record-unit">km</span></div>
        </div>
      </div>
    </section>

    <p class="helper">전체 기록에서 자동 산출됩니다. 새 기록을 추가하면 갱신됩니다.</p>

    <!-- L2 · 전리품 컬렉션 (push) -->
    <StackPage :open="collectionOpen" title="전리품 컬렉션" back dismiss-label="업적으로 돌아가기" layer-class="stack-layer-top" @close="collectionOpen = false">
      <TrophyCollection :cards="cards" @select="(card) => (detailCard = card)" />
    </StackPage>

    <!-- L3 · 카드 상세 (모달) -->
    <Teleport to="body">
      <Transition name="trophy-pop">
        <div v-if="detailCard" class="trophy-detail-layer" role="presentation" @click.self="detailCard = null">
          <div class="trophy-detail" role="dialog" aria-modal="true" :aria-label="detailCard.title">
            <button type="button" class="trophy-detail-close" aria-label="닫기" @click="detailCard = null">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <HoloTrophyCard :card="detailCard" size="full" :clickable="false" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.achievement-context-toggle {
  display: flex;
  width: 100%;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  margin-bottom: 18px;
}
.achievement-context-toggle button {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-muted-2);
  padding: 9px 0;
  border-radius: 999px;
  font: 600 12.5px/1 var(--font-sans);
  cursor: pointer;
  text-align: center;
}
.achievement-context-toggle button.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 700;
}

.ach-section {
  margin-bottom: 18px;
}
.ach-sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin: 0 1px 9px;
}
.ach-sec-head > span:first-child {
  font-size: var(--text-caption-size);
  font-weight: 700;
  color: var(--color-muted);
}
.ach-sec-note {
  font: 500 10px/1 var(--font-sans);
  color: var(--color-muted-2);
  margin-right: auto;
}

.ach-strip-count {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  font: 700 12px/1 var(--font-mono);
  color: var(--color-muted-2);
}
.ach-strip-count strong {
  color: var(--color-celebrate-text);
}
.ach-strip-arrow {
  color: var(--color-primary);
}
.ach-strip {
  /* flex 가 아니라 grid — 칸 폭을 컨테이너가 못박는다. flex 로 두면 카드 wrapper(<hover-tilt> 커스텀
     엘리먼트)의 고유 폭이 분배에 끼어들어 4칸이 101/101/101/139 로 어긋나고, 합이 뷰포트를 넘쳤다
     (390px 화면 → 468px, 2026-08-11 실측). 1fr 4개면 그런 되먹임이 아예 없다. */
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: start;
  gap: 9px;
}
.ach-strip > * {
  min-width: 0;
}
.ach-strip-more {
  flex: 1;
  /* 카드 높이를 따라간다 — 자기 aspect-ratio 로 모양을 스스로 정하면 폭까지 되계산해 커지면서
     스트립을 뷰포트 밖으로 밀어냈다(390px 화면 → 468px, 2026-08-11 실측). 이 타일은 카드가 아니라
     카드 옆에 서는 안내 칸이므로, 높이는 카드가 정하게 두는 게 맞다. */
  align-self: stretch;
  border-radius: 10px;
  background: var(--color-bg-soft);
  border: 1.5px dashed var(--color-border-strong);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}
.ach-strip-more strong {
  font: 800 12px/1 var(--font-mono);
  color: var(--color-muted-2);
}
.ach-strip-more span {
  font: 600 8.5px/1 var(--font-sans);
  color: var(--color-muted-2);
}

.ach-pb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.ach-pb-cell {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
}
.ach-pb-cell.locked {
  border: 1px dashed var(--color-border-strong);
}
.ach-pb-cell.fresh {
  position: relative;
  background: linear-gradient(150deg, var(--color-celebrate-soft), var(--color-surface) 65%);
  border: 1px solid color-mix(in srgb, var(--color-celebrate) 45%, transparent);
}
.ach-pb-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font: 600 11px/1 var(--font-sans);
  color: var(--color-muted-2);
}
.ach-new-badge {
  font: 700 8.5px/1 var(--font-sans);
  color: var(--color-on-celebrate);
  background: var(--color-celebrate);
  padding: 2px 5px;
  border-radius: 4px;
}
.ach-pb-value {
  font: 800 21px/1 var(--font-mono);
  margin-top: 8px;
  color: var(--color-text);
}
.ach-pb-cell.fresh .ach-pb-value {
  color: var(--color-celebrate-text);
}
.ach-pb-missing {
  font: 700 15px/1 var(--font-sans);
  margin-top: 9px;
  color: var(--color-muted-2);
}

.ach-records {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 4px 13px;
}
.ach-record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-border);
}
.ach-record-row:last-child {
  border-bottom: none;
}
.ach-record-label {
  font-size: 12.5px;
  color: var(--color-muted);
}
.ach-record-value {
  font: 700 14px/1 var(--font-mono);
  color: var(--color-text);
}
.ach-record-value.accent {
  color: var(--color-accent);
}
.ach-record-unit {
  font-size: var(--text-micro-size);
  color: var(--color-muted-2);
  margin-left: 1px;
}

.ach-milestones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ach-milestone-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 999px;
  font: 600 12px/1 var(--font-sans);
  background: var(--color-surface-2);
  color: var(--color-muted-2);
  border: 1px solid var(--color-border);
}
.ach-milestone-chip.done {
  font-weight: 700;
  background: var(--color-celebrate-soft);
  color: var(--color-celebrate-text);
  border: 1px solid color-mix(in srgb, var(--color-celebrate) 45%, transparent);
}
.ach-milestone-chip.done svg {
  color: var(--color-celebrate);
}

.ach-consistency {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 9px;
}
.ach-consistency-cell {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 12px;
}
.ach-flame {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--color-warning-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-warning);
}
.ach-consistency-value {
  font: 800 18px/1 var(--font-mono);
  margin-top: 10px;
  color: var(--color-text);
}
.ach-consistency-value.warm {
  color: var(--color-warning-text);
}
.ach-consistency-caption {
  font: 500 10px/1.2 var(--font-sans);
  color: var(--color-muted-2);
  margin-top: 5px;
}
.ach-consistency-caption.top {
  font-weight: 600;
  margin: 0 0 22px;
}
.ach-consistency-caption.top + .ach-consistency-value {
  margin-top: 0;
}

.helper {
  font: 500 11px/1.5 var(--font-sans);
  color: var(--color-muted-2);
  margin: 0 1px 16px;
}
.achievements-detail > .helper:last-of-type {
  margin: 16px 1px 0;
}

/* L3 카드 상세 모달 — 업적 스택(z-stack)과 같은 z, 나중에 붙어 위에 그려진다 */
.trophy-detail-layer {
  position: fixed;
  inset: 0;
  z-index: var(--z-stack);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* backdrop-filter 를 뺐다 — 이 레이어 위에서 카드가 3D 회전하면 iOS 가 매 프레임 배경 블러를
     다시 계산해 회전이 통째로 끊긴다(2026-08-11 실기기). 어둡게 덮는 목적은 불투명도로 충분하다. */
  background: rgba(0, 0, 0, 0.78);
}
.trophy-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  width: min(320px, 86vw);
}
.trophy-detail-close {
  /* 전역 button 은 `padding: 0 18px`·`min-height: 48px` 을 갖는다. width:34px 에 그 좌우 패딩이
     들어가면 콘텐츠 폭이 음수가 되어 **✕ 아이콘이 폭 0으로 찌그러진다** — 빈 검정 박스만 보이고,
     카드를 닫을 방법이 배경 탭밖에 남지 않았다(2026-08-11 실기기). 아이콘 버튼은 패딩을 지운다. */
  padding: 0;
  min-height: 0;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-2);
  color: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.trophy-pop-enter-active,
.trophy-pop-leave-active {
  transition: opacity 0.22s ease;
}
/* 카드 상세 등장·퇴장 — 페이드 + 살짝 확대. 한 바퀴 도는 연출을 시도했다가 되돌렸다(iOS 에서
   끝까지 부드럽게 만들지 못했다, 2026-08-11). 단순한 팝은 합성만으로 끝나 어느 기기에서도 안전하다. */
.trophy-pop-enter-active .trophy-detail,
.trophy-pop-leave-active .trophy-detail {
  transition: transform 0.22s ease;
}
.trophy-pop-enter-from,
.trophy-pop-leave-to {
  opacity: 0;
}
.trophy-pop-enter-from .trophy-detail,
.trophy-pop-leave-to .trophy-detail {
  transform: scale(0.94);
}
</style>

<script setup lang="ts">
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import type { RunnerProgress } from '@/shared/lib/level/levelModel'

// nextSession 은 getNextSessionRecommendation 결과의 구조적 부분집합만 받는다(루틴 퀘스트 표시용).
defineProps<{
  progress: RunnerProgress
  nextSession: { title: string; reason: string; dayName: string; plannedDate: string }
  weeklyDone?: number
  weeklyTarget?: number
}>()
</script>

<template>
  <SectionGroup title="퀘스트" surface-variant="subtle">
    <div class="quest-list">
      <article class="quest">
        <span class="quest-tag quest-tag-routine">◆ 루틴</span>
        <div class="quest-body">
          <strong>{{ nextSession.title }}</strong>
          <small>{{ nextSession.dayName }} 예정 · {{ nextSession.reason }}</small>
          <small v-if="weeklyTarget" class="quest-week">
            이번 주 {{ weeklyDone ?? 0 }}/{{ weeklyTarget }}회<template v-if="(weeklyDone ?? 0) >= (weeklyTarget ?? 0)"> · 완주 +30 🪙</template>
          </small>
        </div>
      </article>

      <article v-if="progress.nextClass && progress.gate1" class="quest" :class="{ 'quest-ready': progress.gate1.eligible }">
        <span class="quest-tag quest-tag-promotion">▲ 승급</span>
        <div class="quest-body">
          <strong>{{ progress.nextClass.label }} 도전</strong>
          <small v-if="progress.gate1.eligible">🔓 자격 충족 — 나만의 레이싱으로 {{ progress.nextClass.label }} 완주 시 승급</small>
          <small v-else>자격 {{ progress.gate1.percent }}% · {{ progress.gate1.reasons.join(' · ') }}</small>
        </div>
      </article>
      <article v-else class="quest">
        <span class="quest-tag quest-tag-promotion">▲ 승급</span>
        <div class="quest-body">
          <strong>최고 클래스 달성</strong>
          <small>풀 러너 🏅 — 다음 거리 클래스 없음</small>
        </div>
      </article>

      <article class="quest">
        <span class="quest-tag quest-tag-maintenance">◇ 유지</span>
        <div class="quest-body">
          <strong>{{ progress.distanceClass.label }} 폼 점검</strong>
          <small v-if="progress.maintenanceDue">측정이 오래됐어요 — 타임트라이얼로 등급을 갱신하세요</small>
          <small v-else>폼 최신 · 재측정 불필요</small>
        </div>
      </article>
    </div>
  </SectionGroup>
</template>

<style scoped>
.quest-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quest {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.quest-tag {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius-pill, 999px);
  white-space: nowrap;
  background: rgba(120, 120, 120, 0.14);
  color: var(--color-muted);
}

.quest-tag-routine {
  color: var(--color-primary);
}

.quest-ready .quest-tag-promotion {
  color: #22a06b;
}

.quest-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quest-body strong {
  font-size: 14px;
  color: var(--color-text);
}

.quest-body small {
  font-size: 12px;
  color: var(--color-muted);
  /* 루틴 이유 등 긴 문구는 2줄로 클램프(퀘스트 카드 간결화). */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

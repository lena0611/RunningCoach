<script setup lang="ts">
import SectionGroup from '@/shared/ui/SectionGroup.vue'

/**
 * 이번 주 미션 (#401). 풀 주기화 스케줄의 "이번 주"를 완수 가능한 목표로 보여준다.
 * 캐러셀(달력 뷰)·레벨카드(RPG)와 중복 없이, "이번 주에 뭘 끝내면 되는지"의 실행 레이어.
 * RPG 레벨링(승급/유지)은 레벨카드 담당이라 여기서 다루지 않는다.
 */
defineProps<{
  mission: {
    focusLine: string
    sessionsDone: number
    sessionsTotal: number
    keyDone: number
    keyTotal: number
    doneKm: number
    plannedKm: number
  }
}>()
</script>

<template>
  <SectionGroup title="이번 주 미션" surface-variant="subtle">
    <div class="quest-list">
      <article class="quest" :class="{ 'quest-ready': mission.keyTotal > 0 && mission.keyDone >= mission.keyTotal }">
        <span class="quest-tag quest-tag-routine">◆ 핵심 세션</span>
        <div class="quest-body">
          <strong>{{ mission.keyDone }}/{{ mission.keyTotal }} 완수</strong>
          <small v-if="mission.focusLine">{{ mission.focusLine }}</small>
          <small v-if="mission.keyTotal > 0 && mission.keyDone >= mission.keyTotal" class="quest-week">이번 주 핵심 완료 🎉</small>
        </div>
      </article>

      <article class="quest">
        <span class="quest-tag quest-tag-maintenance">📊 주간 볼륨</span>
        <div class="quest-body">
          <strong>{{ mission.doneKm }}/{{ mission.plannedKm }}km</strong>
          <small>이번 주 세션 {{ mission.sessionsDone }}/{{ mission.sessionsTotal }}회</small>
        </div>
      </article>
    </div>
  </SectionGroup>
</template>

<style scoped>
.quest-list {
  display: flex;
  flex-direction: column;
}

.quest {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 0;
}

.quest + .quest {
  border-top: 1px solid rgba(120, 120, 120, 0.15);
}

.quest:first-child {
  padding-top: 0;
}

.quest:last-child {
  padding-bottom: 0;
}

.quest-tag {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-pill, 999px);
}

.quest-ready .quest-tag-routine {
  background: rgba(34, 160, 107, 0.16);
  color: #22a06b;
}

.quest-tag-routine {
  background: var(--color-primary-soft, rgba(120, 120, 120, 0.12));
  color: var(--color-primary);
}

.quest-tag-maintenance {
  background: rgba(120, 120, 120, 0.12);
  color: var(--color-muted);
}

.quest-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quest-body strong {
  font-size: 15px;
  color: var(--color-text);
}

.quest-body small {
  font-size: 12px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.quest-week {
  color: #22a06b !important;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import { DOUBLE_MIN_GAP_HOURS, DOUBLE_RECOMMENDED_GAP_HOURS, evaluateDoubleGap } from '@/shared/lib/coaching/doubleSession'
import { formatTime } from '@/shared/lib/format'

/**
 * 같은 날 더블(#455) 날 상세 — grouped surface(미니카드 X, 행+디바이더; ui-system-contract 카드 밀도).
 * 오전 행 → 간격(gap) 바 → 오후 행. 결정 A(grouped) + 결정 C(오전/오후 슬롯 라벨).
 * gap 바는 오전 런 실제 종료시각(`amEndAt`) 기준 **동적 안내**(#462 v1): 오전이 끝났으면 권장 오후
 * 시작 시각·빠듯/양호 판정을, 아직이면 일반 minGap 안내를 보여준다. 실제 시작 감지 하드차단은 네이티브 후속.
 * 행 액션(조정/포기)은 부모 핸들러 재사용 — 세션별로 emit 한다.
 */
const props = defineProps<{
  amSession: ScheduledSession
  pmSession: ScheduledSession
  /** 오전 세션에 매칭된 런의 종료시각(ISO). 없으면(미수행) 일반 minGap 안내. */
  amEndAt?: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  action: [payload: { session: ScheduledSession; kind: 'reschedule' | 'skip' }]
}>()

function prescriptionLine(session: ScheduledSession): string {
  const p = session.prescription
  return [p.distanceKm ? `${p.distanceKm}km` : null, p.durationMin ? `${p.durationMin}분` : null, p.paceRange || null]
    .filter(Boolean)
    .join(' · ')
}

const gap = computed(() => evaluateDoubleGap({ amEndAt: props.amEndAt }))
const gapVerdict = computed(() => gap.value.verdict)

const gapText = computed(() => {
  const g = gap.value
  if (g.phase === 'planning' || !g.amEndAt) {
    return `두 세션은 최소 ${DOUBLE_MIN_GAP_HOURS}시간 이상 벌려요 · 권장 ${DOUBLE_RECOMMENDED_GAP_HOURS}~9시간 (둘째는 회복이 목적)`
  }
  const amEnd = formatTime(g.amEndAt)
  const earliest = formatTime(g.earliestStartAt)
  const optimal = formatTime(g.optimalStartAt)
  if (g.verdict === 'blocked') return `오전 ${amEnd} 종료 · 오후는 ${earliest} 이후 권장(최적 ${optimal}~) — 회복엔 아직 일러요`
  if (g.verdict === 'tight') return `오전 ${amEnd} 종료 · 오후 이지 가능 · ${optimal} 이후면 회복이 더 좋아요`
  return `오전 ${amEnd} 종료 · 충분히 쉬었어요 — 오후 이지 OK`
})
</script>

<template>
  <div class="double-panel">
    <div class="double-row">
      <span class="slot-badge slot-am">오전</span>
      <div class="row-main">
        <div class="row-title">
          {{ sessionTypeLabel(amSession.sessionType) }}
          <span v-if="amSession.keySession" class="key-chip">키세션</span>
        </div>
        <p v-if="prescriptionLine(amSession)" class="row-meta">{{ prescriptionLine(amSession) }}</p>
        <p v-if="amSession.prescription.note" class="row-note">{{ amSession.prescription.note }}</p>
        <div class="row-actions">
          <button type="button" class="row-act" :disabled="busy" @click="emit('action', { session: amSession, kind: 'reschedule' })">📅 다른 날로</button>
          <button type="button" class="row-act row-act-skip" :disabled="busy" @click="emit('action', { session: amSession, kind: 'skip' })">포기</button>
        </div>
      </div>
    </div>

    <div class="gap-bar" :class="gapVerdict ? `gap-${gapVerdict}` : null">
      <span aria-hidden="true">⏱</span>
      <span>{{ gapText }}</span>
    </div>

    <div class="double-row">
      <span class="slot-badge slot-pm">오후</span>
      <div class="row-main">
        <div class="row-title">{{ sessionTypeLabel(pmSession.sessionType) }}</div>
        <p v-if="prescriptionLine(pmSession)" class="row-meta">{{ prescriptionLine(pmSession) }}</p>
        <p v-if="pmSession.prescription.note" class="row-note">{{ pmSession.prescription.note }}</p>
        <div class="row-actions">
          <button type="button" class="row-act" :disabled="busy" @click="emit('action', { session: pmSession, kind: 'reschedule' })">📅 다른 날로</button>
          <button type="button" class="row-act row-act-skip" :disabled="busy" @click="emit('action', { session: pmSession, kind: 'skip' })">포기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.double-panel {
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.double-row {
  display: flex;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  align-items: flex-start;
}

.slot-badge {
  flex: 0 0 auto;
  margin-top: 1px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: var(--radius-pill, 999px);
}
.slot-am {
  background: var(--color-state-selected, rgba(96, 165, 250, 0.16));
  color: var(--color-text);
}
.slot-pm {
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.14));
  color: var(--color-primary);
}

.row-main {
  flex: 1 1 auto;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.key-chip {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-warning-text, var(--color-muted));
  background: var(--color-warning-soft, rgba(251, 191, 36, 0.14));
  padding: 1px 7px;
  border-radius: var(--radius-pill, 999px);
}

.row-meta {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-muted);
}

.row-note {
  margin: 5px 0 0;
  font-size: 12px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}

.row-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.row-act {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.row-act-skip {
  color: var(--color-warning-text, var(--color-muted));
}
.row-act:disabled {
  opacity: 0.5;
  cursor: default;
}

.gap-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px var(--space-4, 16px);
  background: var(--color-field, rgba(120, 120, 120, 0.06));
  border-top: 1px solid var(--color-border, rgba(120, 120, 120, 0.18));
  border-bottom: 1px solid var(--color-border, rgba(120, 120, 120, 0.18));
  font-size: 12px;
  color: var(--color-muted);
}
/* 동적 판정(#462): 오전 종료시각 기준 회복 간격 상태. */
.gap-bar.gap-blocked {
  background: var(--color-danger-soft, rgba(248, 113, 113, 0.12));
  color: var(--color-danger-text, var(--color-text));
}
.gap-bar.gap-tight {
  background: var(--color-warning-soft, rgba(251, 191, 36, 0.13));
  color: var(--color-warning-text, var(--color-text));
}
.gap-bar.gap-ok {
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.1));
  color: var(--color-primary);
}
</style>

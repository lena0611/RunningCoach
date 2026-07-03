<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import ScaleSlider from '@/shared/ui/ScaleSlider.vue'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import { formatTime } from '@/shared/lib/format'
import {
  DOUBLE_MIN_GAP_HOURS,
  DOUBLE_RECOMMENDED_GAP_HOURS,
  PM_DOUBLE_DEFAULT_DURATION_MIN,
  evaluateDoubleGap,
  type DoubleEligibility
} from '@/shared/lib/coaching/doubleSession'

/**
 * 같은 날 더블(#455) 오후 이지 추가 시트. 진입 = 코치 자동제안 또는 수동(세션 행 '+오후 이지 추가').
 * 적격(evaluateDoubleEligibility)이면 시간 슬라이더 + minGap 안내 + 추가, 미달이면 차단 카드(결정 D).
 * 둘째는 항상 이지/회복(buildPmEasyDraft가 강제). minGap 안내는 오전 런 실제 종료시각 기준 동적(#462 v1);
 * 실제 시작을 관측하는 하드 런타임 가드는 네이티브 후속.
 */
const props = defineProps<{
  open: boolean
  /** PM 을 붙일 오전(기존) 세션. */
  amSession: ScheduledSession | null
  /** 오전 세션에 매칭된 런의 종료시각(ISO). 있으면(이미 오전을 뜀) 권장 오후 시작 시각을 안내. */
  amEndAt?: string | null
  eligibility: DoubleEligibility | null
  busy?: boolean
}>()

const emit = defineEmits<{ add: [payload: { durationMin: number }]; close: [] }>()

const drag = useBottomSheetDrag(() => emit('close'))
const durationMin = ref<number | null>(PM_DOUBLE_DEFAULT_DURATION_MIN)

const gapNote = computed(() => {
  const g = evaluateDoubleGap({ amEndAt: props.amEndAt })
  if (g.phase === 'planning' || !g.amEndAt) {
    return `오전 세션과 최소 ${DOUBLE_MIN_GAP_HOURS}시간(권장 ${DOUBLE_RECOMMENDED_GAP_HOURS}~9시간) 벌려요. 오전을 끝내면 권장 시작 시각을 알려드려요.`
  }
  const earliest = formatTime(g.earliestStartAt)
  const optimal = formatTime(g.optimalStartAt)
  return `오전 ${formatTime(g.amEndAt)} 종료 — 오후는 ${earliest} 이후(권장 ${optimal}~) 천천히 시작해요.`
})

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('sheet-open', open)
    if (open) durationMin.value = PM_DOUBLE_DEFAULT_DURATION_MIN
  }
)
onBeforeUnmount(() => document.body.classList.remove('sheet-open'))

function submit() {
  if (!props.eligibility?.eligible || props.busy) return
  emit('add', { durationMin: durationMin.value ?? PM_DOUBLE_DEFAULT_DURATION_MIN })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" data-no-swipe @click.self="emit('close')">
      <section
        class="bottom-sheet doubles-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="오후 이지 더블 추가"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <span class="ctx-chip" :class="{ 'ctx-chip-block': eligibility && !eligibility.eligible }">같은 날 2세션</span>
          <h2>{{ eligibility && !eligibility.eligible ? '아직 더블은 일러요' : '오후 이지 추가' }}</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="doubles-body">
          <p v-if="amSession && eligibility?.eligible" class="doubles-lead">
            오전 <strong>{{ sessionTypeLabel(amSession.sessionType) }}</strong> 뒤에 회복용 이지를 붙여요. 둘째는 천천히가 핵심이에요.
          </p>

          <!-- 적격 카드 / 차단 카드 -->
          <div v-if="eligibility" class="elig-card" :class="eligibility.eligible ? 'elig-ok' : 'elig-no'">
            <p class="elig-title">
              {{ eligibility.eligible ? '✓ 4기준 통과 — 더블 추가 가능' : `✗ ${eligibility.blockers.length}개 기준 미충족 — 더블 추가 불가` }}
            </p>
            <ul class="elig-list">
              <li v-for="c in eligibility.criteria" :key="c.key" class="elig-crit" :class="c.met ? 'crit-pass' : 'crit-fail'">
                <span class="crit-mark" aria-hidden="true">{{ c.met ? '✓' : '✗' }}</span>
                <span>{{ c.label }}</span>
              </li>
            </ul>
          </div>

          <template v-if="eligibility?.eligible">
            <ScaleSlider
              v-model="durationMin"
              label="오후 세션 시간(분)"
              :min="15"
              :max="30"
              :step="5"
              min-label="15분"
              max-label="30분"
            />
            <p class="gap-note">
              <span aria-hidden="true">⏱</span>
              {{ gapNote }}
            </p>
            <div class="doubles-cta">
              <button type="button" class="doubles-primary" :disabled="busy" @click="submit">추가하기</button>
              <button type="button" class="doubles-ghost" :disabled="busy" @click="emit('close')">나중에</button>
            </div>
          </template>

          <template v-else>
            <p class="doubles-block-note">
              두 번 뛰기는 볼륨을 늘리는 고급 도구예요. 지금은 단일 세션을 꾸준히 — 빠진 건 같은 주 안에서 옮기거나 죄책감 없이 놓아줘도 괜찮아요.
            </p>
            <div class="doubles-cta">
              <button type="button" class="doubles-ghost doubles-confirm" @click="emit('close')">확인</button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.doubles-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px 8px;
}
.ctx-chip {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.14));
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
}
.ctx-chip-block {
  color: var(--color-danger-text, var(--color-muted));
  background: var(--color-danger-soft, rgba(248, 113, 113, 0.13));
}
.doubles-lead {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}
.elig-card {
  border-radius: var(--radius-button, 12px);
  padding: 11px 12px;
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.25));
}
.elig-ok {
  background: var(--color-primary-soft, rgba(34, 160, 107, 0.1));
  border-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
}
.elig-no {
  background: var(--color-danger-soft, rgba(248, 113, 113, 0.1));
  border-color: color-mix(in srgb, var(--color-danger, #f87171) 40%, transparent);
}
.elig-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}
.elig-ok .elig-title {
  color: var(--color-primary);
}
.elig-no .elig-title {
  color: var(--color-danger-text, var(--color-danger, #f87171));
}
.elig-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.elig-crit {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  color: var(--color-text);
}
.crit-fail {
  color: var(--color-muted);
}
.crit-mark {
  flex: 0 0 auto;
  font-weight: 800;
}
.crit-pass .crit-mark {
  color: var(--color-primary);
}
.crit-fail .crit-mark {
  color: var(--color-danger, #f87171);
}
.gap-note {
  margin: 0;
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-muted);
  background: var(--color-field, rgba(120, 120, 120, 0.06));
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.18));
  border-radius: var(--radius-button, 12px);
  padding: 9px 11px;
}
.doubles-block-note {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-muted);
}
.doubles-cta {
  display: flex;
  gap: 9px;
}
.doubles-primary,
.doubles-ghost {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-button, 12px);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.doubles-primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}
.doubles-ghost {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.25));
}
.doubles-primary:disabled,
.doubles-ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

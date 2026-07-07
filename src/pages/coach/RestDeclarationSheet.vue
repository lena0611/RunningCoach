<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RestReason } from '@/entities/training-memory/model'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import DateField from '@/shared/ui/DateField.vue'

/**
 * 휴식 선언 바텀시트 (#473, SSOT §휴식과 복귀). 범용 — 부상·날씨·개인 일정 등 이유 무관, 기간은 사용자가 정한다.
 * "쉬는 건 실패가 아니다" 톤. 경고색·닦달 금지. 오늘부터 시작, untilDate(마지막 쉬는 날)까지 쉬고 그 다음날 복귀.
 */
const props = defineProps<{
  open: boolean
  /** 오늘(YYYY-MM-DD) — 프리셋 기간 계산 기준. */
  today: string
  busy?: boolean
  /** 진입점에서 이유를 미리 정해 열 때(#473 — 부상 체크인 "한동안 쉴게요"=injury). null=사용자 선택. */
  presetReason?: RestReason | null
  /** 복귀일 조정으로 열 때 현재 마지막 쉬는 날(YYYY-MM-DD)을 미리 채운다 — 날짜만 바꿔도 저장 활성. null=미지정. */
  presetUntil?: string | null
}>()

const emit = defineEmits<{ declare: [{ untilDate: string; reason: RestReason }]; close: [] }>()

const drag = useBottomSheetDrag(() => emit('close'))

const REASONS: { value: RestReason; label: string }[] = [
  { value: 'injury', label: '부상' },
  { value: 'weather', label: '날씨' },
  { value: 'personal', label: '개인 일정' },
  { value: 'other', label: '기타' }
]
const PRESETS: { key: string; label: string; days: number }[] = [
  { key: '3d', label: '3일', days: 3 },
  { key: '1w', label: '1주', days: 7 },
  { key: '2w', label: '2주', days: 14 }
]

const reason = ref<RestReason | null>(null)
const preset = ref<string | null>(null)
const customUntil = ref<string | null>(null)

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// untilDate = 마지막 쉬는 날(포함). 프리셋 N일 = [오늘 .. 오늘+N-1].
const untilDate = computed<string | null>(() => {
  if (preset.value === 'custom') return customUntil.value && customUntil.value >= props.today ? customUntil.value : null
  const found = PRESETS.find((p) => p.key === preset.value)
  return found ? addDays(props.today, found.days - 1) : null
})
const canDeclare = computed(() => reason.value !== null && untilDate.value !== null)

function reset() {
  reason.value = null
  preset.value = null
  customUntil.value = null
}
function confirm() {
  if (!canDeclare.value || !reason.value || !untilDate.value) return
  emit('declare', { untilDate: untilDate.value, reason: reason.value })
}

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('sheet-open', open)
    if (open) {
      reset()
      if (props.presetReason) reason.value = props.presetReason
      // 복귀일 조정: 현재 복귀일을 직접 날짜로 미리 채워 저장을 바로 활성화(미래 날짜일 때만).
      if (props.presetUntil && props.presetUntil >= props.today) {
        preset.value = 'custom'
        customUntil.value = props.presetUntil
      }
    }
  }
)
onBeforeUnmount(() => document.body.classList.remove('sheet-open'))
</script>

<template>
  <Teleport to="body">
    <Transition name="bottom-sheet">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" data-no-swipe @click.self="emit('close')">
      <section
        class="bottom-sheet rest-sheet"
        :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
        :style="drag.sheetStyle.value"
        role="dialog"
        aria-modal="true"
        aria-label="휴식 선언"
      >
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>💤 잠시 쉬어가기</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="rest-body">
          <p class="rest-lead">쉬는 건 실패가 아니에요. 그동안 일정은 정리해두고, 돌아오면 가볍게 시작해요.</p>

          <div class="rest-field">
            <span class="rest-field-label">왜 쉬나요?</span>
            <div class="rest-chip-row">
              <button
                v-for="r in REASONS"
                :key="r.value"
                type="button"
                class="rest-chip"
                :class="{ 'rest-chip-on': reason === r.value }"
                @click="reason = r.value"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <div class="rest-field">
            <span class="rest-field-label">얼마나 쉴까요?</span>
            <div class="rest-chip-row">
              <button
                v-for="p in PRESETS"
                :key="p.key"
                type="button"
                class="rest-chip"
                :class="{ 'rest-chip-on': preset === p.key }"
                @click="preset = p.key"
              >
                {{ p.label }}
              </button>
              <button
                type="button"
                class="rest-chip"
                :class="{ 'rest-chip-on': preset === 'custom' }"
                @click="preset = 'custom'"
              >
                직접
              </button>
            </div>
            <DateField v-if="preset === 'custom'" v-model="customUntil" label="마지막 쉬는 날" placeholder="복귀 전날을 골라요" />
          </div>

          <p v-if="untilDate" class="rest-until-note">복귀 예정: {{ addDays(untilDate, 1) }} 부터 가볍게 다시 시작해요.</p>

          <button type="button" class="rest-confirm" :disabled="!canDeclare || busy" @click="confirm">푹 쉴게요</button>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rest-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 2px 8px;
}
.rest-lead {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}
.rest-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rest-field-label {
  font-size: var(--text-caption-size);
  font-weight: 600;
  color: var(--color-muted);
}
.rest-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rest-chip {
  padding: 8px 14px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.25));
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.rest-chip-on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft, transparent);
  color: var(--color-text);
}
.rest-until-note {
  margin: 0;
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}
.rest-confirm {
  padding: 12px;
  border-radius: var(--radius-button, 12px);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: none;
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}
.rest-confirm:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

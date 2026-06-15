<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { RunLog } from '@/entities/run/model'
import type { InjuryAreaSelection } from '@/entities/training-memory/injuryAreas'
import type { PostRunInterviewResult, PostRunPainSeverity } from '@/features/post-run-interview/buildInterviewRunPatch'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import InjuryBodySelector from './InjuryBodySelector.vue'
import ScaleSlider from './ScaleSlider.vue'

const props = defineProps<{ run: RunLog | null; open: boolean; saving?: boolean }>()
const emit = defineEmits<{ close: []; submit: [value: PostRunInterviewResult] }>()

const draft = reactive({
  painSeverity: null as PostRunPainSeverity | null,
  areaPainLevels: [] as InjuryAreaSelection[],
  rpe: null as number | null,
  note: ''
})

const drag = useBottomSheetDrag(() => emit('close'))

const SEVERITIES: { value: PostRunPainSeverity; label: string }[] = [
  { value: 'none', label: '없음' },
  { value: 'mild', label: '경미' },
  { value: 'moderate', label: '보통' },
  { value: 'severe', label: '심함' }
]

const hasPain = computed(() => draft.painSeverity !== null && draft.painSeverity !== 'none')
const canSubmit = computed(() => draft.painSeverity !== null)

const sessionLine = computed(() => {
  const run = props.run
  if (!run) return ''
  const distance = Number.isFinite(run.distanceKm) && run.distanceKm > 0 ? `${run.distanceKm.toFixed(1)}km` : ''
  const minutes = run.durationSec ? Math.round(run.durationSec / 60) : null
  const record = [distance, minutes ? `${minutes}분` : ''].filter(Boolean).join(' · ')
  return record ? `방금 ${record} 기록이 들어왔어요. 오늘 어땠나요?` : '오늘 운동 어땠나요?'
})

watch(
  () => props.run?.id,
  () => {
    draft.painSeverity = null
    draft.areaPainLevels = []
    draft.rpe = props.run?.rpe ?? null
    draft.note = ''
  },
  { immediate: true }
)

function setSeverity(value: PostRunPainSeverity) {
  draft.painSeverity = value
  if (value === 'none') draft.areaPainLevels = []
}

function submit() {
  if (!canSubmit.value || !draft.painSeverity) return
  emit('submit', {
    painSeverity: draft.painSeverity,
    areaPainLevels: hasPain.value ? draft.areaPainLevels : [],
    rpe: draft.rpe,
    note: draft.note.trim()
  })
}
</script>

<template>
  <div v-if="open && run" class="bottom-sheet-layer" role="presentation" @click.self="emit('close')">
    <section
      class="bottom-sheet"
      :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
      :style="drag.sheetStyle.value"
      role="dialog"
      aria-modal="true"
      aria-label="운동 직후 코치 인터뷰"
      @click.stop
    >
      <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
      <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
        <div>
          <span class="context-chip">코치 인터뷰</span>
          <h2>오늘 어땠나요?</h2>
        </div>
        <button class="stack-icon-button sheet-close" type="button" aria-label="건너뛰기" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="injury-checkin-content">
        <p v-if="sessionLine" class="injury-checkin-session">{{ sessionLine }}</p>
        <p class="helper">러닝 강도 조절을 위한 짧은 확인입니다. 의료 진단으로 보지 않습니다.</p>

        <div class="checkin-question">
          <strong>운동 후 통증이 있었나요?</strong>
          <div class="segmented-choice">
            <button
              v-for="s in SEVERITIES"
              :key="s.value"
              type="button"
              :class="{ active: draft.painSeverity === s.value }"
              @click="setSeverity(s.value)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div v-if="hasPain">
          <InjuryBodySelector v-model="draft.areaPainLevels" label="어디가 불편했나요" />
        </div>

        <ScaleSlider
          v-model="draft.rpe"
          label="오늘 난이도"
          :min="1"
          :max="10"
          min-label="쉬움"
          max-label="매우 힘듦"
          null-label="선택"
        />

        <label class="checkin-note">
          코치에게 전할 말
          <textarea v-model="draft.note" rows="2" placeholder="느낌이나 전하고 싶은 내용을 자유롭게." />
        </label>
      </div>

      <div class="injury-checkin-actions">
        <button class="ghost" type="button" :disabled="saving" @click="emit('close')">건너뛰기</button>
        <button type="button" :disabled="saving || !canSubmit" @click="submit">{{ saving ? '저장 중' : '제출' }}</button>
      </div>
    </section>
  </div>
</template>

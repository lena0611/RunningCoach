<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { RunLog } from '@/entities/run/model'
import { getInjuryAreaLabel, type InjuryAreaSelection } from '@/entities/training-memory/injuryAreas'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'
import ScaleSlider from './ScaleSlider.vue'

const props = defineProps<{
  item: TrainingInjuryItem | null
  open: boolean
  saving?: boolean
  // 이 체크인을 띄운 "방금 들어온" 세션(있을 때만 세션-부상 브리지 문장/숏컷 노출).
  contextRun?: RunLog | null
}>()

const emit = defineEmits<{
  close: []
  openSession: []
  askCoach: []
  /** 통증이 계속될 때 "한동안 쉴게요" — 휴식 선언 시트로 보낸다(#473, 이유=부상 프리셋). */
  declareRest: []
  submit: [
    value: {
      painLevel: number | null
      worsenedDuringOrAfterRun: boolean | null
      dailyActivityPain: boolean | null
      readyForQualitySession: boolean | null
      areaPainLevels: InjuryAreaSelection[]
      note: string
      markResolved: boolean
    }
  ]
}>()

const draft = reactive({
  painLevel: null as number | null,
  worsenedDuringOrAfterRun: null as boolean | null,
  dailyActivityPain: null as boolean | null,
  readyForQualitySession: null as boolean | null,
  areaPainLevels: [] as InjuryAreaSelection[],
  note: ''
})

const drag = useBottomSheetDrag(() => emit('close'))
const areaLabels = computed(() => props.item?.normalizedAreas.map((area) => getInjuryAreaLabel(area.areaId)).filter(Boolean).join(', ') ?? '')
// 세션-부상 브리지 문장: "방금 이 러닝이 들어왔고, 그 뒤 이 부위를 확인한다"는 맥락을 전달한다.
const sessionFeedback = computed(() => {
  const run = props.contextRun
  if (!run) return ''
  const areaText = areaLabels.value || props.item?.title || '부상 부위'
  const distance = Number.isFinite(run.distanceKm) && run.distanceKm > 0 ? `${run.distanceKm.toFixed(1)}km` : ''
  const minutes = run.durationSec ? Math.round(run.durationSec / 60) : null
  const record = [distance, minutes ? `${minutes}분` : ''].filter(Boolean).join(' · ')
  const lead = record ? `방금 ${record} 기록이 들어왔어요.` : '방금 러닝 기록이 들어왔어요.'
  return `${lead} 이 러닝 뒤 ${areaText} 상태를 확인할게요.`
})
const hasMultipleAreas = computed(() => draft.areaPainLevels.length > 1)
const latestPlanDetails = computed(() => props.item?.strengthPlanDetails?.slice(0, 3) ?? [])
const currentQuiet = computed(() => isQuietCheckInResponse({ ...draft, areaPainLevels: getSubmitAreaPainLevels() }))
const hasPriorQuietCheckIn = computed(() => props.item?.checkInHistory.slice(0, 5).some(isQuietCheckIn) ?? false)
const resolvedCandidate = computed(() => currentQuiet.value && hasPriorQuietCheckIn.value)
const resolvedPendingMoreEvidence = computed(() => currentQuiet.value && !hasPriorQuietCheckIn.value)
const canSubmit = computed(() => {
  const hasPain = hasMultipleAreas.value
    ? draft.areaPainLevels.length > 0 && draft.areaPainLevels.every((area) => area.painLevel !== null)
    : draft.painLevel !== null
  return hasPain && draft.worsenedDuringOrAfterRun !== null && draft.dailyActivityPain !== null && draft.readyForQualitySession !== null
})

watch(
  () => props.item?.id,
  () => {
    const areaPainLevels = props.item?.normalizedAreas.map((area) => ({ ...area })) ?? []
    draft.areaPainLevels = areaPainLevels
    draft.painLevel = areaPainLevels.length > 1 ? deriveMaxPainLevel(areaPainLevels) : props.item?.severity ?? areaPainLevels[0]?.painLevel ?? null
    draft.worsenedDuringOrAfterRun = null
    draft.dailyActivityPain = null
    draft.readyForQualitySession = null
    draft.note = ''
  },
  { immediate: true }
)

function submit(markResolved = false) {
  if (!canSubmit.value) return
  const areaPainLevels = getSubmitAreaPainLevels()
  emit('submit', {
    painLevel: deriveMaxPainLevel(areaPainLevels) ?? draft.painLevel,
    worsenedDuringOrAfterRun: draft.worsenedDuringOrAfterRun,
    dailyActivityPain: draft.dailyActivityPain,
    readyForQualitySession: draft.readyForQualitySession,
    areaPainLevels,
    note: draft.note.trim(),
    markResolved
  })
}

function setBoolean(field: 'worsenedDuringOrAfterRun' | 'dailyActivityPain' | 'readyForQualitySession', value: boolean) {
  draft[field] = value
}

function updateAreaPain(areaId: string, painLevel: number | null) {
  draft.areaPainLevels = draft.areaPainLevels.map((area) => (area.areaId === areaId ? { ...area, painLevel } : area))
}

function getSubmitAreaPainLevels() {
  if (draft.areaPainLevels.length > 1) return draft.areaPainLevels.map((area) => ({ ...area }))
  if (draft.areaPainLevels.length === 1) return [{ ...draft.areaPainLevels[0], painLevel: draft.painLevel }]
  return []
}

function isQuietCheckInResponse(value: {
  painLevel: number | null
  areaPainLevels?: InjuryAreaSelection[]
  worsenedDuringOrAfterRun: boolean | null
  dailyActivityPain: boolean | null
  readyForQualitySession: boolean | null
}) {
  const painLevel = deriveMaxPainLevel(value.areaPainLevels ?? []) ?? value.painLevel
  return painLevel !== null && painLevel <= 1 && value.worsenedDuringOrAfterRun === false && value.dailyActivityPain === false && value.readyForQualitySession === true
}

function isQuietCheckIn(value: TrainingInjuryItem['checkInHistory'][number]) {
  return isQuietCheckInResponse(value)
}

function deriveMaxPainLevel(areas: InjuryAreaSelection[]) {
  const levels = areas.map((area) => area.painLevel).filter((value): value is number => value !== null)
  return levels.length ? Math.max(...levels) : null
}
</script>

<template>
  <div v-if="open && item" class="bottom-sheet-layer injury-checkin-layer" role="presentation" @click.self="emit('close')">
    <section
      class="bottom-sheet injury-checkin-sheet"
      :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
      :style="drag.sheetStyle.value"
      role="dialog"
      aria-modal="true"
      aria-label="부상 상태 체크인"
      @click.stop
    >
      <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
      <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
        <div>
          <span class="context-chip">부상 체크인</span>
          <h2>{{ item.title }}</h2>
        </div>
        <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="injury-checkin-content">
        <p v-if="sessionFeedback" class="injury-checkin-session">{{ sessionFeedback }}</p>
        <p class="helper">러닝 강도 조절을 위한 짧은 확인입니다. 의료 진단이나 치료 판단으로 보지 않습니다.</p>
        <p v-if="areaLabels" class="injury-checkin-area">{{ areaLabels }}</p>

        <div v-if="hasMultipleAreas" class="checkin-area-pain-panel">
          <strong>부위별 통증</strong>
          <ScaleSlider
            v-for="area in draft.areaPainLevels"
            :key="area.areaId"
            :model-value="area.painLevel"
            :label="getInjuryAreaLabel(area.areaId)"
            :min="0"
            :max="5"
            min-label="0 없음"
            max-label="5 강함"
            null-label="선택"
            @update:model-value="updateAreaPain(area.areaId, $event)"
          />
        </div>
        <ScaleSlider v-else v-model="draft.painLevel" label="지금 통증" :min="0" :max="5" min-label="0 없음" max-label="5 강함" null-label="선택" />

        <div class="checkin-question">
          <strong>지난 러닝 중이나 뒤에 더 신경 쓰였나요?</strong>
          <div class="segmented-choice">
            <button type="button" :class="{ active: draft.worsenedDuringOrAfterRun === false }" @click="setBoolean('worsenedDuringOrAfterRun', false)">아니요</button>
            <button type="button" :class="{ active: draft.worsenedDuringOrAfterRun === true }" @click="setBoolean('worsenedDuringOrAfterRun', true)">예</button>
          </div>
        </div>

        <div class="checkin-question">
          <strong>걷기나 계단에서도 신호가 있나요?</strong>
          <div class="segmented-choice">
            <button type="button" :class="{ active: draft.dailyActivityPain === false }" @click="setBoolean('dailyActivityPain', false)">없음</button>
            <button type="button" :class="{ active: draft.dailyActivityPain === true }" @click="setBoolean('dailyActivityPain', true)">있음</button>
          </div>
        </div>

        <div class="checkin-question">
          <strong>오늘 강훈련이나 롱런을 그대로 해도 될 만큼 조용한가요?</strong>
          <div class="segmented-choice">
            <button type="button" :class="{ active: draft.readyForQualitySession === true }" @click="setBoolean('readyForQualitySession', true)">조용함</button>
            <button type="button" :class="{ active: draft.readyForQualitySession === false }" @click="setBoolean('readyForQualitySession', false)">보수적으로</button>
          </div>
        </div>

        <label class="checkin-note">
          메모
          <textarea v-model="draft.note" rows="2" placeholder="필요할 때만 남기세요." />
        </label>

        <div v-if="latestPlanDetails.length" class="checkin-strength-panel">
          <strong>참고용 보강운동</strong>
          <p>통증 0~2/5에서만 낮은 강도로 확인하고, 다음날 악화되면 줄이거나 생략합니다.</p>
          <ul>
            <li v-for="plan in latestPlanDetails" :key="plan.id">
              <span>{{ plan.title }}</span>
              <small>{{ plan.useWhen }}</small>
            </li>
          </ul>
        </div>

        <div v-if="resolvedCandidate" class="resolved-candidate-card">
          <strong>해소 후보</strong>
          <small>이번 응답과 최근 체크인이 모두 조용합니다. 해소 처리는 사용자가 승인할 때만 저장됩니다.</small>
        </div>
        <div v-else-if="resolvedPendingMoreEvidence" class="resolved-candidate-card resolved-candidate-card-pending">
          <strong>한 번 더 조용하면 해소 후보</strong>
          <small>첫 조용한 응답만으로는 해소 저장을 열지 않습니다. 다음 체크인에서도 통증과 일상/훈련 반응이 조용하면 후보로 제안합니다.</small>
        </div>
      </div>

      <div v-if="contextRun" class="injury-checkin-shortcuts">
        <button type="button" @click="emit('openSession')">세션 상세 보기</button>
        <button type="button" @click="emit('askCoach')">AI 코치 질문</button>
      </div>

      <div class="injury-checkin-actions">
        <button v-if="resolvedCandidate" class="ghost" type="button" :disabled="saving" @click="submit(true)">해소로 저장</button>
        <button type="button" :disabled="saving || !canSubmit" @click="submit(false)">{{ saving ? '저장 중' : '상태 저장' }}</button>
      </div>
      <button type="button" class="rest-from-injury" :disabled="saving" @click="emit('declareRest')">💤 통증이 계속되면, 한동안 쉴게요</button>
    </section>
  </div>
</template>

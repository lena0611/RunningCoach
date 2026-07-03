<script setup lang="ts">
import { ref, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const props = defineProps<{
  open: boolean
  showGuide: boolean
}>()

const emit = defineEmits<{
  close: []
  register: []
  acknowledge: [value: { sawGuide: boolean }]
}>()

type Step = 'screening' | 'guide'
const step = ref<Step>('screening')

const drag = useBottomSheetDrag(() => closeSheet())

watch(
  () => props.open,
  (open) => {
    if (open) step.value = 'screening'
  },
  { immediate: true }
)

function closeSheet() {
  emit('acknowledge', { sawGuide: step.value === 'guide' })
  emit('close')
}

function chooseHadPain() {
  emit('register')
}

function chooseNoPain() {
  if (props.showGuide) {
    step.value = 'guide'
    return
  }
  closeSheet()
}

function finishGuide() {
  emit('acknowledge', { sawGuide: true })
  emit('close')
}
</script>

<template>
  <Transition name="bottom-sheet">
  <div v-if="open" class="bottom-sheet-layer injury-screening-layer" role="presentation" @click.self="closeSheet">
    <section
      class="bottom-sheet injury-screening-sheet"
      :class="{ 'bottom-sheet-dragging': drag.dragging.value }"
      :style="drag.sheetStyle.value"
      role="dialog"
      aria-modal="true"
      aria-label="러닝 후 컨디션 확인"
      @click.stop
    >
      <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />

      <template v-if="step === 'screening'">
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <div>
            <span class="context-chip">러닝 후 컨디션</span>
            <h2>오늘도 잘 달렸어요 👏</h2>
          </div>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @click="closeSheet">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="injury-screening-content">
          <p class="helper">최근 러닝에서 불편하거나 아픈 곳은 없었나요? 통증을 진단하려는 게 아니라, 다음 훈련 강도를 맞추기 위한 짧은 확인이에요.</p>
          <div class="injury-screening-choices">
            <button type="button" class="ghost injury-screening-choice" @click="chooseHadPain">
              <strong>조금 있었어요</strong>
              <span>어디가 불편한지 등록할게요</span>
            </button>
            <button type="button" class="injury-screening-choice injury-screening-choice-primary" @click="chooseNoPain">
              <strong>없었어요</strong>
              <span>지금은 다 괜찮아요</span>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <div>
            <span class="context-chip">알아두면 좋아요</span>
            <h2>좋아요, 계속 그렇게! 🙌</h2>
          </div>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @click="finishGuide">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="injury-screening-content">
          <p>혹시 나중에 불편한 곳이 생기면 <strong>기억 &gt; 부상</strong>에 등록해 두세요.</p>
          <ul class="injury-screening-benefits">
            <li>코치가 자동으로 그 부위를 고려해 훈련 강도를 조절해요.</li>
            <li>통증 부위에 맞는 보강·재활 루틴을 참고용으로 제안해요.</li>
          </ul>
          <p class="helper">의료 진단이 아니라 러닝 부하 조절을 돕는 참고 정보예요. 통증이 크면 운동보다 휴식과 전문가 상담을 먼저 권해요.</p>
        </div>

        <div class="injury-screening-actions">
          <button type="button" class="ghost" @click="emit('register')">지금 등록할게요</button>
          <button type="button" @click="finishGuide">알겠어요</button>
        </div>
      </template>
    </section>
  </div>
  </Transition>
</template>

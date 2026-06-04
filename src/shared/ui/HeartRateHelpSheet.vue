<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const drag = useBottomSheetDrag(() => emit('close'))

watch(
  () => props.open,
  (open) => {
    document.body.classList.toggle('sheet-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('sheet-open')
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" @click.self="emit('close')">
      <section class="bottom-sheet scheduling-help-sheet" :class="{ 'bottom-sheet-dragging': drag.dragging.value }" :style="drag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="심박 기준 산출 방식">
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>심박 기준은 어떻게 정해지나요?</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="scheduling-help-content">
          <p>
            심박존과 이지·템포·회복 상한은 고정 숫자가 아니라 <strong>나의 역치심박(LTHR)</strong>을 기준으로
            개인화해서 계산합니다. 사람마다 최대심박과 역치가 다르기 때문에 같은 165bpm이라도
            의미가 완전히 다릅니다.
          </p>

          <div>
            <strong>추천(자동)으로 정하는 순서</strong>
            <ol>
              <li>나이로 최대심박을 추정합니다. <em>최대심박 ≈ 208 − 0.7 × 나이</em> (Tanaka 식).</li>
              <li>그동안 실제 러닝에서 찍힌 최고 심박이 추정값보다 높으면, 그 값으로 끌어올려 보정합니다. (실제로 도달한 심박이 진짜 최대심박의 최소선이므로 내리지는 않습니다.)</li>
              <li>역치심박 ≈ 보정된 최대심박의 90%, 템포 상한 = 역치심박으로 둡니다.</li>
            </ol>
          </div>

          <div>
            <strong>직접 입력으로 정하기</strong>
            <ul>
              <li><strong>역치심박(LTHR)</strong>을 입력하면 가장 정확합니다. 30분 단독 전력주의 <em>마지막 20분 평균심박</em>이 LTHR 추정값입니다.</li>
              <li>측정한 <strong>최대심박</strong>이 있으면 그 값으로 환산합니다.</li>
              <li>직접 입력값은 따로 저장되어, 언제든 다시 “추천(자동)”으로 되돌릴 수 있습니다.</li>
            </ul>
          </div>

          <div>
            <strong>아직 정보가 없을 때</strong>
            <p class="helper">
              나이·심박·러닝 기록이 모두 없으면 임의의 상한을 만들지 않고 “미설정”으로 둡니다.
              이때 코칭은 심박 상한 대신 페이스·체감강도(RPE)·후반 드리프트로 평가합니다.
            </p>
          </div>

          <div>
            <strong>근거</strong>
            <ul>
              <li><a href="https://pubmed.ncbi.nlm.nih.gov/11153730/" target="_blank" rel="noopener">Tanaka 외, 2001 — 나이 기반 최대심박 추정식</a></li>
              <li><a href="https://joefrieltraining.com/determining-your-lthr/" target="_blank" rel="noopener">Joe Friel — 역치심박(LTHR) 측정</a></li>
              <li><a href="https://www.asics.com/ie/en-ie/running-advice/threshold-and-tempo-runs-all-you-need-to-know/" target="_blank" rel="noopener">ASICS — Threshold & Tempo runs</a></li>
            </ul>
          </div>

          <p class="helper">
            이 값은 의료 기준이 아니라 훈련 강도 참고용입니다. 추정값은 개인차(±10bpm 수준)가 있으니
            정확히 하려면 LTHR이나 측정 최대심박을 직접 입력하세요.
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

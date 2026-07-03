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
    <Transition name="bottom-sheet">
    <div v-if="open" class="bottom-sheet-layer" role="presentation" @click.self="emit('close')">
      <section class="bottom-sheet scheduling-help-sheet" :class="{ 'bottom-sheet-dragging': drag.dragging.value }" :style="drag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="역치심박 측정 가이드">
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>역치심박(LTHR) 측정하기</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="scheduling-help-content">
          <p>
            역치심박(LTHR)은 약 1시간 동안 유지할 수 있는 최대 강도의 심박입니다. 입력하면
            심박존과 템포/이지/회복 상한이 나에게 맞게 계산됩니다. 30분 단독 테스트로 추정합니다.
          </p>

          <div>
            <strong>측정 절차</strong>
            <ol>
              <li>충분히 회복된 날, 평지나 트랙에서 <strong>혼자</strong> 측정합니다(같이 뛰면 결과가 달라집니다).</li>
              <li>10~15분 워밍업 후 시작합니다.</li>
              <li><strong>30분 동안</strong> 일정하게 유지할 수 있는 가장 강한 페이스로 달립니다. 초반에 과하게 시작하지 않습니다.</li>
              <li>워치에서 <strong>마지막 20분의 평균심박</strong>을 확인합니다. 이 값이 LTHR 추정값입니다.</li>
              <li>그 숫자를 프로필 → 심박 기준 → 직접 입력의 <strong>역치심박(LTHR)</strong>에 넣습니다.</li>
            </ol>
          </div>

          <div>
            <strong>팁</strong>
            <ul>
              <li>레이스/타임트라이얼 중이라면 30~60분 노력의 평균심박으로 대체할 수 있습니다.</li>
              <li>측정이 부담되면 최대심박(측정값)만 입력해도 환산됩니다. 둘 다 없으면 나이와 누적 기록으로 추정합니다.</li>
              <li>체력이 좋아지면 LTHR도 변하므로 몇 달마다 다시 측정해 갱신하면 정확도가 올라갑니다.</li>
            </ul>
          </div>

          <p class="helper">
            과도한 전력 측정은 무리가 될 수 있습니다. 컨디션이 나쁘거나 통증/부상이 있으면 측정을 미루세요.
            이 값은 의료 기준이 아니라 훈련 강도 참고용입니다.
          </p>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

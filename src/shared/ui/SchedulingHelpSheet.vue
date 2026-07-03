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
      <section class="bottom-sheet scheduling-help-sheet" :class="{ 'bottom-sheet-dragging': drag.dragging.value }" :style="drag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="AI 스케줄링 기준">
        <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="drag.startDrag" />
        <div class="bottom-sheet-heading bottom-sheet-drag-zone" @pointerdown="drag.startDrag">
          <h2>AI 스케줄링 기준</h2>
          <button class="stack-icon-button sheet-close" type="button" aria-label="닫기" @pointerdown.stop @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>

        <div class="scheduling-help-content">
          <p>
            PaceLAB은 단일 기록 하나로 루틴을 바꾸지 않습니다. 목표, 부상상태, 최근 러닝 흐름,
            루틴 소화율을 같이 보고 유지 또는 변경을 판단합니다.
          </p>

          <div>
            <strong>판단 근거 순서</strong>
            <ol>
              <li>활성 목표: 목표 거리, 목표 기록, 목표일, 성공 기준</li>
              <li>선택 세션: 거리, 페이스, 심박, 케이던스, 랩, RPE, 메모</li>
              <li>최근 흐름: 7/14/30일 누적, Easy 비율, 강훈련 빈도</li>
              <li>루틴 소화: Easy + Strides, Tempo, Long Run 수행 여부</li>
              <li>회복/부상: 통증 메모, active 부상, 다음날 반응</li>
              <li>환경: 더위, 비, 바람, 체감온도</li>
            </ol>
          </div>

          <div>
            <strong>루틴을 유지하는 경우</strong>
            <ul>
              <li>핵심 세션이 대체로 수행되고 있다.</li>
              <li>볼륨이나 강훈련이 급증하지 않았다.</li>
              <li>통증이나 회복 악화 신호가 없다.</li>
              <li>현재 루틴이 목표일까지 필요한 자극을 제공한다.</li>
            </ul>
          </div>

          <div>
            <strong>루틴을 바꾸는 경우</strong>
            <ul>
              <li>2~3주간 핵심 세션을 잘 소화하고 훈련 품질 기준을 넘는다.</li>
              <li>예상 기록이 좋아지고 회복/통증 신호도 안정적이다.</li>
              <li>Tempo 지속 시간, Long Run 후반 steady, Strides 품질 중 하나를 소폭 올릴 수 있다.</li>
              <li>2주 이상 핵심 세션 누락이 반복된다.</li>
              <li>강훈련 뒤 회복이 늦거나 통증 신호가 커진다.</li>
              <li>목표일이 가까운데 Tempo/Long Run 같은 목표 특이 세션이 부족하다.</li>
              <li>최근 누적이 급증해서 부상 위험을 낮춰야 한다.</li>
            </ul>
          </div>

          <div>
            <strong>훈련 품질 기준</strong>
            <ul>
              <li>Easy: 심박/RPE가 낮고 다음날 피로가 남지 않는다.</li>
              <li>Tempo: 목표 강도에서 후반까지 무너지지 않는다.</li>
              <li>Long Run: 후반 급락 없이 지속되고 다음날 회복 가능하다.</li>
              <li>Strides: 짧고 선명하게 가속하고 회복 구간에서 안정된다.</li>
            </ul>
          </div>

          <p class="helper">
            예상 기록은 보조 근거입니다. PB, Race, 충분한 Tempo/긴 지속주 데이터가 있을 때만 참고하고,
            예상 기록 하나만으로 루틴을 바꾸지는 않습니다.
          </p>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

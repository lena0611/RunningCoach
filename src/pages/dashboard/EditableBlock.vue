<script setup lang="ts">
/**
 * 요약 편집 모드에서 흔들리는 블록 한 칸(#767 후속).
 *
 * 편집을 **별도 목록 화면이 아니라 제자리에서** 한다 — 사용자가 보는 그 카드를 그대로 흔들고
 * 좌상단 ⊖ 로 뺀다(아이폰 홈화면·건강 앱과 같은 언어). 목록으로 옮겨 놓으면 "지금 화면의 무엇을
 * 건드리는지"가 한 단계 멀어진다.
 *
 * ⊖ 는 **삭제가 아니라 요약에서 빼기**다. 뺀 것은 '카드 추가' 목록에 남아 언제든 다시 붙는다.
 */
defineProps<{
  editing: boolean
  label: string
}>()

defineEmits<{ remove: [] }>()
</script>

<template>
  <div class="editable-block" :class="{ 'is-editing': editing }">
    <slot />
    <button
      v-if="editing"
      type="button"
      class="editable-block-remove"
      :aria-label="`${label} 요약에서 빼기`"
      @pointerdown.stop
      @click.stop="$emit('remove')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12h10" /></svg>
    </button>
  </div>
</template>

<style scoped>
.editable-block {
  position: relative;
  display: grid;
  min-width: 0;
}

/*
  각도는 0.7도로 아주 작게 — 크게 흔들면 글자가 읽히지 않는다.
  "지금 건드릴 수 있는 것들"이 한눈에 들어오는 게 목적이지 연출이 목적이 아니다.
*/
@keyframes editable-block-wiggle {
  0% { transform: rotate(-0.7deg); }
  50% { transform: rotate(0.7deg); }
  100% { transform: rotate(-0.7deg); }
}

.editable-block.is-editing {
  animation: editable-block-wiggle 0.32s ease-in-out infinite;
}

/* 이웃과 위상을 어긋내 한 몸처럼 움직이지 않게. */
.editable-block.is-editing:nth-child(even) {
  animation-delay: -0.16s;
}

@media (prefers-reduced-motion: reduce) {
  .editable-block.is-editing {
    animation: none;
    transform: scale(0.98);
  }
}

/*
  배지가 카드 좌상단을 덮으므로 편집 중에만 제목을 오른쪽으로 민다 —
  안 그러면 "Easy 비율" 같은 라벨의 앞글자가 배지 뒤로 숨는다(2026-09-04 실측).
  편집을 끝내면 원래 자리로 돌아온다.
*/
.editable-block.is-editing :deep(.stat-card-label),
.editable-block.is-editing :deep(.section-heading),
.editable-block.is-editing :deep(.section-group > h2) {
  padding-left: 20px;
}

/* 흰 원 + 빨간 마이너스(아이폰 삭제 배지와 같은 언어). 손가락으로 눌러야 하므로 32px. */
.editable-block-remove {
  position: absolute;
  top: -10px;
  left: -10px;
  z-index: 1;
  display: grid;
  width: 32px;
  height: 32px;
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: var(--shadow-card);
  color: var(--color-danger);
  place-items: center;
}

.editable-block-remove svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
}
</style>

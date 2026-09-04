<script setup lang="ts">
import { ref, watch } from 'vue'
import StackPage from '@/shared/ui/StackPage.vue'
import StatCard from '@/shared/ui/StatCard.vue'

/**
 * '요약에 카드 추가'(#767 후속) — 요약에서 뺀 블록을 다시 붙이는 목록.
 *
 * 두 단계다: **목록 → 미리보기 상세 → 추가**. 목록에서 바로 붙이지 않는 이유는,
 * 이름만 보고는 그 카드가 무엇을 보여주는지 모르기 때문이다 — 상세에서 **실제 값이 든 카드**를
 * 크게 한 번 보여주고 나서 붙인다(카드 생성 흐름의 미리보기와 같은 원칙).
 */
export type SummaryAddItem = {
  id: string
  label: string
  /** 실제 값. 목업이 아니라 지금 기록으로 계산한 숫자다. */
  valueText: string
  hint: string
  description: string
  /** 대화로 만든 카드. 여기서만 영구 삭제할 수 있다. */
  custom: boolean
}

const props = defineProps<{
  open: boolean
  items: SummaryAddItem[]
}>()

const emit = defineEmits<{
  close: []
  add: [id: string]
  remove: [id: string]
  create: []
}>()

const selected = ref<SummaryAddItem | null>(null)

// 목록이 닫히면 상세도 같이 닫는다 — 다음에 열었을 때 이전 선택이 남아 있으면 안 된다.
watch(
  () => props.open,
  (open) => {
    if (!open) selected.value = null
  }
)

function isMetric(value: string) {
  return /^[0-9]/.test(value)
}
</script>

<template>
  <StackPage :open="open" title="요약에 카드 추가" @close="emit('close')">
    <p v-if="!items.length" class="summary-add-empty">요약에 넣을 수 있는 카드를 모두 쓰고 있어요.</p>
    <ul v-else class="summary-add-list">
      <li v-for="item in items" :key="item.id">
        <button type="button" class="summary-add-row" @click="selected = item">
          <span class="summary-add-row-main">
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <span class="summary-add-row-value">{{ item.valueText }}</span>
          <svg class="summary-add-row-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </li>
    </ul>

    <button type="button" class="summary-add-create" @click="emit('create')">
      <span aria-hidden="true">＋</span> 대화로 새 지표 만들기
    </button>
  </StackPage>

  <!-- 미리보기 상세 — 목록 위에 쌓인다(중첩 스택). -->
  <StackPage
    :open="Boolean(selected)"
    :title="selected?.label ?? ''"
    back
    layer-class="stack-layer-top"
    dismiss-label="목록으로"
    @close="selected = null"
  >
    <template v-if="selected">
      <p class="summary-add-detail-desc">{{ selected.description }}</p>
      <div class="summary-add-preview">
        <StatCard
          :label="selected.label"
          :value="selected.valueText"
          :hint="selected.hint"
          :value-kind="isMetric(selected.valueText) ? 'metric' : 'text'"
        />
      </div>
      <button
        v-if="selected.custom"
        type="button"
        class="summary-add-delete"
        @click="emit('remove', selected.id)"
      >
        이 카드 삭제
      </button>
    </template>
    <template #footer>
      <button type="button" class="primary" @click="selected && emit('add', selected.id)">＋ 카드 추가</button>
    </template>
  </StackPage>
</template>

<style scoped>
.summary-add-empty {
  margin: 0 0 var(--space-4);
  color: var(--color-muted);
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
}

/* 상세는 설명 → 카드 한 장 순으로 가운데 정렬 — 붙이기 전에 "이게 그 카드다"만 보이면 된다. */
.summary-add-detail-desc {
  margin: 0 auto var(--space-6);
  max-width: 300px;
  color: var(--color-muted);
  font-size: var(--text-info-size);
  line-height: var(--text-info-line);
  text-align: center;
}

.summary-add-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.summary-add-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: none;
  border-radius: var(--radius-card);
  background: var(--color-surface-card);
  color: var(--color-text);
  text-align: left;
}

.summary-add-row-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.summary-add-row-main strong {
  font-size: var(--text-body-size);
  font-weight: var(--font-weight-semibold);
}

.summary-add-row-main small {
  color: var(--color-muted);
  font-size: var(--text-caption-size);
}

.summary-add-row-value {
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  white-space: nowrap;
}

.summary-add-row-arrow {
  width: 18px;
  height: 18px;
  flex: none;
  fill: none;
  stroke: var(--color-muted-2);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.summary-add-create {
  width: 100%;
  margin-top: var(--space-4);
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--color-text);
  font-size: var(--text-body-size);
}

/* 상세는 카드 하나만 크게 보여준다 — 붙이기 전에 "이게 그 카드다"가 분명해야 한다. */
.summary-add-preview {
  max-width: 280px;
  margin: 0 auto;
}

.summary-add-delete {
  width: 100%;
  margin-top: var(--space-5);
  padding: var(--space-3);
  border: none;
  border-radius: var(--radius-button);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: var(--text-body-size);
}
</style>

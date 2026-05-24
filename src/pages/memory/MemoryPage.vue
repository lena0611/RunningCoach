<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import type { TrainingMemory } from '@/entities/training-memory/model'
import SectionCard from '@/shared/ui/SectionCard.vue'

const memoryStore = useMemoryStore()
const draft = reactive<TrainingMemory>(JSON.parse(JSON.stringify(memoryStore.memory)))
const saving = ref(false)
const error = ref('')

watch(
  () => memoryStore.selectedUserId,
  () => {
    Object.assign(draft, JSON.parse(JSON.stringify(memoryStore.memory)))
  }
)

function join(items: string[]) {
  return items.join('\n')
}

function split(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await memoryStore.update(JSON.parse(JSON.stringify(draft)))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장 실패'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="page memory-page">
    <SectionCard>
      <div class="section-heading">
        <h2>코칭 메모리</h2>
        <button type="button" :disabled="saving" @click="save">{{ saving ? '저장 중' : '저장' }}</button>
      </div>
      <p v-if="error || memoryStore.error" class="error">{{ error || memoryStore.error }}</p>
      <p class="helper">계정 이름, 출생연도, 성별, PB 같은 개인정보는 우상단 계정 메뉴에서 수정합니다.</p>
      <form class="form-grid">
        <div class="form-section-title full">목표</div>
        <label class="full">
          훈련 목표
          <input v-model="draft.goal" />
        </label>
        <div class="form-section-title full">AI 관리 훈련 루틴</div>
        <div class="sub-panel full">
          <strong>주간 루틴</strong>
          <p class="helper">주간 루틴은 AI 코칭이 목표와 누적 데이터를 보고 유지하거나 수정합니다.</p>
          <ul class="memory-list">
            <li v-for="item in draft.weeklyPattern" :key="item">{{ item }}</li>
          </ul>
        </div>
        <label class="full">
          장거리 전략
          <textarea v-model="draft.longRunStrategy" rows="3" />
        </label>
        <label class="full">
          현재 볼륨 노트
          <textarea v-model="draft.currentVolumeNote" rows="3" />
        </label>
        <div class="form-section-title full">개인화 메모</div>
        <label class="full">
          부상/이슈
          <textarea :value="join(draft.knownIssues)" rows="5" @input="draft.knownIssues = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label class="full">
          러닝 스타일
          <textarea :value="join(draft.runningStyle)" rows="6" @input="draft.runningStyle = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label class="full">
          여름 전략
          <textarea :value="join(draft.heatStrategy)" rows="5" @input="draft.heatStrategy = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
        <label class="full">
          코칭 메모
          <textarea :value="join(draft.aiNotes)" rows="5" @input="draft.aiNotes = split(($event.target as HTMLTextAreaElement).value)" />
        </label>
      </form>
    </SectionCard>
  </section>
</template>

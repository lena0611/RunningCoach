<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import { formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import RunForm from '@/shared/ui/RunForm.vue'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'
import EmptyState from '@/shared/ui/EmptyState.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

const runStore = useRunStore()
const selectedType = ref<RunType | 'All'>('All')
const editing = ref<RunLog | null>(null)
const editPanel = ref<HTMLElement | null>(null)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const error = ref('')

const filteredRuns = computed(() =>
  selectedType.value === 'All' ? runStore.sortedRuns : runStore.sortedRuns.filter((run) => run.type === selectedType.value)
)
const filterOptions = computed(() => [
  { value: 'All', label: 'All' },
  ...runTypes.map((type) => ({ value: type, label: type }))
])

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
})

function startEdit(run: RunLog) {
  error.value = ''
  editing.value = JSON.parse(JSON.stringify(run))
  nextTick(() => {
    editPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  error.value = ''
  try {
    await runStore.updateRun(editing.value)
    editing.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '수정 실패'
  } finally {
    saving.value = false
  }
}

async function remove(run: RunLog) {
  if (!window.confirm(`${run.date} ${run.distanceKm}km 기록을 삭제할까요?`)) return
  deletingId.value = run.id
  error.value = ''
  try {
    await runStore.deleteRun(run.id)
    if (editing.value?.id === run.id) editing.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '삭제 실패'
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <section class="page">
    <section v-if="editing" ref="editPanel" class="section-card">
      <div class="section-heading">
        <h2>기록 수정</h2>
      </div>
      <RunForm v-model="editing" />
      <div class="actions">
        <button type="button" :disabled="saving" @click="saveEdit">{{ saving ? '저장 중' : '저장' }}</button>
        <button class="ghost" type="button" :disabled="saving" @click="editing = null">취소</button>
      </div>
    </section>
    <SectionCard>
      <div class="section-heading">
        <h2>Run Log</h2>
        <BottomSheetSelect v-model="selectedType" label="세션 타입" :options="filterOptions" compact />
      </div>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <div v-if="filteredRuns.length" class="run-list">
        <article v-for="run in filteredRuns" :key="run.id" class="run-row">
          <div>
            <div class="run-row-title">
              <strong>{{ run.date }}<span v-if="run.sessionTitle"> · {{ run.sessionTitle }}</span></strong>
              <RunTypeBadge :type="run.type" />
            </div>
            <div class="run-metrics-line">
              <strong>{{ run.distanceKm }}km</strong>
              <span>{{ formatDuration(run.durationSec) }}</span>
              <span>{{ formatPace(run.avgPaceSec) }}/km</span>
            </div>
            <small>HR {{ formatInteger(run.avgHeartRate) }} / {{ formatInteger(run.maxHeartRate) }} · Cad {{ formatInteger(run.cadence) }} · {{ estimateHeartRateDrift(run) }}</small>
            <small v-if="run.courseType !== 'Unknown' || run.rpe || run.workoutFeeling">
              {{ run.courseType }} · RPE {{ run.rpe ?? '-' }} · {{ run.workoutFeeling || run.companion || '-' }}
            </small>
          </div>
          <div class="row-actions">
            <button class="ghost" type="button" @click="startEdit(run)">수정</button>
            <button class="ghost danger" type="button" :disabled="deletingId === run.id" @click="remove(run)">
              {{ deletingId === run.id ? '삭제 중' : '삭제' }}
            </button>
          </div>
        </article>
      </div>
      <EmptyState v-else title="기록이 없습니다." description="Upload에서 HealthKit 또는 FIT 기록을 저장하세요." />
      <p v-if="error" class="error">{{ error }}</p>
    </SectionCard>
  </section>
</template>

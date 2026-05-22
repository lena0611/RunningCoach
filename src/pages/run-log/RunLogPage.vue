<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import { formatDuration, formatPace } from '@/shared/lib/format'
import RunForm from '@/shared/ui/RunForm.vue'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'

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
    <section v-if="editing" ref="editPanel" class="panel">
      <div class="section-heading">
        <h2>기록 수정</h2>
      </div>
      <RunForm v-model="editing" />
      <div class="actions">
        <button type="button" :disabled="saving" @click="saveEdit">{{ saving ? '저장 중' : '저장' }}</button>
        <button class="ghost" type="button" :disabled="saving" @click="editing = null">취소</button>
      </div>
    </section>
    <section class="panel">
      <div class="section-heading">
        <h2>Run Log</h2>
        <select v-model="selectedType">
          <option value="All">All</option>
          <option v-for="type in runTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <div v-if="filteredRuns.length" class="run-list">
        <article v-for="run in filteredRuns" :key="run.id" class="run-row">
          <div>
            <strong>{{ run.date }} · {{ run.sessionTitle || run.type }}</strong>
            <span>{{ run.distanceKm }}km · {{ formatDuration(run.durationSec) }} · {{ formatPace(run.avgPaceSec) }}/km</span>
            <small>HR {{ run.avgHeartRate ?? '-' }} / {{ run.maxHeartRate ?? '-' }} · Cad {{ run.cadence ?? '-' }} · {{ estimateHeartRateDrift(run) }}</small>
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
      <p v-else class="empty">기록이 없습니다.</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </section>
</template>

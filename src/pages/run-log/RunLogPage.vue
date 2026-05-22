<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import { formatDuration, formatPace } from '@/shared/lib/format'
import RunForm from '@/shared/ui/RunForm.vue'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'

const runStore = useRunStore()
const selectedType = ref<RunType | 'All'>('All')
const editing = ref<RunLog | null>(null)
const error = ref('')

const filteredRuns = computed(() =>
  selectedType.value === 'All' ? runStore.sortedRuns : runStore.sortedRuns.filter((run) => run.type === selectedType.value)
)

function startEdit(run: RunLog) {
  editing.value = JSON.parse(JSON.stringify(run))
}

function saveEdit() {
  if (!editing.value) return
  runStore.updateRun(editing.value).then(() => {
    editing.value = null
  }).catch((err) => {
    error.value = err instanceof Error ? err.message : '수정 실패'
  })
}

function remove(id: string) {
  runStore.deleteRun(id).catch((err) => {
    error.value = err instanceof Error ? err.message : '삭제 실패'
  })
}
</script>

<template>
  <section class="page">
    <section class="panel">
      <div class="section-heading">
        <h2>Run Log</h2>
        <select v-model="selectedType">
          <option value="All">All</option>
          <option v-for="type in runTypes" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>
      <div v-if="filteredRuns.length" class="run-list">
        <article v-for="run in filteredRuns" :key="run.id" class="run-row">
          <div>
            <strong>{{ run.date }} · {{ run.type }}</strong>
            <span>{{ run.distanceKm }}km · {{ formatDuration(run.durationSec) }} · {{ formatPace(run.avgPaceSec) }}/km</span>
            <small>HR {{ run.avgHeartRate ?? '-' }} / {{ run.maxHeartRate ?? '-' }} · Cad {{ run.cadence ?? '-' }} · {{ estimateHeartRateDrift(run) }}</small>
          </div>
          <div class="row-actions">
            <button class="ghost" type="button" @click="startEdit(run)">수정</button>
            <button class="ghost danger" type="button" @click="remove(run.id)">삭제</button>
          </div>
        </article>
      </div>
      <p v-else class="empty">기록이 없습니다.</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
    <section v-if="editing" class="panel">
      <div class="section-heading">
        <h2>기록 수정</h2>
      </div>
      <RunForm v-model="editing" />
      <div class="actions">
        <button type="button" @click="saveEdit">저장</button>
        <button class="ghost" type="button" @click="editing = null">취소</button>
      </div>
    </section>
  </section>
</template>

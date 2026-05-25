<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import { formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import RunForm from '@/shared/ui/RunForm.vue'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'
import EmptyState from '@/shared/ui/EmptyState.vue'
import ListRow from '@/shared/ui/ListRow.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

const runStore = useRunStore()
const selectedType = ref<RunType | 'All'>('All')
const editing = ref<RunLog | null>(null)
const editSnapshot = ref('')
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const error = ref('')

const filteredRuns = computed(() =>
  selectedType.value === 'All' ? runStore.sortedRuns : runStore.sortedRuns.filter((run) => run.type === selectedType.value)
)
const filterOptions = computed(() => [
  { value: 'All', label: 'All' },
  ...runTypes.map((type) => ({ value: type, label: type }))
])
const isEditDirty = computed(() => Boolean(editing.value) && JSON.stringify(editing.value) !== editSnapshot.value)

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
})

watch(
  () => Boolean(editing.value),
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
})

function startEdit(run: RunLog) {
  error.value = ''
  editing.value = JSON.parse(JSON.stringify(run))
  editSnapshot.value = JSON.stringify(editing.value)
}

async function saveEdit() {
  if (!editing.value || !isEditDirty.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = await runStore.updateRun(editing.value)
    editing.value = JSON.parse(JSON.stringify(updated))
    editSnapshot.value = JSON.stringify(editing.value)
    editing.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '수정 실패'
  } finally {
    saving.value = false
  }
}

function askRemove(run: RunLog) {
  pendingDeleteRun.value = run
}

async function confirmRemove() {
  if (!pendingDeleteRun.value) return
  const run = pendingDeleteRun.value
  deletingId.value = run.id
  error.value = ''
  try {
    await runStore.deleteRun(run.id)
    if (editing.value?.id === run.id) editing.value = null
    pendingDeleteRun.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '삭제 실패'
  } finally {
    deletingId.value = null
  }
}

function closeEdit() {
  editing.value = null
  editSnapshot.value = ''
}
</script>

<template>
  <section class="page">
    <SectionCard>
      <div class="section-heading">
        <h2>Run Log</h2>
        <BottomSheetSelect v-model="selectedType" label="세션 타입" :options="filterOptions" compact />
      </div>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <div v-if="filteredRuns.length" class="run-list">
        <ListRow
          v-for="run in filteredRuns"
          :key="run.id"
          class="run-list-row"
          :kicker="formatDateWithWeekday(run.date)"
          :title="run.sessionTitle || run.type"
          :detail="`HR ${formatInteger(run.avgHeartRate)} / ${formatInteger(run.maxHeartRate)} · Cad ${formatInteger(run.cadence)} · ${estimateHeartRateDrift(run)}`"
          :metric="`${run.distanceKm}km`"
        >
          <template #addon>
            <RunTypeBadge :type="run.type" />
            <div class="row-actions">
              <button class="icon-only-button" type="button" aria-label="기록 수정" @click="startEdit(run)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
                  <path d="m13.6 6.2 4.2 4.2" />
                </svg>
              </button>
              <button class="icon-only-button danger" type="button" :disabled="deletingId === run.id" aria-label="기록 삭제" @click="askRemove(run)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5.5 7h13" />
                  <path d="M9.5 7V5.5h5V7" />
                  <path d="m8 9 .6 9.5h6.8L16 9" />
                  <path d="M10.5 11.5v4" />
                  <path d="M13.5 11.5v4" />
                </svg>
              </button>
            </div>
          </template>
          <div>
            <div class="run-row-title">
              <strong>{{ formatDuration(run.durationSec) }} · {{ formatPace(run.avgPaceSec) }}/km</strong>
            </div>
            <small v-if="run.courseType !== 'Unknown' || run.rpe || run.workoutFeeling">
              {{ run.courseType }} · RPE {{ run.rpe ?? '-' }} · {{ run.workoutFeeling || run.companion || '-' }}
            </small>
          </div>
        </ListRow>
      </div>
      <EmptyState v-else title="기록이 없습니다." description="Upload에서 HealthKit 또는 FIT 기록을 저장하세요." />
      <p v-if="error" class="error">{{ error }}</p>
    </SectionCard>

    <Teleport to="body">
      <div v-if="editing" class="memory-stack-layer" data-no-swipe>
        <section class="memory-stack-page">
          <header class="memory-stack-header">
            <button class="stack-icon-button" type="button" aria-label="뒤로" @click="closeEdit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <p class="eyebrow">Run Log</p>
              <h2>기록 수정</h2>
            </div>
            <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeEdit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </header>
          <main class="memory-stack-content">
            <RunForm v-model="editing" />
            <button class="danger full" type="button" @click="askRemove(editing)">이 기록 삭제</button>
          </main>
          <footer class="stack-action-bar">
            <button type="button" :disabled="saving || !isEditDirty" @click="saveEdit">{{ saving ? '저장 중' : isEditDirty ? '변경사항 저장' : '저장됨' }}</button>
          </footer>
        </section>
      </div>

      <div v-if="pendingDeleteRun" class="bottom-sheet-layer confirm-layer" role="presentation" @click.self="pendingDeleteRun = null">
        <section class="bottom-sheet confirm-sheet" role="dialog" aria-modal="true" aria-label="삭제 확인">
          <div class="bottom-sheet-handle" />
          <h2>러닝 기록을 삭제할까요?</h2>
          <p>{{ formatDateWithWeekday(pendingDeleteRun.date) }} · {{ pendingDeleteRun.distanceKm }}km 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
          <div class="confirm-actions">
            <button class="danger" type="button" :disabled="deletingId === pendingDeleteRun.id" @click="confirmRemove">
              {{ deletingId === pendingDeleteRun.id ? '삭제 중' : '삭제' }}
            </button>
            <button class="ghost" type="button" :disabled="Boolean(deletingId)" @click="pendingDeleteRun = null">취소</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

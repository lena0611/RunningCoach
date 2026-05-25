<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import { fetchCoachReports, requestCoachRun, type CoachReport } from '@/shared/api/coachRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { formatDateTimeWithWeekday, formatDateWithWeekday, formatDuration, formatPace } from '@/shared/lib/format'
import CoachMessage from '@/shared/ui/CoachMessage.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const selectedRunId = ref('')
const userNote = ref('')
const loading = ref(false)
const error = ref('')
const reports = ref<CoachReport[]>([])

const selectedRun = computed(() => runStore.sortedRuns.find((run) => run.id === selectedRunId.value) ?? null)
const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
const runOptions = computed(() => [
  { value: '', label: '최근 흐름만 사용' },
  ...runStore.sortedRuns.map((run) => ({
    value: run.id,
    label: `${formatDateWithWeekday(run.date)} · ${run.type}`,
    description: `${run.distanceKm}km`
  }))
])

onMounted(loadReports)

async function loadReports() {
  if (!isSupabaseConfigured) return
  try {
    reports.value = await fetchCoachReports()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '코칭 기록을 불러오지 못했습니다.'
  }
}

async function coach() {
  loading.value = true
  error.value = ''
  try {
    const report = await requestCoachRun(selectedRunId.value || null, userNote.value)
    reports.value = [
      report,
      ...reports.value.filter((item) => {
        if (item.id === report.id) return false
        return !(report.selectedRunId && item.selectedRunId === report.selectedRunId)
      })
    ]
    if (report.trainingMemoryUpdated) {
      await memoryStore.load()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'AI 코칭 요청 실패'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="page coach-page">
    <SectionCard class="coach-composer">
      <div class="section-heading">
        <h2>AI Coach</h2>
      </div>
      <p class="helper">선택 기록을 활성 목표와 부상관리 기준에 맞춰 짧게 해석합니다.</p>
      <div class="coach-context-card">
        <span class="context-chip">코칭 기준</span>
        <strong>{{ activeGoal.title }}</strong>
        <small>{{ activeGoal.successCriteria || activeGoal.notes || '성공 기준 미입력' }}</small>
        <small v-if="activeInjury">부상관리: {{ activeInjury.title }} · {{ activeInjury.status }}</small>
      </div>
      <BottomSheetSelect v-model="selectedRunId" label="선택 RunLog" :options="runOptions" />
      <section v-if="selectedRun" class="sub-panel">
        <strong>{{ formatDateWithWeekday(selectedRun.date) }} · {{ selectedRun.sessionTitle || selectedRun.type }}</strong>
        <p>{{ selectedRun.distanceKm }}km · {{ formatDuration(selectedRun.durationSec) }} · {{ formatPace(selectedRun.avgPaceSec) }}/km · HR {{ selectedRun.avgHeartRate ?? '-' }}</p>
        <p v-if="selectedRun.memo">{{ selectedRun.memo }}</p>
        <p v-if="selectedRun.workoutFeeling" class="helper">느낌: {{ selectedRun.workoutFeeling }}</p>
      </section>
      <label>
        오늘 메모
        <textarea v-model="userNote" rows="3" placeholder="예: 오늘 목요일 템포. 후반 3.5km는 와이프랑 9분대 회복 조깅." />
      </label>
      <div class="actions">
        <button type="button" :disabled="loading || !isSupabaseConfigured" @click="coach">{{ loading ? '분석 중' : 'AI 코칭 요청' }}</button>
      </div>
      <p v-if="!isSupabaseConfigured" class="error">Supabase 환경변수가 설정되어야 AI 코칭을 사용할 수 있습니다.</p>
      <p v-if="error" class="error">{{ error }}</p>
    </SectionCard>

    <SectionCard class="coach-thread">
      <div class="section-heading">
        <h2>코칭 리포트</h2>
      </div>
      <div v-for="report in reports" :key="report.id" class="coach-thread-item">
        <CoachMessage v-if="report.userNote" role="user" :text="report.userNote" :meta="formatDateTimeWithWeekday(report.updatedAt || report.createdAt)" />
        <CoachMessage role="coach" :text="report.report" meta="RunContext Coach" />
        <p v-if="report.trainingMemoryUpdated" class="helper">AI가 목표와 누적 기록을 기준으로 코칭 메모리의 주간 루틴을 갱신했습니다.</p>
      </div>
      <EmptyState v-if="!reports.length" title="아직 코칭 리포트가 없습니다." description="RunLog를 고르고 오늘 메모를 짧게 적으면 코치가 맥락을 붙여 해석합니다." />
    </SectionCard>
  </section>
</template>

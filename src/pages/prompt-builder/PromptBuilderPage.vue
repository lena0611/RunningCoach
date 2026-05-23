<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { fetchCoachReports, requestCoachRun, type CoachReport } from '@/shared/api/coachRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { formatDuration, formatPace } from '@/shared/lib/format'
import CoachMessage from '@/shared/ui/CoachMessage.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'

const runStore = useRunStore()
const selectedRunId = ref('')
const userNote = ref('')
const loading = ref(false)
const error = ref('')
const reports = ref<CoachReport[]>([])

const selectedRun = computed(() => runStore.sortedRuns.find((run) => run.id === selectedRunId.value) ?? null)

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
    reports.value = [report, ...reports.value]
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
      <p class="helper">RunLog, 누적 메모리, 오늘 메모를 합쳐 짧은 코칭 리포트를 생성합니다.</p>
      <label>
        선택 RunLog
        <select v-model="selectedRunId">
          <option value="">최근 흐름만 사용</option>
          <option v-for="run in runStore.sortedRuns" :key="run.id" :value="run.id">{{ run.date }} · {{ run.type }} · {{ run.distanceKm }}km</option>
        </select>
      </label>
      <section v-if="selectedRun" class="sub-panel">
        <strong>{{ selectedRun.date }} · {{ selectedRun.sessionTitle || selectedRun.type }}</strong>
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
        <CoachMessage v-if="report.userNote" role="user" :text="report.userNote" :meta="new Date(report.createdAt).toLocaleString()" />
        <CoachMessage role="coach" :text="report.report" meta="RunContext Coach" />
      </div>
      <EmptyState v-if="!reports.length" title="아직 코칭 리포트가 없습니다." description="RunLog를 고르고 오늘 메모를 짧게 적으면 코치가 맥락을 붙여 해석합니다." />
    </SectionCard>
  </section>
</template>

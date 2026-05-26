<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { runTypes, type Lap, type RunLog, type RunType } from '@/entities/run/model'
import UploadRunPage from '@/pages/upload-run/UploadRunPage.vue'
import { fetchCoachReports, requestCoachRun, type CoachReport } from '@/shared/api/coachRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { formatDateTimeWithWeekday, formatDateWithWeekday, formatDuration, formatInteger, formatPace } from '@/shared/lib/format'
import { estimateHeartRateDrift } from '@/shared/lib/runStats'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import CoachMessage from '@/shared/ui/CoachMessage.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import ListRow from '@/shared/ui/ListRow.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'

const LapSplitChart = defineAsyncComponent(() => import('@/shared/ui/LapSplitChart.vue'))

const runStore = useRunStore()
const weatherStore = useWeatherStore()
const selectedType = ref<RunType | 'All'>('All')
const selectedDate = ref<string | null>(null)
const lapView = ref<'list' | 'chart'>('list')
const visibleCount = ref(10)
const loadMoreRef = ref<HTMLElement | null>(null)
const observer = ref<IntersectionObserver | null>(null)
const detailRun = ref<RunLog | null>(null)
const addingRun = ref(false)
const editing = ref<RunLog | null>(null)
const editSnapshot = ref('')
const coachRun = ref<RunLog | null>(null)
const coachNote = ref('')
const coachLoading = ref(false)
const coachError = ref('')
const reports = ref<CoachReport[]>([])
const reportsLoaded = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const error = ref('')
const calendarMonth = ref(toMonthKey(new Date()))

const filterOptions = computed(() => [
  { value: 'All', label: 'All' },
  ...runTypes.map((type) => ({ value: type, label: type }))
])

const filteredRuns = computed(() => {
  const byType = selectedType.value === 'All' ? runStore.sortedRuns : runStore.sortedRuns.filter((run) => run.type === selectedType.value)
  return selectedDate.value ? byType.filter((run) => run.date === selectedDate.value) : byType
})

const visibleRuns = computed(() => filteredRuns.value.slice(0, visibleCount.value))
const hasMoreRuns = computed(() => visibleCount.value < filteredRuns.value.length)
const isEditDirty = computed(() => Boolean(editing.value) && JSON.stringify(editing.value) !== editSnapshot.value)
const openStack = computed(() => Boolean(detailRun.value || addingRun.value || editing.value || coachRun.value))
const runsByDate = computed(() => {
  const map = new Map<string, RunLog[]>()
  for (const run of runStore.sortedRuns) {
    const list = map.get(run.date) ?? []
    list.push(run)
    map.set(run.date, list)
  }
  return map
})
const calendarTitle = computed(() => {
  const [year, month] = calendarMonth.value.split('-')
  return `${year}. ${Number(month)}.`
})
const calendarCells = computed(() => buildCalendarCells(calendarMonth.value, runsByDate.value))
const selectedReports = computed(() => {
  if (!coachRun.value) return []
  return reports.value
    .filter((report) => report.selectedRunId === coachRun.value?.id)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
})

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
  setupObserver()
})

watch(openStack, (open) => {
  document.body.classList.toggle('memory-stack-open', open)
})

watch([filteredRuns, selectedType, selectedDate], () => {
  visibleCount.value = 10
  nextTick(setupObserver)
})

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
  observer.value?.disconnect()
})

function setupObserver() {
  observer.value?.disconnect()
  if (!loadMoreRef.value) return
  observer.value = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      showMore()
    }
  })
  observer.value.observe(loadMoreRef.value)
}

function showMore() {
  if (hasMoreRuns.value) visibleCount.value += 10
}

function previousMonth() {
  calendarMonth.value = shiftMonth(calendarMonth.value, -1)
}

function nextMonth() {
  calendarMonth.value = shiftMonth(calendarMonth.value, 1)
}

function toggleDate(date: string, hasRun: boolean) {
  if (!hasRun) return
  selectedDate.value = selectedDate.value === date ? null : date
}

function openDetail(run: RunLog) {
  error.value = ''
  lapView.value = 'list'
  detailRun.value = run
  void ensureReportsLoaded()
}

function closeDetail() {
  detailRun.value = null
}

function openAddRun() {
  error.value = ''
  addingRun.value = true
}

async function closeAddRun(saved = false) {
  addingRun.value = false
  if (saved) {
    await runStore.load()
  }
}

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
    if (updated) {
      detailRun.value = updated
      coachRun.value = coachRun.value?.id === updated.id ? updated : coachRun.value
    }
    editing.value = null
    editSnapshot.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : '수정 실패'
  } finally {
    saving.value = false
  }
}

function closeEdit() {
  editing.value = null
  editSnapshot.value = ''
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
    if (detailRun.value?.id === run.id) detailRun.value = null
    if (editing.value?.id === run.id) editing.value = null
    if (coachRun.value?.id === run.id) coachRun.value = null
    pendingDeleteRun.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : '삭제 실패'
  } finally {
    deletingId.value = null
  }
}

async function openCoach(run: RunLog) {
  coachRun.value = run
  coachError.value = ''
  await ensureReportsLoaded()
}

async function ensureReportsLoaded() {
  if (!reportsLoaded.value && isSupabaseConfigured) {
    try {
      reports.value = await fetchCoachReports()
      reportsLoaded.value = true
    } catch (err) {
      coachError.value = err instanceof Error ? err.message : '코칭 기록을 불러오지 못했습니다.'
    }
  }
}

function hasCoachThread(run: RunLog) {
  return reports.value.some((report) => report.selectedRunId === run.id)
}

function detailCoachButtonLabel(run: RunLog) {
  if (!reportsLoaded.value) return 'AI 코칭'
  return hasCoachThread(run) ? '코칭 이어가기' : 'AI 코칭 받기'
}

function closeCoach() {
  coachRun.value = null
  coachNote.value = ''
  coachError.value = ''
}

async function requestCoach() {
  if (!coachRun.value) return
  coachLoading.value = true
  coachError.value = ''
  try {
    const report = await requestCoachRun(coachRun.value.id, coachNote.value, weatherStore.snapshot)
    reports.value = [report, ...reports.value.filter((item) => item.id !== report.id)]
    coachNote.value = ''
    reportsLoaded.value = true
  } catch (err) {
    coachError.value = err instanceof Error ? err.message : 'AI 코칭 요청 실패'
  } finally {
    coachLoading.value = false
  }
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  return toMonthKey(new Date(year, month - 1 + offset, 1))
}

function buildCalendarCells(monthKey: string, map: Map<string, RunLog[]>) {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<{ key: string; date: string; day: number | null; runs: RunLog[] }> = []
  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push({ key: `blank-${i}`, date: '', day: null, runs: [] })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    cells.push({ key: date, date, day, runs: map.get(date) ?? [] })
  }
  return cells
}

function formatLapDuration(lap: Lap) {
  if (!lap.distanceKm || !lap.paceSec) return '-'
  return formatDuration(lap.distanceKm * lap.paceSec)
}
</script>

<template>
  <PageLayout variant="run-log">
    <SectionCard class="calendar-card">
      <SectionHeader title="Run Log">
        <div class="run-log-heading-actions">
          <button class="icon-link-button" type="button" aria-label="기록 추가" @click="openAddRun">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
          </button>
          <BottomSheetSelect v-model="selectedType" label="세션 타입" :options="filterOptions" compact />
        </div>
      </SectionHeader>
      <div class="calendar-header">
        <button class="icon-only-button" type="button" aria-label="이전 달" @click="previousMonth">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <strong>{{ calendarTitle }}</strong>
        <button class="icon-only-button" type="button" aria-label="다음 달" @click="nextMonth">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
      <div class="run-calendar-weekdays">
        <span v-for="day in ['일', '월', '화', '수', '목', '금', '토']" :key="day">{{ day }}</span>
      </div>
      <div class="run-calendar-grid">
        <button
          v-for="cell in calendarCells"
          :key="cell.key"
          class="run-calendar-day"
          :class="{ 'has-run': cell.runs.length, selected: selectedDate === cell.date }"
          type="button"
          :disabled="!cell.day || !cell.runs.length"
          @click="toggleDate(cell.date, Boolean(cell.runs.length))"
        >
          <span v-if="cell.day">{{ cell.day }}</span>
          <small v-if="cell.runs.length">{{ cell.runs.length }}</small>
        </button>
      </div>
      <button v-if="selectedDate" class="ghost full compact-action" type="button" @click="selectedDate = null">
        전체 기록 보기
      </button>
    </SectionCard>

    <SectionCard>
      <SectionHeader :title="selectedDate ? formatDateWithWeekday(selectedDate) : '전체 기록'">
        <small class="helper">{{ filteredRuns.length }}개</small>
      </SectionHeader>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <div v-if="visibleRuns.length" class="run-list">
        <ListRow
          v-for="run in visibleRuns"
          :key="run.id"
          class="run-list-row run-click-row"
          :kicker="formatDateWithWeekday(run.date)"
          :title="run.sessionTitle || run.type"
          :detail="`HR ${formatInteger(run.avgHeartRate)} / ${formatInteger(run.maxHeartRate)} · Avg Cad ${formatInteger(run.cadence)} · ${estimateHeartRateDrift(run)}`"
          :metric="`${run.distanceKm}km`"
          @click="openDetail(run)"
        >
          <template #leading>
            <RunTypeIcon :type="run.type" />
          </template>
          <template #addon>
            <RunTypeBadge :type="run.type" />
            <span class="run-list-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
            </span>
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
      <div ref="loadMoreRef" class="load-more-sentinel">
        <button v-if="hasMoreRuns" class="secondary full" type="button" @click="showMore">다음 10개 보기</button>
      </div>
      <EmptyState v-if="!visibleRuns.length && !runStore.loading" title="기록이 없습니다." description="Upload에서 HealthKit 또는 FIT 기록을 저장하세요." />
      <p v-if="error" class="error">{{ error }}</p>
    </SectionCard>

    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="detailRun" class="memory-stack-layer" data-no-swipe>
        <section class="memory-stack-page">
          <header class="memory-stack-header">
            <div>
              <h2>세션 상세</h2>
            </div>
            <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeDetail">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
            </button>
          </header>
          <main class="memory-stack-content run-detail-content">
            <SectionCard class="run-detail-hero">
              <div class="run-detail-topline">
                <span class="list-row-kicker">{{ formatDateWithWeekday(detailRun.date) }}</span>
                <div class="run-detail-actions" aria-label="세션 관리">
                  <button class="icon-only-button" type="button" aria-label="기록 수정" @click="startEdit(detailRun)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
                      <path d="m13.6 6.2 4.2 4.2" />
                    </svg>
                  </button>
                  <button class="icon-only-button danger" type="button" :disabled="deletingId === detailRun.id" aria-label="기록 삭제" @click="askRemove(detailRun)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5.5 7h13" />
                      <path d="M9.5 7V5.5h5V7" />
                      <path d="m8 9 .6 9.5h6.8L16 9" />
                      <path d="M10.5 11.5v4" />
                      <path d="M13.5 11.5v4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="run-detail-identity">
                <RunTypeIcon :type="detailRun.type" size="large" />
                <div>
                  <h2>{{ detailRun.sessionTitle || detailRun.type }}</h2>
                  <RunTypeBadge :type="detailRun.type" />
                </div>
              </div>
              <div class="run-detail-metrics">
                <strong>{{ detailRun.distanceKm }}km</strong>
                <span>{{ formatDuration(detailRun.durationSec) }}</span>
                <span>{{ formatPace(detailRun.avgPaceSec) }}/km</span>
              </div>
            </SectionCard>
            <SectionCard>
              <div class="metric-grid compact-metric-grid">
                <div class="metric"><span>평균 페이스</span><strong>{{ formatPace(detailRun.avgPaceSec) }}/km</strong></div>
                <div class="metric"><span>평균 케이던스</span><strong>{{ formatInteger(detailRun.cadence) }}</strong></div>
                <div class="metric"><span>평균 심박</span><strong>{{ formatInteger(detailRun.avgHeartRate) }}</strong></div>
                <div class="metric"><span>최고 심박</span><strong>{{ formatInteger(detailRun.maxHeartRate) }}</strong></div>
                <div class="metric"><span>RPE</span><strong>{{ detailRun.rpe ?? '-' }}</strong></div>
                <div class="metric"><span>드리프트</span><strong>{{ estimateHeartRateDrift(detailRun) }}</strong></div>
              </div>
            </SectionCard>
            <SectionCard v-if="detailRun.memo || detailRun.workoutFeeling || detailRun.painNote">
              <SectionHeader title="메모" />
              <p v-if="detailRun.memo">{{ detailRun.memo }}</p>
              <p v-if="detailRun.workoutFeeling" class="helper">느낌: {{ detailRun.workoutFeeling }}</p>
              <p v-if="detailRun.painNote" class="helper">통증/주의: {{ detailRun.painNote }}</p>
            </SectionCard>
            <SectionCard>
              <SectionHeader title="스플릿">
                <small class="helper">{{ detailRun.laps.length ? `${detailRun.laps.length}개` : '데이터 부족' }}</small>
              </SectionHeader>
              <div v-if="detailRun.laps.length" class="lap-content">
                <div class="view-toggle" role="tablist" aria-label="스플릿 표시 방식">
                  <button type="button" :class="{ active: lapView === 'list' }" role="tab" :aria-selected="lapView === 'list'" @click="lapView = 'list'">목록</button>
                  <button type="button" :class="{ active: lapView === 'chart' }" role="tab" :aria-selected="lapView === 'chart'" @click="lapView = 'chart'">차트</button>
                </div>
                <div v-if="lapView === 'list'" class="lap-split-table">
                  <div class="lap-split-head">
                    <span></span>
                    <span>시간</span>
                    <span>페이스</span>
                    <span>심박수</span>
                    <span>케이던스</span>
                  </div>
                  <div v-for="lap in detailRun.laps" :key="lap.index" class="lap-split-row">
                    <strong>{{ lap.index }}</strong>
                    <span class="lap-time">{{ formatLapDuration(lap) }}</span>
                    <span class="lap-pace">{{ formatPace(lap.paceSec) }}/km</span>
                    <span class="lap-hr">{{ formatInteger(lap.avgHeartRate) }}<small>BPM</small></span>
                    <span class="lap-cad">{{ formatInteger(lap.cadence) }}<small>SPM</small></span>
                  </div>
                </div>
                <LapSplitChart v-else :laps="detailRun.laps" />
              </div>
              <p v-else class="helper">랩별 페이스와 심박이 있으면 자동 세션 재해석과 코칭 근거가 좋아집니다.</p>
            </SectionCard>
          </main>
          <footer class="stack-action-bar run-detail-cta">
            <button type="button" :disabled="!isSupabaseConfigured" @click="openCoach(detailRun)">
              {{ detailCoachButtonLabel(detailRun) }}
            </button>
          </footer>
        </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="addingRun" class="memory-stack-layer stack-layer-top" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>기록 추가</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeAddRun(false)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <UploadRunPage stack-mode @saved="closeAddRun(true)" />
            </main>
          </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="coachRun" class="memory-stack-layer stack-layer-top" data-no-swipe>
        <section class="memory-stack-page">
          <header class="memory-stack-header">
            <button class="stack-icon-button" type="button" aria-label="뒤로" @click="closeCoach">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>코칭</h2>
            </div>
          </header>
          <main class="memory-stack-content coach-stack-content">
            <CoachMessage role="user" :text="`${formatDateWithWeekday(coachRun.date)} ${coachRun.sessionTitle || coachRun.type}`" />
            <template v-if="selectedReports.length">
              <div v-for="report in selectedReports" :key="report.id" class="coach-turn">
                <CoachMessage v-if="report.userNote" role="user" :text="report.userNote" :meta="formatDateTimeWithWeekday(report.createdAt)" />
                <CoachMessage role="coach" :text="report.report" :meta="formatDateTimeWithWeekday(report.updatedAt || report.createdAt)" />
              </div>
            </template>
            <EmptyState v-else title="아직 이 세션의 코칭이 없습니다." description="짧은 메모를 넣고 AI 코칭을 요청하세요." />
            <p v-if="coachError" class="error">{{ coachError }}</p>
          </main>
          <footer class="stack-action-bar coach-input-bar">
            <textarea v-model="coachNote" rows="2" placeholder="예: 오늘 목요일 템포. 후반은 와이프랑 회복 조깅." />
            <button type="button" :disabled="coachLoading || !isSupabaseConfigured" @click="requestCoach">
              {{ coachLoading ? '코칭 중' : selectedReports.length ? '추가 대화' : 'AI 코칭 요청' }}
            </button>
          </footer>
        </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="editing" class="memory-stack-layer stack-layer-top" data-no-swipe>
        <section class="memory-stack-page">
          <header class="memory-stack-header">
            <button v-if="detailRun" class="stack-icon-button" type="button" aria-label="뒤로" @click="closeEdit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <div>
              <h2>기록 수정</h2>
            </div>
            <button v-if="!detailRun" class="stack-icon-button" type="button" aria-label="닫기" @click="closeEdit">
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
      </Transition>

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
  </PageLayout>
</template>

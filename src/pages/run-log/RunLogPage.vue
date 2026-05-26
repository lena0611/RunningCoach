<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
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
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import RunTypeIcon from '@/shared/ui/RunTypeIcon.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
import SchedulingHelpSheet from '@/shared/ui/SchedulingHelpSheet.vue'
import UnitValue from '@/shared/ui/UnitValue.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'

const LapSplitChart = defineAsyncComponent(() => import('@/shared/ui/LapSplitChart.vue'))

const runStore = useRunStore()
const healthKitSyncStore = useHealthKitSyncStore()
const weatherStore = useWeatherStore()
const route = useRoute()
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
const coachNoteInput = ref<HTMLTextAreaElement | null>(null)
const coachLoading = ref(false)
const coachError = ref('')
const reports = ref<CoachReport[]>([])
const reportsLoaded = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const error = ref('')
const calendarMonth = ref(toMonthKey(new Date()))
const schedulingHelpOpen = ref(false)
const coachCommandItems = [
  {
    id: 'session',
    command: '/세션분석',
    title: '세션 분석',
    description: '이 기록이 의도한 훈련과 맞는지 짧게 평가',
    prompt: '이 세션이 의도한 훈련과 맞았는지 핵심만 분석해줘.',
    icon: '↗'
  },
  {
    id: 'routine',
    command: '/루틴점검',
    title: '루틴 점검',
    description: '현재 주간 루틴을 유지할지, 올릴지, 낮출지 판단',
    prompt: '현재 active 목표 기준으로 루틴을 유지할지, 상향/하향 조정할지 근거와 함께 판단해줘.',
    icon: '◎'
  },
  {
    id: 'quality',
    command: '/품질평가',
    title: '훈련 품질',
    description: 'Easy, Tempo, Long Run, Strides 품질 게이트 확인',
    prompt: '이 세션의 훈련 품질이 다음 단계로 올릴 만큼 충분했는지 품질 게이트 기준으로 봐줘.',
    icon: '◆'
  },
  {
    id: 'goal',
    command: '/목표예상',
    title: '목표 예상',
    description: '목표 기록 예상과 최근 변화 방향 확인',
    prompt: '현재 목표 예상 기록과 최근 변화 방향을 보고 목표 달성 흐름이 좋아지는지 봐줘.',
    icon: '⌁'
  },
  {
    id: 'recovery',
    command: '/회복체크',
    title: '회복/부상 체크',
    description: '통증, 피로, 다음 훈련 강도 제한 판단',
    prompt: '부상관리와 회복 반응 기준으로 다음 훈련 강도를 어떻게 가져가야 할지 봐줘.',
    icon: '♡'
  },
  {
    id: 'next',
    command: '/다음훈련',
    title: '다음 훈련',
    description: '이번 세션 이후 다음 세션을 어떻게 가져갈지 제안',
    prompt: '이 세션 이후 다음 훈련을 주간 루틴과 회복 상태 기준으로 제안해줘.',
    icon: '➜'
  }
]

const filterOptions = computed(() => [
  { value: 'All', label: '모든 세션 유형' },
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
  return `${year}.${month}.`
})
const calendarCells = computed(() => buildCalendarCells(calendarMonth.value, runsByDate.value))
const selectedReports = computed(() => {
  if (!coachRun.value) return []
  return reports.value
    .filter((report) => report.selectedRunId === coachRun.value?.id)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
})
const coachCommandQuery = computed(() => {
  const text = coachNote.value.trimStart()
  return text.startsWith('/') ? text.slice(1).trim().toLowerCase() : ''
})
const showCoachCommands = computed(() => coachNote.value.trimStart().startsWith('/'))
const filteredCoachCommands = computed(() => {
  if (!showCoachCommands.value) return []
  const query = coachCommandQuery.value
  if (!query) return coachCommandItems
  return coachCommandItems.filter((item) => {
    return [item.command, item.title, item.description].some((value) => value.toLowerCase().includes(query))
  })
})

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
  setupObserver()
  openRouteRunIfNeeded()
})

watch(openStack, (open) => {
  document.body.classList.toggle('memory-stack-open', open)
})

watch([filteredRuns, selectedType, selectedDate], () => {
  visibleCount.value = 10
  nextTick(setupObserver)
})

watch(
  () => runStore.runs,
  (runs) => {
    if (detailRun.value) {
      detailRun.value = runs.find((run) => run.id === detailRun.value?.id) ?? detailRun.value
    }
    if (coachRun.value) {
      coachRun.value = runs.find((run) => run.id === coachRun.value?.id) ?? coachRun.value
    }
    if (editing.value && !isEditDirty.value) {
      editing.value = runs.find((run) => run.id === editing.value?.id) ?? editing.value
      editSnapshot.value = JSON.stringify(editing.value)
    }
    openRouteRunIfNeeded()
  },
  { deep: true }
)

watch(
  () => route.query.runId,
  () => openRouteRunIfNeeded()
)

watch(coachNote, () => {
  void nextTick(resizeCoachNoteInput)
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

function openRouteRunIfNeeded() {
  const runId = typeof route.query.runId === 'string' ? route.query.runId : ''
  const shouldOpenCoach = route.query.coach === '1'
  if (!runId) return
  const run = runStore.runs.find((item) => item.id === runId)
  if (!run) return
  if (detailRun.value?.id !== runId) openDetail(run)
  if (shouldOpenCoach && coachRun.value?.id !== runId) {
    void openCoach(run)
  }
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
  void nextTick(resizeCoachNoteInput)
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
  return hasCoachThread(run) ? 'AI 코칭 이어가기' : 'AI 코칭 받기'
}

function canRefreshFromHealthKit(run: RunLog) {
  return hasNativeBridge() && run.source === 'healthkit' && Boolean(run.externalId)
}

function closeCoach() {
  coachRun.value = null
  coachNote.value = ''
  coachError.value = ''
}

function clearCoachNote() {
  coachNote.value = ''
  void nextTick(resizeCoachNoteInput)
}

function selectCoachCommand(prompt: string) {
  coachNote.value = prompt
  void nextTick(() => {
    resizeCoachNoteInput()
    coachNoteInput.value?.focus()
  })
}

function resizeCoachNoteInput() {
  const input = coachNoteInput.value
  if (!input) return
  input.style.height = 'auto'
  const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
  const maxHeight = lineHeight * 3 + 24
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`
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
      <div class="run-log-toolbar">
        <button class="icon-link-button" type="button" aria-label="기록 추가" @click="openAddRun">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
        <BottomSheetSelect v-model="selectedType" label="세션 타입" :options="filterOptions" compact />
      </div>
      <div class="calendar-header">
        <button class="calendar-arrow-button" type="button" aria-label="이전 달" @click="previousMonth">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <strong>{{ calendarTitle }}</strong>
        <button class="calendar-arrow-button" type="button" aria-label="다음 달" @click="nextMonth">
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
      <RunSessionList v-if="visibleRuns.length" :runs="visibleRuns" interactive @select="openDetail" />
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
                  <button
                    v-if="canRefreshFromHealthKit(detailRun)"
                    class="icon-only-button"
                    :class="{ spinning: healthKitSyncStore.refreshingRunId === detailRun.id }"
                    type="button"
                    :disabled="healthKitSyncStore.refreshingRunId === detailRun.id"
                    aria-label="HealthKit 세션 다시 갱신"
                    @click="healthKitSyncStore.requestRunRefresh(detailRun)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 11a8 8 0 0 0-14.8-4.2" />
                      <path d="M5 3v4h4" />
                      <path d="M4 13a8 8 0 0 0 14.8 4.2" />
                      <path d="M19 21v-4h-4" />
                    </svg>
                  </button>
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
                <strong><UnitValue :amount="detailRun.distanceKm" unit="km" /></strong>
                <span>{{ formatDuration(detailRun.durationSec) }}</span>
                <span><UnitValue :amount="formatPace(detailRun.avgPaceSec)" unit="/km" /></span>
              </div>
            </SectionCard>
            <SectionCard>
              <div class="metric-grid compact-metric-grid">
                <div class="metric"><span>평균 페이스</span><strong><UnitValue :amount="formatPace(detailRun.avgPaceSec)" unit="/km" /></strong></div>
                <div class="metric"><span>평균 케이던스</span><strong>{{ formatInteger(detailRun.cadence) }}</strong></div>
                <div class="metric"><span>평균 심박</span><strong>{{ formatInteger(detailRun.avgHeartRate) }}</strong></div>
                <div class="metric"><span>최고 심박</span><strong>{{ formatInteger(detailRun.maxHeartRate) }}</strong></div>
                <div class="metric"><span>운동강도</span><strong>{{ detailRun.rpe ?? '-' }}</strong></div>
                <div class="metric"><span>드리프트</span><strong class="metric-text-value">{{ estimateHeartRateDrift(detailRun) }}</strong></div>
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
              <h2>AI 코칭</h2>
            </div>
            <button class="stack-icon-button" type="button" aria-label="AI 스케줄링 기준 보기" @click="schedulingHelpOpen = true">?</button>
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
            <div v-if="showCoachCommands" class="coach-command-menu">
              <button
                v-for="item in filteredCoachCommands"
                :key="item.id"
                class="coach-command-item"
                type="button"
                @click="selectCoachCommand(item.prompt)"
              >
                <span class="coach-command-icon">{{ item.icon }}</span>
                <span>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.description }}</small>
                </span>
                <code>{{ item.command }}</code>
              </button>
              <p v-if="!filteredCoachCommands.length" class="coach-command-empty">맞는 코칭 명령이 없습니다.</p>
            </div>
            <div class="chat-input-wrap">
              <textarea
                ref="coachNoteInput"
                v-model="coachNote"
                rows="1"
                placeholder="메시지 입력"
                @input="resizeCoachNoteInput"
              />
              <button v-if="coachNote" class="input-clear-button" type="button" aria-label="입력 지우기" @click="clearCoachNote">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </div>
            <button class="chat-send-button" type="button" :disabled="coachLoading || !isSupabaseConfigured" :aria-label="selectedReports.length ? '추가 대화 보내기' : 'AI 코칭 요청 보내기'" @click="requestCoach">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
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
      <SchedulingHelpSheet :open="schedulingHelpOpen" @close="schedulingHelpOpen = false" />
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import type { TrainingGoal, TrainingInjuryCheckIn, TrainingMemory } from '@/entities/training-memory/model'
import { detectGoalIntent, type GoalIntentProposal } from '@/features/detect-goal-intent/detectGoalIntent'
import UploadRunPage from '@/pages/upload-run/UploadRunPage.vue'
import { fetchCoachReports, requestCoachRunStream, type CoachInjuryUpdateProposal, type CoachReport } from '@/shared/api/coachRepository'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { resolveRunnerLevel } from '@/shared/lib/runnerLevel'
import { formatDateTimeWithWeekday, formatDateWithWeekday, formatDuration, formatInteger, formatNumberWithCommas, formatPace } from '@/shared/lib/format'
import { getRunFilterTags, hasRunFilterTag, isScheduledSession, type RunFilterTag } from '@/shared/lib/runMetaChips'
import { buildVisibleRunGroups, groupRunsByMonth, type RunMonthGroup, type RunMonthSummary } from '@/pages/run-log/runLogSummary'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import CoachMessage from '@/shared/ui/CoachMessage.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import RunDetailContent from '@/shared/ui/RunDetailContent.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import SchedulingHelpSheet from '@/shared/ui/SchedulingHelpSheet.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const healthKitSyncStore = useHealthKitSyncStore()
const weatherStore = useWeatherStore()
const route = useRoute()
const router = useRouter()
const isRunLogRoute = computed(() => route.path === '/runs')
const selectedTypes = ref<RunType[]>([...runTypes])
const selectedMetaTags = ref<string[]>([])
const metaAllSelected = ref(true)
const selectedDate = ref<string | null>(null)
const visibleCount = ref(10)
const loadMoreRef = ref<HTMLElement | null>(null)
const observer = ref<IntersectionObserver | null>(null)
const runMonthGroupRefs = new Map<string, HTMLElement>()
const activeStickyMonth = ref<RunMonthGroup | null>(null)
const detailRun = ref<RunLog | null>(null)
const addingRun = ref(false)
const editing = ref<RunLog | null>(null)
const editSnapshot = ref('')
const coachRun = ref<RunLog | null>(null)
const coachNote = ref('')
const coachNoteInput = ref<HTMLTextAreaElement | null>(null)
const coachScrollContainer = ref<HTMLElement | null>(null)
const coachAutoScroll = ref(true)
const showCoachScrollButton = ref(false)
const coachLoading = ref(false)
const coachError = ref('')
const coachCommandOpen = ref(false)
const streamingCoachText = ref('')
const streamingCoachMeta = ref('')
// 스트리밍 reveal 스무딩: 수신 버퍼를 rAF 루프로 grapheme 경계 단위 표시한다.
let coachRevealPending = ''
let coachRevealRafId = 0
let coachRevealLastTs = 0
let coachRevealCarry = 0
let coachRevealStopped = false
let coachRevealDrainResolve: (() => void) | null = null
const coachGraphemeSegmenter =
  typeof Intl !== 'undefined' && typeof (Intl as { Segmenter?: unknown }).Segmenter === 'function'
    ? new Intl.Segmenter('ko', { granularity: 'grapheme' })
    : null
// 한 프레임에 표시할 grapheme 상한 — 버스트 수신에도 점프 없이 부드럽게 따라잡도록 제한.
const MAX_COACH_REVEAL_PER_FRAME = 5
const coachThinkingSeconds = ref(1)
const coachThinkingTimer = ref<number | null>(null)
const coachAbortController = ref<AbortController | null>(null)
const reports = ref<CoachReport[]>([])
const reportsLoaded = ref(false)
const reportsLoading = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const pendingGoalProposal = ref<GoalIntentProposal | null>(null)
const pendingGoalCoachNote = ref('')
const savingGoalProposal = ref(false)
const dismissedInjuryProposalIds = ref<string[]>([])
const savingInjuryProposalId = ref('')
const error = ref('')
const calendarMonth = ref(toMonthKey(new Date()))
const schedulingHelpOpen = ref(false)
const deleteSheetDrag = useBottomSheetDrag(() => {
  pendingDeleteRun.value = null
})
const goalSheetDrag = useBottomSheetDrag(closeGoalProposal)

type CalendarCell = {
  key: string
  date: string
  day: number | null
  runs: RunLog[]
  markerType: RunType | null
  hasScheduledRun: boolean
}

type RunMonthSummaryRow = {
  id: string
  label: string
  total: string
  totalUnit?: string
  average: string
  averageUnit?: string
  tone?: 'time' | 'calorie' | 'distance' | 'pace'
}

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
  ...runTypes.map((type) => ({ value: type, label: type }))
])

const metaFilterOptions = computed(() => {
  const tagMap = new Map<string, { value: string; label: string; description?: string }>()
  for (const run of runStore.sortedRuns) {
    for (const tag of getRunFilterTags(run, memoryStore.memory.weeklyPattern)) {
      tagMap.set(tag.value, {
        value: tag.value,
        label: tag.label,
        description: getMetaFilterGroupLabel(tag.group)
      })
    }
  }
  return Array.from(tagMap.values()).sort((a, b) => `${a.description ?? ''}${a.label}`.localeCompare(`${b.description ?? ''}${b.label}`, 'ko'))
})

const metaFilterValues = computed(() => metaFilterOptions.value.map((option) => option.value))
const selectedMetaFilterValues = computed({
  get: () => {
    if (metaAllSelected.value) return metaFilterValues.value
    const available = new Set(metaFilterValues.value)
    return selectedMetaTags.value.filter((value) => available.has(value))
  },
  set: (values: string[]) => {
    const available = new Set(metaFilterValues.value)
    const nextValues = values.filter((value) => available.has(value))
    metaAllSelected.value = nextValues.length === metaFilterValues.value.length
    selectedMetaTags.value = nextValues
  }
})

const filteredRuns = computed(() => {
  const byType = selectedTypes.value.length === runTypes.length
    ? runStore.sortedRuns
    : runStore.sortedRuns.filter((run) => selectedTypes.value.includes(run.type))
  const activeMetaTags = selectedMetaFilterValues.value
  const byMeta = activeMetaTags.length === metaFilterValues.value.length
    ? byType
    : byType.filter((run) => activeMetaTags.some((tag) => hasRunFilterTag(run, tag, memoryStore.memory.weeklyPattern)))
  return selectedDate.value ? byMeta.filter((run) => run.date === selectedDate.value) : byMeta
})

const visibleRuns = computed(() => filteredRuns.value.slice(0, visibleCount.value))
// 월별 요약은 전체 데이터(filteredRuns)로 계산하고, 무한스크롤 slice는 표시할 세션 행에만 적용한다.
// (요약을 visibleRuns로 계산하면 두 달 경계에서 아래쪽 달이 부분 집계돼 값이 틀린다.)
const runMonthGroups = computed(() => groupRunsByMonth(filteredRuns.value))
const visibleRunGroups = computed(() => buildVisibleRunGroups(runMonthGroups.value, visibleCount.value))
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
const coachHistoryLoading = computed(() => Boolean(coachRun.value && isSupabaseConfigured && reportsLoading.value && !reportsLoaded.value))
const coachCommandQuery = computed(() => {
  const text = coachNote.value.trimStart()
  return text.startsWith('/') ? text.slice(1).trim().toLowerCase() : ''
})
const showCoachCommands = computed(() => coachCommandOpen.value || coachNote.value.trimStart().startsWith('/'))
const visibleStreamingCoachText = computed(() => {
  if (streamingCoachText.value) return streamingCoachText.value
  if (coachLoading.value) return `${coachThinkingSeconds.value}초째 잘 생각하는 중`
  return ''
})
const filteredCoachCommands = computed(() => {
  if (!showCoachCommands.value) return []
  const query = coachCommandQuery.value
  if (!query) return coachCommandItems
  return coachCommandItems.filter((item) => {
    return [item.command, item.title, item.description].some((value) => value.toLowerCase().includes(query))
  })
})

let reportsLoadPromise: Promise<void> | null = null
let runMonthStickyOffsetResizeObserver: ResizeObserver | null = null
let runMonthStickyOffsetFrame = 0
let runMonthStickyStateFrame = 0

onMounted(() => {
  if (!runStore.loaded && !runStore.loading) {
    runStore.load()
  }
  if (!memoryStore.loading) {
    memoryStore.load()
  }
  setupObserver()
  setupRunMonthStickyOffset()
  // capture 단계로 구독해야 실제 스크롤러인 자식 .tab-swipe-panel의 scroll(및 탭 복귀 시
  // scrollTop=0 리셋이 발화하는 scroll)까지 수신해 sticky 상태를 갱신/해제한다.
  window.addEventListener('scroll', scheduleRunMonthStickyStateSync, { passive: true, capture: true })
  // 스와이프 네비 확정 순간(슬라이드 전)에 년월 sticky를 즉시 제거(스크롤 위치는 불변).
  window.addEventListener('pacelab:tab-swipe-commit', clearRunMonthStickyOnLeave)
  openRouteRunIfNeeded()
})

watch(openStack, (open) => {
  document.body.classList.toggle('memory-stack-open', open)
})

watch([filteredRuns, selectedTypes, selectedMetaFilterValues, selectedDate], () => {
  visibleCount.value = 10
  nextTick(() => {
    setupObserver()
    syncRunMonthStickyState()
  })
})

watch(metaFilterValues, (values) => {
  if (metaAllSelected.value) return
  const available = new Set(values)
  selectedMetaTags.value = selectedMetaTags.value.filter((value) => available.has(value))
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

watch(visibleStreamingCoachText, () => {
  void nextTick(followCoachStream)
})

watch(selectedReports, () => {
  if (!coachRun.value) return
  void nextTick(() => scrollCoachToBottom('auto'))
})

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
  observer.value?.disconnect()
  cleanupRunMonthStickyOffset()
  cleanupRunMonthStickyState()
  stopCoachThinkingTimer()
  coachAbortController.value?.abort()
  resetCoachReveal()
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

function setupRunMonthStickyOffset() {
  cleanupRunMonthStickyOffset()
  const header = document.querySelector<HTMLElement>('.app-header')
  runMonthStickyOffsetResizeObserver = new ResizeObserver(scheduleRunMonthStickyOffsetSync)
  if (header) runMonthStickyOffsetResizeObserver.observe(header)
  window.addEventListener('resize', scheduleRunMonthStickyOffsetSync)
  scheduleRunMonthStickyOffsetSync()
}

function cleanupRunMonthStickyOffset() {
  runMonthStickyOffsetResizeObserver?.disconnect()
  runMonthStickyOffsetResizeObserver = null
  window.removeEventListener('resize', scheduleRunMonthStickyOffsetSync)
  if (runMonthStickyOffsetFrame) window.cancelAnimationFrame(runMonthStickyOffsetFrame)
  runMonthStickyOffsetFrame = 0
  document.documentElement.style.removeProperty('--run-month-sticky-top')
}

function scheduleRunMonthStickyOffsetSync() {
  if (runMonthStickyOffsetFrame) window.cancelAnimationFrame(runMonthStickyOffsetFrame)
  runMonthStickyOffsetFrame = window.requestAnimationFrame(() => {
    runMonthStickyOffsetFrame = 0
    syncRunMonthStickyOffset()
  })
}

function syncRunMonthStickyOffset() {
  const header = document.querySelector<HTMLElement>('.app-header')
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0
  document.documentElement.style.setProperty('--run-month-sticky-top', `${Math.max(0, Math.round(headerBottom))}px`)
  syncRunMonthStickyState()
}

function setRunMonthGroupRef(key: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) {
    runMonthGroupRefs.set(key, element)
    scheduleRunMonthStickyStateSync()
    return
  }
  runMonthGroupRefs.delete(key)
  scheduleRunMonthStickyStateSync()
}

function clearRunMonthStickyOnLeave() {
  activeStickyMonth.value = null
}

function cleanupRunMonthStickyState() {
  window.removeEventListener('scroll', scheduleRunMonthStickyStateSync, { capture: true })
  window.removeEventListener('pacelab:tab-swipe-commit', clearRunMonthStickyOnLeave)
  if (runMonthStickyStateFrame) window.cancelAnimationFrame(runMonthStickyStateFrame)
  runMonthStickyStateFrame = 0
  runMonthGroupRefs.clear()
  activeStickyMonth.value = null
}

function scheduleRunMonthStickyStateSync() {
  if (runMonthStickyStateFrame) window.cancelAnimationFrame(runMonthStickyStateFrame)
  runMonthStickyStateFrame = window.requestAnimationFrame(() => {
    runMonthStickyStateFrame = 0
    syncRunMonthStickyState()
  })
}

function syncRunMonthStickyState() {
  if (selectedDate.value || !visibleRunGroups.value.length) {
    activeStickyMonth.value = null
    return
  }

  const headerBottom = document.querySelector<HTMLElement>('.app-header')?.getBoundingClientRect().bottom ?? 0
  const stickyHeight = 48
  const active = visibleRunGroups.value.find((group) => {
    const element = runMonthGroupRefs.get(group.key)
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return rect.top <= headerBottom && rect.bottom > headerBottom + stickyHeight
  }) ?? null

  activeStickyMonth.value = active
}

function getMonthSummaryRows(summary: RunMonthSummary): RunMonthSummaryRow[] {
  return [
    {
      id: 'runs',
      label: '달리기',
      total: formatInteger(summary.runCount),
      average: ''
    },
    {
      id: 'duration',
      label: '시간',
      total: formatDuration(summary.totalDurationSec),
      average: formatDuration(summary.avgDurationSec),
      tone: 'time'
    },
    {
      id: 'calories',
      label: '킬로칼로리',
      total: formatInteger(summary.totalCalories),
      totalUnit: summary.totalCalories === null ? undefined : 'kcal',
      average: formatInteger(summary.avgCalories),
      averageUnit: summary.avgCalories === null ? undefined : 'kcal',
      tone: 'calorie'
    },
    {
      id: 'distance',
      label: '거리',
      total: formatDistance(summary.totalDistanceKm),
      totalUnit: 'km',
      average: formatDistance(summary.avgDistanceKm),
      averageUnit: 'km',
      tone: 'distance'
    },
    {
      id: 'pace',
      label: '페이스',
      total: '',
      average: formatPace(summary.avgPaceSec),
      averageUnit: summary.avgPaceSec === null ? undefined : '/km',
      tone: 'pace'
    }
  ]
}

function formatDistance(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return formatNumberWithCommas(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  detailRun.value = run
  void ensureReportsLoaded()
}

function openRouteRunIfNeeded() {
  const runId = typeof route.query.runId === 'string' ? route.query.runId : ''
  const shouldOpenCoach = route.query.coach === '1'
  const action = typeof route.query.action === 'string' ? route.query.action : ''
  if (!runId) return
  const run = runStore.runs.find((item) => item.id === runId)
  if (!run) return
  if (detailRun.value?.id !== runId) openDetail(run)
  if (shouldOpenCoach && coachRun.value?.id !== runId) {
    void openCoach(run)
    clearCoachRouteQuery(runId)
  }
  if (action === 'edit' && editing.value?.id !== runId) {
    startEdit(run)
  }
  if (action === 'delete' && pendingDeleteRun.value?.id !== runId) {
    askRemove(run)
  }
  if (action) {
    void router.replace({
      path: '/runs',
      query: {
        runId,
        ...(shouldOpenCoach ? { coach: '1' } : {})
      }
    })
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
    const original = parseRunSnapshot(editSnapshot.value)
    if (original && original.type !== editing.value.type) {
      editing.value.tags = Array.from(new Set([...(editing.value.tags ?? []).filter((tag) => tag !== 'type:auto'), 'type:user']))
    }
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

function parseRunSnapshot(value: string): RunLog | null {
  try {
    return value ? JSON.parse(value) : null
  } catch {
    return null
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
  coachAutoScroll.value = true
  showCoachScrollButton.value = false
  void nextTick(resizeCoachNoteInput)
  await ensureReportsLoaded()
  await nextTick()
  scrollCoachToBottom('auto')
}

async function ensureReportsLoaded() {
  if (reportsLoaded.value || !isSupabaseConfigured) return
  if (reportsLoadPromise) return reportsLoadPromise

  reportsLoading.value = true
  reportsLoadPromise = (async () => {
    try {
      reports.value = await fetchCoachReports()
      reportsLoaded.value = true
    } catch (err) {
      coachError.value = err instanceof Error ? err.message : '코칭 기록을 불러오지 못했습니다.'
    } finally {
      reportsLoading.value = false
      reportsLoadPromise = null
    }
  })()

  return reportsLoadPromise
}

function hasCoachThread(run: RunLog) {
  return reports.value.some((report) => report.selectedRunId === run.id)
}

function detailCoachButtonLabel(run: RunLog) {
  if (!reportsLoaded.value) return 'AI 코칭'
  return hasCoachThread(run) ? 'AI 코칭 이어가기' : 'AI 코칭 받기'
}

function canRefreshFromHealthKit(_run: RunLog) {
  return hasNativeBridge()
}

function closeCoach() {
  stopCoachStream()
  coachRun.value = null
  coachNote.value = ''
  coachError.value = ''
  coachCommandOpen.value = false
  streamingCoachText.value = ''
  streamingCoachMeta.value = ''
  coachAutoScroll.value = true
  showCoachScrollButton.value = false
  clearCoachRouteQuery()
}

function clearCoachRouteQuery(runId = typeof route.query.runId === 'string' ? route.query.runId : '') {
  if (route.path !== '/runs' || route.query.coach !== '1') return
  void router.replace({
    path: '/runs',
    query: runId ? { runId } : {}
  })
}

function clearCoachNote() {
  coachNote.value = ''
  coachCommandOpen.value = true
  void nextTick(resizeCoachNoteInput)
}

function selectCoachCommand(prompt: string) {
  coachNote.value = prompt
  coachCommandOpen.value = false
  void nextTick(() => {
    resizeCoachNoteInput()
    coachNoteInput.value?.focus()
  })
}

function openCoachCommands() {
  if (coachLoading.value) return
  coachCommandOpen.value = true
}

function closeCoachCommands() {
  window.setTimeout(() => {
    const active = document.activeElement
    if (active === coachNoteInput.value) return
    coachCommandOpen.value = false
  }, 120)
}

function dismissCoachKeyboardOnOutsideTap(event: PointerEvent) {
  const input = coachNoteInput.value
  if (!input || document.activeElement !== input) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.coach-input-bar')) return
  input.blur()
  coachCommandOpen.value = false
}

function resizeCoachNoteInput() {
  const input = coachNoteInput.value
  if (!input) return
  input.style.height = 'auto'
  const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22
  const maxHeight = lineHeight * 3 + 24
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`
}

function onCoachScroll() {
  const nearBottom = isCoachNearBottom()
  showCoachScrollButton.value = !nearBottom
  coachAutoScroll.value = nearBottom
}

function followCoachStream() {
  if (coachAutoScroll.value) {
    scrollCoachToBottom('auto')
    return
  }
  showCoachScrollButton.value = true
}

function scrollCoachToBottom(behavior: ScrollBehavior = 'smooth') {
  const container = coachScrollContainer.value
  if (!container) return
  container.scrollTo({
    top: container.scrollHeight,
    behavior
  })
  coachAutoScroll.value = true
  showCoachScrollButton.value = false
}

function isCoachNearBottom(threshold = 96) {
  const container = coachScrollContainer.value
  if (!container) return true
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold
}

async function requestCoach() {
  if (!coachRun.value) return
  if (coachLoading.value) {
    stopCoachStream()
    return
  }
  const note = coachNote.value
  const proposal = detectGoalIntent(note, memoryStore.memory)
  if (proposal) {
    pendingGoalProposal.value = proposal
    pendingGoalCoachNote.value = note
    coachCommandOpen.value = false
    return
  }
  await sendCoachRequest(note)
}

async function sendCoachRequest(note: string) {
  if (!coachRun.value) return
  coachLoading.value = true
  coachError.value = ''
  coachCommandOpen.value = false
  streamingCoachText.value = ''
  streamingCoachMeta.value = 'AI 코치가 답변 중'
  const controller = new AbortController()
  coachAbortController.value = controller
  resetCoachReveal()
  coachRevealStopped = false
  startCoachThinkingTimer()
  try {
    const report = await requestCoachRunStream(coachRun.value.id, note, weatherStore.snapshot, {
      signal: controller.signal,
      onDelta: enqueueCoachReveal,
      runnerLevel: resolveRunnerLevel(memoryStore.memory.athleteProfile, runStore.sortedRuns).level
    })
    await waitForCoachRevealDrain()
    reports.value = [report, ...reports.value.filter((item) => item.id !== report.id)]
    coachNote.value = ''
    coachCommandOpen.value = false
    streamingCoachText.value = ''
    streamingCoachMeta.value = ''
    reportsLoaded.value = true
  } catch (err) {
    resetCoachReveal()
    if (err instanceof Error && err.name === 'AbortError') {
      streamingCoachMeta.value = '생성 중단됨 · 저장되지 않음'
    } else {
      coachError.value = err instanceof Error ? err.message : 'AI 코칭 요청 실패'
      streamingCoachText.value = ''
      streamingCoachMeta.value = ''
    }
  } finally {
    stopCoachThinkingTimer()
    coachLoading.value = false
    if (coachAbortController.value === controller) coachAbortController.value = null
  }
}

// 수신한 delta를 버퍼에 쌓고, rAF drain 루프가 grapheme 경계 단위로 매끄럽게 표시한다.
function enqueueCoachReveal(delta: string) {
  if (!delta) return
  coachRevealPending += delta
  ensureCoachRevealLoop()
}

function ensureCoachRevealLoop() {
  if (coachRevealRafId || coachRevealStopped) return
  coachRevealLastTs = 0
  coachRevealRafId = window.requestAnimationFrame(pumpCoachReveal)
}

function pumpCoachReveal(timestamp: number) {
  coachRevealRafId = 0
  if (coachRevealStopped) {
    settleCoachRevealDrain()
    return
  }
  if (!coachRevealLastTs) coachRevealLastTs = timestamp
  // 탭 전환 등으로 프레임 간격이 크면 한꺼번에 쏟아내지 않도록 제한한다.
  const elapsed = Math.min(Math.max(timestamp - coachRevealLastTs, 0), 80)
  coachRevealLastTs = timestamp

  const backlog = coachRevealPending.length
  if (backlog > 0) {
    // 따라잡았을 때 ~30자/초로 잔잔하게, 밀리면 완만하게 빨라져 따라잡는다.
    const charsPerSecond = Math.min(240, 30 + backlog * 3)
    // 소수 글자를 누적해 60fps보다 느린 속도도 정확히 내고, 프레임당 글자 수를 막아 점프를 없앤다.
    coachRevealCarry += (charsPerSecond * elapsed) / 1000
    const want = Math.min(Math.floor(coachRevealCarry), MAX_COACH_REVEAL_PER_FRAME)
    if (want > 0) {
      const take = clampCoachRevealBoundary(coachRevealPending, want)
      coachRevealCarry -= take
      if (!streamingCoachText.value) stopCoachThinkingTimer()
      streamingCoachText.value += coachRevealPending.slice(0, take)
      coachRevealPending = coachRevealPending.slice(take)
    }
  }

  if (coachRevealPending.length > 0 && !coachRevealStopped) {
    coachRevealRafId = window.requestAnimationFrame(pumpCoachReveal)
  } else {
    coachRevealLastTs = 0
    coachRevealCarry = 0
    settleCoachRevealDrain()
  }
}

// want 글자 지점에서 grapheme 경계로 스냅하고, 코드펜스(백틱 런)는 쪼개지 않는다.
function clampCoachRevealBoundary(text: string, want: number) {
  if (want >= text.length) return text.length
  let boundary = graphemeBoundaryAtMost(text, want)
  if (boundary > 0 && boundary < text.length && text[boundary - 1] === '`' && text[boundary] === '`') {
    let runStart = boundary
    while (runStart > 0 && text[runStart - 1] === '`') runStart -= 1
    if (runStart > 0) {
      boundary = runStart
    } else {
      let runEnd = boundary
      while (runEnd < text.length && text[runEnd] === '`') runEnd += 1
      boundary = runEnd
    }
  }
  return Math.max(1, boundary)
}

function graphemeBoundaryAtMost(text: string, limit: number) {
  if (coachGraphemeSegmenter) {
    let boundary = 0
    let firstGraphemeEnd = 0
    for (const segment of coachGraphemeSegmenter.segment(text)) {
      const end = segment.index + segment.segment.length
      if (!firstGraphemeEnd) firstGraphemeEnd = end
      if (end > limit) break
      boundary = end
    }
    // limit이 첫 grapheme보다 작아도 최소 한 글자는 진행시킨다.
    return boundary > 0 ? boundary : firstGraphemeEnd || Math.min(limit, text.length)
  }
  let end = Math.min(limit, text.length)
  const code = text.charCodeAt(end)
  if (code >= 0xdc00 && code <= 0xdfff) end -= 1 // 서로게이트 페어를 가르지 않는다.
  return Math.max(1, end)
}

// 버퍼가 완전히 표시될 때까지(또는 루프가 멈출 때까지) 기다린다.
function waitForCoachRevealDrain() {
  if (!coachRevealRafId && coachRevealPending.length === 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    coachRevealDrainResolve = resolve
  })
}

function settleCoachRevealDrain() {
  const resolve = coachRevealDrainResolve
  coachRevealDrainResolve = null
  if (resolve) resolve()
}

// 중단/완료/언마운트 시 버퍼와 rAF 루프를 즉시 정리한다.
function resetCoachReveal() {
  coachRevealStopped = true
  coachRevealPending = ''
  if (coachRevealRafId) {
    window.cancelAnimationFrame(coachRevealRafId)
    coachRevealRafId = 0
  }
  coachRevealLastTs = 0
  coachRevealCarry = 0
  settleCoachRevealDrain()
}

async function confirmGoalProposal() {
  if (!pendingGoalProposal.value) return
  savingGoalProposal.value = true
  coachError.value = ''
  const proposal = pendingGoalProposal.value
  const note = pendingGoalCoachNote.value
  try {
    await saveGoalProposal(proposal)
    closeGoalProposal()
    await sendCoachRequest(note)
  } catch (err) {
    coachError.value = err instanceof Error ? err.message : '목표 저장 실패'
  } finally {
    savingGoalProposal.value = false
  }
}

async function skipGoalProposal() {
  const note = pendingGoalCoachNote.value
  closeGoalProposal()
  await sendCoachRequest(note)
}

function closeGoalProposal() {
  pendingGoalProposal.value = null
  pendingGoalCoachNote.value = ''
}

function getInjuryProposalKey(report: CoachReport) {
  const proposal = report.injuryUpdateProposal
  if (!proposal) return ''
  return `${report.id}:${proposal.injuryItemId}:${proposal.proposalType}`
}

function shouldShowInjuryProposal(report: CoachReport) {
  const key = getInjuryProposalKey(report)
  if (!key || dismissedInjuryProposalIds.value.includes(key)) return false
  return Boolean(getProposalInjuryItem(report.injuryUpdateProposal))
}

function getProposalInjuryItem(proposal: CoachInjuryUpdateProposal | null | undefined) {
  if (!proposal) return null
  return memoryStore.memory.injuryItems.find((item) => item.id === proposal.injuryItemId) ?? null
}

function getInjuryProposalTitle(proposal: CoachInjuryUpdateProposal) {
  const item = getProposalInjuryItem(proposal)
  if (!item) return '부상 상태 제안'
  return `${item.title} 상태 제안`
}

function getInjuryProposalSummary(proposal: CoachInjuryUpdateProposal) {
  const parts = []
  if (proposal.suggestedPainLevel !== undefined) parts.push(`통증 ${proposal.suggestedPainLevel ?? '미입력'}/5`)
  if (proposal.suggestedStatus) parts.push(statusLabel(proposal.suggestedStatus))
  return parts.length ? parts.join(' · ') : '사용자 승인 후 상태 기록'
}

function getInjuryProposalSafetyNotes(proposal: CoachInjuryUpdateProposal) {
  return Array.isArray(proposal.safetyNotes) ? proposal.safetyNotes.filter(Boolean) : []
}

function statusLabel(status: 'active' | 'monitoring' | 'resolved') {
  if (status === 'active') return '현재 관리 중'
  if (status === 'monitoring') return '관찰 중'
  return '해소됨'
}

function dismissInjuryProposal(report: CoachReport) {
  const key = getInjuryProposalKey(report)
  if (!key) return
  dismissedInjuryProposalIds.value = [...dismissedInjuryProposalIds.value, key]
}

async function approveInjuryProposal(report: CoachReport) {
  const proposal = report.injuryUpdateProposal
  if (!proposal) return
  const current = getProposalInjuryItem(proposal)
  if (!current) return
  const key = getInjuryProposalKey(report)
  savingInjuryProposalId.value = key
  coachError.value = ''
  try {
    const now = new Date().toISOString()
    const memory = JSON.parse(JSON.stringify(memoryStore.memory)) as TrainingMemory
    const item = memory.injuryItems.find((entry) => entry.id === proposal.injuryItemId)
    if (!item) return
    const nextPainLevel = proposal.suggestedPainLevel === undefined ? item.severity : normalizePainLevel(proposal.suggestedPainLevel)
    const areaPainLevels = item.normalizedAreas.map((area) => ({ ...area, painLevel: nextPainLevel }))
    const checkIn: TrainingInjuryCheckIn = {
      id: crypto.randomUUID(),
      checkedAt: now,
      painLevel: nextPainLevel,
      areaPainLevels,
      worsenedDuringOrAfterRun: null,
      dailyActivityPain: null,
      readyForQualitySession: proposal.proposalType === 'resolve_candidate' ? true : null,
      note: proposal.rationale,
      source: 'coach_suggestion'
    }

    item.normalizedAreas = areaPainLevels
    item.severity = nextPainLevel
    item.lastCheckedAt = now
    item.checkInHistory = [checkIn, ...(item.checkInHistory ?? [])].slice(0, 30)
    if (proposal.suggestedStatus) item.status = proposal.suggestedStatus
    if (proposal.proposalType === 'resolve_candidate' || proposal.suggestedStatus === 'resolved') {
      item.status = 'resolved'
      item.resolvedAt = now
      if (memory.activeInjuryItemId === item.id) {
        memory.activeInjuryItemId = memory.injuryItems.find((entry) => entry.id !== item.id && (entry.status === 'active' || entry.status === 'monitoring'))?.id ?? null
      }
    }
    item.updatedAt = now

    await memoryStore.update(memory)
    dismissInjuryProposal(report)
  } catch (err) {
    coachError.value = err instanceof Error ? err.message : '부상 상태 제안을 저장하지 못했습니다.'
  } finally {
    savingInjuryProposalId.value = ''
  }
}

function normalizePainLevel(value: number | null | undefined) {
  if (value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.min(5, Math.max(0, Math.round(numberValue))) : null
}

async function saveGoalProposal(proposal: GoalIntentProposal) {
  const now = new Date().toISOString()
  const memory = JSON.parse(JSON.stringify(memoryStore.memory)) as TrainingMemory
  const activeGoalTitle = memory.goals.find((goal) => goal.id === memory.activeGoalId)?.title ?? memory.goal

  if (proposal.duplicateGoalId) {
    memory.goals = memory.goals.map((goal) => goal.id === proposal.duplicateGoalId
      ? {
          ...goal,
          successCriteria: proposal.successCriteria || goal.successCriteria,
          strategyNotes: proposal.strategyNotes || goal.strategyNotes,
          notes: mergeGoalNotes(goal.notes, proposal.notes),
          updatedAt: now
        }
      : goal)
  } else {
    const goal: TrainingGoal = {
      id: `goal-${crypto.randomUUID()}`,
      title: proposal.title,
      category: 'fitness',
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: null,
      distanceKm: null,
      targetDurationSec: null,
      priority: memory.goals.length + 1,
      status: 'active',
      successCriteria: proposal.successCriteria,
      strategyNotes: proposal.strategyNotes,
      notes: proposal.notes,
      createdAt: now,
      updatedAt: now
    }
    memory.goals.push(goal)
  }

  const note = `보조 목표 감지: ${proposal.title} (${activeGoalTitle} 보조). 코칭 시 Easy/회복 세션의 심박 안정성과 페이스 여유를 함께 본다.`
  if (!memory.aiNotes.some((item) => item.includes(proposal.title))) {
    memory.aiNotes = [note, ...memory.aiNotes].slice(0, 30)
  }
  await memoryStore.update(memory)
}

function mergeGoalNotes(current: string, next: string) {
  if (!current) return next
  if (current.includes(next)) return current
  return `${current}\n${next}`
}

function stopCoachStream() {
  coachAbortController.value?.abort()
  coachAbortController.value = null
  coachLoading.value = false
  resetCoachReveal()
  stopCoachThinkingTimer()
  if (streamingCoachText.value) {
    streamingCoachMeta.value = '생성 중단됨 · 저장되지 않음'
  } else if (streamingCoachMeta.value) {
    streamingCoachText.value = `${coachThinkingSeconds.value}초까지 생각하다가 멈췄습니다.`
    streamingCoachMeta.value = '생성 중단됨 · 저장되지 않음'
  }
}

function startCoachThinkingTimer() {
  stopCoachThinkingTimer()
  coachThinkingSeconds.value = 1
  coachThinkingTimer.value = window.setInterval(() => {
    coachThinkingSeconds.value += 1
  }, 1000)
}

function stopCoachThinkingTimer() {
  if (coachThinkingTimer.value === null) return
  window.clearInterval(coachThinkingTimer.value)
  coachThinkingTimer.value = null
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  return toMonthKey(new Date(year, month - 1 + offset, 1))
}

function buildCalendarCells(monthKey: string, map: Map<string, RunLog[]>): CalendarCell[] {
  const [year, month] = monthKey.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: CalendarCell[] = []
  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push({ key: `blank-${i}`, date: '', day: null, runs: [], markerType: null, hasScheduledRun: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    const runs = map.get(date) ?? []
    const markerRun = getCalendarMarkerRun(runs)
    cells.push({
      key: date,
      date,
      day,
      runs,
      markerType: markerRun?.type ?? null,
      hasScheduledRun: runs.some((run) => isScheduledSession(run.date, run.type, memoryStore.memory.weeklyPattern))
    })
  }
  return cells
}

function getCalendarMarkerRun(runs: RunLog[]) {
  if (!runs.length) return null
  const sortedRuns = [...runs].sort((a, b) => {
    const aScheduled = isScheduledSession(a.date, a.type, memoryStore.memory.weeklyPattern)
    const bScheduled = isScheduledSession(b.date, b.type, memoryStore.memory.weeklyPattern)
    if (aScheduled !== bScheduled) return aScheduled ? -1 : 1
    return b.distanceKm - a.distanceKm
  })
  return sortedRuns[0] ?? null
}

function runTypeClass(type: RunType | null) {
  if (!type) return ''
  return `run-type-${String(type).toLowerCase().replaceAll(' ', '-').replaceAll('+', 'plus')}`
}

function getMetaFilterGroupLabel(group: RunFilterTag['group']) {
  const labels: Record<RunFilterTag['group'], string> = {
    schedule: '루틴',
    period: '시간대',
    weather: '날씨',
    source: '입력 방식',
    data: '데이터',
    course: '코스',
    custom: '태그'
  }
  return labels[group]
}
</script>

<template>
  <PageLayout variant="run-log">
    <SectionCard class="calendar-card">
      <div class="run-log-toolbar">
        <button class="icon-link-button" type="button" aria-label="기록 추가" @click="openAddRun">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
        <BottomSheetSelect
          v-model="selectedTypes"
          label="세션 타입"
          :options="filterOptions"
          compact
          multiple
          all-label="모든 세션 유형"
          placeholder="모든 세션 유형"
          confirm-label="선택 적용"
        />
        <BottomSheetSelect
          v-model="selectedMetaFilterValues"
          label="메타 태그"
          :options="metaFilterOptions"
          compact
          multiple
          all-label="모든 메타 태그"
          placeholder="모든 메타 태그"
          confirm-label="선택 적용"
        />
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
          :class="[
            { 'has-run': cell.runs.length, selected: selectedDate === cell.date, scheduled: cell.hasScheduledRun },
            runTypeClass(cell.markerType)
          ]"
          type="button"
          :disabled="!cell.day || !cell.runs.length"
          @click="toggleDate(cell.date, Boolean(cell.runs.length))"
        >
          <span v-if="cell.day">{{ cell.day }}</span>
          <small v-if="cell.runs.length >= 2">{{ cell.runs.length }}</small>
        </button>
      </div>
      <button v-if="selectedDate" class="ghost full compact-action" type="button" @click="selectedDate = null">
        전체 기록 보기
      </button>
    </SectionCard>

    <Teleport to="body">
      <div v-if="isRunLogRoute && activeStickyMonth && !selectedDate" class="run-month-fixed-heading" aria-hidden="true">
        <h3 class="run-month-heading">{{ activeStickyMonth.title }}</h3>
      </div>
    </Teleport>

    <SectionGroup :title="selectedDate ? formatDateWithWeekday(selectedDate) : '전체 기록'" :surface="false">
      <template #actions>
        <small class="helper">{{ filteredRuns.length }}개</small>
      </template>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <template v-if="visibleRuns.length">
        <RunSessionList
          v-if="selectedDate"
          :runs="visibleRuns"
          :weekly-pattern="memoryStore.memory.weeklyPattern"
          interactive
          @select="openDetail"
        />
        <div v-else class="run-month-groups">
          <section v-for="group in visibleRunGroups" :key="group.key" :ref="(element) => setRunMonthGroupRef(group.key, element)" class="run-month-group">
            <div class="run-month-heading-sticky">
              <h3 class="run-month-heading">{{ group.title }}</h3>
            </div>
            <dl class="run-month-summary" :aria-label="`${group.title} 요약`">
              <div class="run-month-summary-head" aria-hidden="true">
                <span></span>
                <strong>전체</strong>
                <strong>평균</strong>
              </div>
              <div v-for="row in getMonthSummaryRows(group.summary)" :key="row.id" class="run-month-summary-row" :class="row.tone ? `run-month-summary-row-${row.tone}` : undefined">
                <dt>{{ row.label }}</dt>
                <dd>
                  <template v-if="row.total">
                    <span>{{ row.total }}</span><small v-if="row.totalUnit">{{ row.totalUnit }}</small>
                  </template>
                </dd>
                <dd>
                  <template v-if="row.average">
                    <span>{{ row.average }}</span><small v-if="row.averageUnit">{{ row.averageUnit }}</small>
                  </template>
                </dd>
              </div>
            </dl>
            <RunSessionList :runs="group.runs" :weekly-pattern="memoryStore.memory.weeklyPattern" interactive @select="openDetail" />
          </section>
        </div>
      </template>
      <div ref="loadMoreRef" class="load-more-sentinel">
        <button v-if="hasMoreRuns" class="secondary full" type="button" @click="showMore">다음 10개 보기</button>
      </div>
      <EmptyState v-if="!visibleRuns.length && !runStore.loading" title="기록이 없습니다." description="Upload에서 HealthKit 또는 FIT 기록을 저장하세요." />
      <p v-if="error" class="error">{{ error }}</p>
    </SectionGroup>

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
          <RunDetailContent :run="detailRun" :weekly-pattern="memoryStore.memory.weeklyPattern">
            <template #actions>
                <div class="run-detail-actions" aria-label="세션 관리">
                  <button
                    v-if="canRefreshFromHealthKit(detailRun)"
                    class="icon-only-button"
                    :class="{ spinning: healthKitSyncStore.refreshingRunId === detailRun.id }"
                    type="button"
                    :disabled="healthKitSyncStore.refreshingRunId === detailRun.id"
                    aria-label="HealthKit 세션 다시 갱신"
                    @click.stop="healthKitSyncStore.requestRunRefresh(detailRun)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 11a8 8 0 0 0-14.8-4.2" />
                      <path d="M5 3v4h4" />
                      <path d="M4 13a8 8 0 0 0 14.8 4.2" />
                      <path d="M19 21v-4h-4" />
                    </svg>
                  </button>
                  <button class="icon-only-button" type="button" aria-label="기록 수정" @click.stop="startEdit(detailRun)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
                      <path d="m13.6 6.2 4.2 4.2" />
                    </svg>
                  </button>
                  <button class="icon-only-button danger" type="button" :disabled="deletingId === detailRun.id" aria-label="기록 삭제" @click.stop="askRemove(detailRun)">
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
          </RunDetailContent>
          <footer class="stack-action-bar run-detail-cta">
            <button type="button" :disabled="!isSupabaseConfigured" @click.stop="openCoach(detailRun)">
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
        <div v-if="coachRun" class="memory-stack-layer stack-layer-top" data-no-swipe @pointerdown.capture="dismissCoachKeyboardOnOutsideTap">
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
          <main ref="coachScrollContainer" class="memory-stack-content coach-stack-content" @scroll="onCoachScroll">
            <CoachMessage role="user" :text="`${formatDateWithWeekday(coachRun.date)} ${coachRun.sessionTitle || coachRun.type}`" />
            <div v-if="coachHistoryLoading" class="coach-history-skeleton" aria-label="기존 AI 코칭 대화 불러오는 중">
              <div class="coach-skeleton-user" aria-hidden="true">
                <span class="skeleton-line skeleton-line-hint" />
              </div>
              <div class="coach-skeleton-coach" aria-hidden="true">
                <span class="skeleton-line skeleton-line-title" />
                <span class="skeleton-line skeleton-line-text" />
                <span class="skeleton-line skeleton-line-text short" />
                <span class="skeleton-line skeleton-line-text" />
              </div>
            </div>
            <template v-else>
              <template v-if="selectedReports.length">
                <div v-for="report in selectedReports" :key="report.id" class="coach-turn">
                  <CoachMessage v-if="report.userNote" role="user" :text="report.userNote" :meta="formatDateTimeWithWeekday(report.createdAt)" />
                  <CoachMessage role="coach" :text="report.report" :meta="formatDateTimeWithWeekday(report.updatedAt || report.createdAt)" />
                  <article v-if="report.injuryUpdateProposal && shouldShowInjuryProposal(report)" class="coach-injury-proposal-card">
                    <span class="context-chip">사용자 승인 필요</span>
                    <strong>{{ getInjuryProposalTitle(report.injuryUpdateProposal) }}</strong>
                    <small>{{ getInjuryProposalSummary(report.injuryUpdateProposal) }}</small>
                    <p>{{ report.injuryUpdateProposal.userApprovalPrompt || report.injuryUpdateProposal.rationale }}</p>
                    <small v-if="report.injuryUpdateProposal.rationale">{{ report.injuryUpdateProposal.rationale }}</small>
                    <ul v-if="getInjuryProposalSafetyNotes(report.injuryUpdateProposal).length">
                      <li v-for="note in getInjuryProposalSafetyNotes(report.injuryUpdateProposal)" :key="note">{{ note }}</li>
                    </ul>
                    <div class="coach-injury-proposal-actions">
                      <button type="button" :disabled="Boolean(savingInjuryProposalId)" @click="approveInjuryProposal(report)">
                        {{ savingInjuryProposalId === getInjuryProposalKey(report) ? '저장 중' : '승인하고 저장' }}
                      </button>
                      <button class="ghost" type="button" :disabled="Boolean(savingInjuryProposalId)" @click="dismissInjuryProposal(report)">무시</button>
                    </div>
                  </article>
                </div>
              </template>
              <CoachMessage v-if="visibleStreamingCoachText" role="coach" :text="visibleStreamingCoachText" :meta="streamingCoachMeta" :streaming="coachLoading" :thinking="coachLoading && !streamingCoachText" />
              <EmptyState v-else-if="!selectedReports.length" title="아직 이 세션의 코칭이 없습니다." description="짧은 메모를 넣고 AI 코칭을 요청하세요." />
            </template>
            <p v-if="coachError" class="error">{{ coachError }}</p>
          </main>
          <button v-if="showCoachScrollButton" class="coach-scroll-bottom-button" type="button" aria-label="대화 맨 아래로 이동" @click="scrollCoachToBottom('smooth')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>
          </button>
          <footer class="stack-action-bar coach-input-bar">
            <div v-if="showCoachCommands" class="coach-command-menu">
              <button
                v-for="item in filteredCoachCommands"
                :key="item.id"
                class="coach-command-item"
                type="button"
                @pointerdown.prevent
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
                @focus="openCoachCommands"
                @blur="closeCoachCommands"
                @input="resizeCoachNoteInput"
              />
              <button v-if="coachNote" class="input-clear-button" type="button" aria-label="입력 지우기" @click="clearCoachNote">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </div>
            <button class="chat-send-button" type="button" :disabled="!coachLoading && !isSupabaseConfigured" :aria-label="coachLoading ? 'AI 코칭 생성 중단' : selectedReports.length ? '추가 대화 보내기' : 'AI 코칭 요청 보내기'" @click="requestCoach">
              <svg v-if="coachLoading" viewBox="0 0 24 24" aria-hidden="true" class="stop-icon"><rect x="8" y="8" width="8" height="8" rx="1.5" /></svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
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
        <section class="bottom-sheet confirm-sheet" :class="{ 'bottom-sheet-dragging': deleteSheetDrag.dragging.value }" :style="deleteSheetDrag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="삭제 확인">
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="deleteSheetDrag.startDrag" />
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
      <div v-if="pendingGoalProposal" class="bottom-sheet-layer confirm-layer" role="presentation" @click.self="closeGoalProposal">
        <section class="bottom-sheet confirm-sheet goal-intent-sheet" :class="{ 'bottom-sheet-dragging': goalSheetDrag.dragging.value }" :style="goalSheetDrag.sheetStyle.value" role="dialog" aria-modal="true" aria-label="목표 후보 등록 확인">
          <div class="bottom-sheet-handle bottom-sheet-drag-zone" @pointerdown="goalSheetDrag.startDrag" />
          <h2>목표로 저장할까요?</h2>
          <p>입력한 문장이 앞으로도 코칭 기준으로 쓸 목표처럼 보입니다. 저장하면 다음 코칭부터 이 기준도 함께 봅니다.</p>
          <div class="goal-intent-card">
            <small>감지된 목표</small>
            <strong>{{ pendingGoalProposal.title }}</strong>
            <span>{{ pendingGoalProposal.successCriteria }}</span>
          </div>
          <div class="confirm-actions">
            <button type="button" :disabled="savingGoalProposal" @click="confirmGoalProposal">
              {{ savingGoalProposal ? '저장 중' : pendingGoalProposal.duplicateGoalId ? '목표 갱신하고 코칭' : '목표 저장하고 코칭' }}
            </button>
            <button class="ghost" type="button" :disabled="savingGoalProposal" @click="skipGoalProposal">이번만 코칭</button>
          </div>
        </section>
      </div>
      <SchedulingHelpSheet :open="schedulingHelpOpen" @close="schedulingHelpOpen = false" />
    </Teleport>
  </PageLayout>
</template>

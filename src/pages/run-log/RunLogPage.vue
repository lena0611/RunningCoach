<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useCoachStore } from '@/app/stores/coachStore'
import { useToastStore } from '@/app/stores/toastStore'
import { runTypes, type RunLog, type RunType } from '@/entities/run/model'
import UploadRunPage from '@/pages/upload-run/UploadRunPage.vue'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { formatDateWithWeekday, formatDuration, formatInteger, formatNumberWithCommas, formatPace } from '@/shared/lib/format'
import { getRunFilterTags, hasRunFilterTag, isScheduledSession, type RunFilterTag } from '@/shared/lib/runMetaChips'
import { buildVisibleRunGroups, groupRunsByMonth, type RunMonthGroup, type RunMonthSummary } from '@/pages/run-log/runLogSummary'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunForm from '@/shared/ui/RunForm.vue'
import RunDetailContent from '@/shared/ui/RunDetailContent.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionCard from '@/shared/ui/SectionCard.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StackPage from '@/shared/ui/StackPage.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const scheduleStore = useTrainingScheduleStore()
const healthKitSyncStore = useHealthKitSyncStore()
const coachStore = useCoachStore()
const toastStore = useToastStore()
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
const saving = ref(false)
const deletingId = ref<string | null>(null)
const pendingDeleteRun = ref<RunLog | null>(null)
const error = ref('')
const calendarMonth = ref(toMonthKey(new Date()))
const deleteSheetDrag = useBottomSheetDrag(() => {
  pendingDeleteRun.value = null
})

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
const openStack = computed(() => Boolean(detailRun.value || addingRun.value || editing.value))
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
  // 달력 "예정 세션 수행" 링이 날짜축 스케줄의 done 세션을 읽으므로 로드 보장(Supabase 미설정/오프라인이면 no-op).
  if (!scheduleStore.loaded && !scheduleStore.loading) {
    void scheduleStore.load()
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

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
  observer.value?.disconnect()
  cleanupRunMonthStickyOffset()
  cleanupRunMonthStickyState()
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
}

function openRouteRunIfNeeded() {
  const runId = typeof route.query.runId === 'string' ? route.query.runId : ''
  const shouldOpenCoach = route.query.coach === '1'
  const action = typeof route.query.action === 'string' ? route.query.action : ''
  if (!runId) return
  const run = runStore.runs.find((item) => item.id === runId)
  if (!run) return
  if (detailRun.value?.id !== runId) openDetail(run)
  if (shouldOpenCoach && coachStore.activeRun?.id !== runId) {
    coachStore.open(run)
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
    // 삭제한 세션을 보던 패널을 모두 닫는다(상세/편집/코치). 어차피 기록 탭 목록으로 퇴장하므로 무조건 닫아 잔류를 막는다.
    detailRun.value = null
    editing.value = null
    if (coachStore.activeRun?.id === run.id) coachStore.close()
    pendingDeleteRun.value = null
    // 세션 상세를 이끌었던 기록 탭(목록)으로 자연 복귀하고 딥링크(?runId) 쿼리만 정리한다.
    toastStore.success('삭제되었습니다.')
    await router.replace({ path: '/runs' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '삭제 실패'
    toastStore.error(error.value)
  } finally {
    deletingId.value = null
  }
}

function canRefreshFromHealthKit(_run: RunLog) {
  return hasNativeBridge()
}

function clearCoachRouteQuery(runId = typeof route.query.runId === 'string' ? route.query.runId : '') {
  if (route.path !== '/runs' || route.query.coach !== '1') return
  void router.replace({
    path: '/runs',
    query: runId ? { runId } : {}
  })
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  return toMonthKey(new Date(year, month - 1 + offset, 1))
}

// 달력 "예정 세션 수행" 링: 새 날짜축 스케줄에서 그 런에 연결된 done 세션이 있으면 ON(요일·source 무관 —
// 이동/요일 변경 세션도 잡힘). 스토어가 비었거나(오프라인/미로딩) 아직 매칭 전이면 옛 weeklyPattern 매칭으로 폴백.
const scheduledRunIdSet = computed(
  () => new Set(scheduleStore.sessions.filter((s) => s.status === 'done' && s.runId).map((s) => s.runId as string))
)
function runIsScheduled(run: RunLog): boolean {
  return scheduledRunIdSet.value.has(run.id) || isScheduledSession(run.date, run.type, memoryStore.memory.weeklyPattern)
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
      hasScheduledRun: runs.some(runIsScheduled)
    })
  }
  return cells
}

function getCalendarMarkerRun(runs: RunLog[]) {
  if (!runs.length) return null
  const sortedRuns = [...runs].sort((a, b) => {
    const aScheduled = runIsScheduled(a)
    const bScheduled = runIsScheduled(b)
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

    <StackPage :open="!!detailRun" title="세션 상세" bare footer-class="run-detail-cta" @close="closeDetail">
      <RunDetailContent v-if="detailRun" :run="detailRun" :weekly-pattern="memoryStore.memory.weeklyPattern">
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
      <template #footer>
        <button v-if="detailRun" type="button" :disabled="!isSupabaseConfigured" @click.stop="detailRun && coachStore.open(detailRun)">
          AI 코칭
        </button>
      </template>
    </StackPage>

    <StackPage :open="addingRun" title="기록 추가" layer-class="stack-layer-top" @close="closeAddRun(false)">
      <UploadRunPage stack-mode @saved="closeAddRun(true)" />
    </StackPage>

    <StackPage :open="!!editing" title="기록 수정" :back="Boolean(detailRun)" layer-class="stack-layer-top" @close="closeEdit">
      <template v-if="editing">
        <RunForm v-model="editing" />
        <button class="danger full" type="button" @click="askRemove(editing)">이 기록 삭제</button>
      </template>
      <template #footer>
        <button type="button" :disabled="saving || !isEditDirty" @click="saveEdit">{{ saving ? '저장 중' : isEditDirty ? '변경사항 저장' : '저장됨' }}</button>
      </template>
    </StackPage>

    <Teleport to="body">
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
    </Teleport>
  </PageLayout>
</template>

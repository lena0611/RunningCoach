<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { getActiveGoal, getActiveInjuryItem } from '@/entities/training-memory/model'
import type { RunLog } from '@/entities/run/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import WeatherCard from '@/widgets/weather-card/WeatherCard.vue'
import { getAgeLoadWeight, getEasyRatio, getFatigueWarning, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getThisWeekRuns, getTrainingDayView, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration } from '@/shared/lib/format'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import { resolveRunnerProgress } from '@/shared/lib/level/levelModel'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { formatWeatherNumber, weatherSymbolToEmoji } from '@/shared/lib/weather'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunDetailContent from '@/shared/ui/RunDetailContent.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StatCard from '@/shared/ui/StatCard.vue'
import LevelCard from './LevelCard.vue'
import TrainingPhaseCard from './TrainingPhaseCard.vue'
import PhaseTransitionModal from './PhaseTransitionModal.vue'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { appendPhaseTransition } from '@/shared/api/adaptiveTrainingRepository'
import type { TrainingPhaseName } from '@/entities/training-memory/model'
import PreRunIntentCard from './PreRunIntentCard.vue'
import QuestPanel from './QuestPanel.vue'
import WeekTrainingCarousel, { type CarouselDay } from './WeekTrainingCarousel.vue'
import SessionBriefingCard from './SessionBriefingCard.vue'
import SessionDebriefCard from './SessionDebriefCard.vue'
import { buildRestGuidance } from '@/shared/lib/coaching/restGuidance'
import { computeIntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import { evaluateSteadyLong, STEADY_LONG_GRADE_LABEL, evaluateLsd, LSD_KIND_LABEL } from '@/shared/lib/coaching/sessionQuality'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useToastStore } from '@/app/stores/toastStore'
import { buildSessionIntentDraft, easierAlternative, type BuildSessionIntentArgs } from '@/features/build-session-intent/buildSessionIntentDraft'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { buildPeriodizedSchedule, buildWeekSummary } from '@/shared/lib/coaching/periodizedSchedule'
import { buildRealignedSchedule } from '@/shared/lib/coaching/scheduleRealign'
import { proposeAlternativeSession } from '@/shared/lib/coaching/alternativeSession'
import { buildSessionBriefing, sessionTypeLabel, type SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import { resolvePaceModel } from '@/shared/lib/vdotPaces'
import { getChronicLoadTrend } from '@/shared/lib/runStats'
import { isActiveSession, type ScheduledSession } from '@/entities/training-schedule/model'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import RacePage from '@/pages/race/RacePage.vue'
import { hasNativeBridge } from '@/shared/lib/runtime'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const healthKitSyncStore = useHealthKitSyncStore()
const weatherStore = useWeatherStore()
const levelStore = useLevelStore()
const router = useRouter()
const route = useRoute()
const trendMetric = ref<'month' | 'last7' | 'easy' | 'hard' | null>(null)
const detailRun = ref<RunLog | null>(null)
const projectionDetailOpen = ref(false)
const nextSessionDetailOpen = ref(false)
const raceOpen = ref(false)
const today = ref(new Date())
const todayDate = computed(() => formatDateOnly(today.value))

onMounted(() => {
  refreshDashboardContext()
  window.addEventListener('focus', refreshDashboardContext)
  window.addEventListener('pageshow', refreshDashboardContext)
  document.addEventListener('visibilitychange', refreshDashboardContextWhenVisible)
})

const runs = computed(() => runStore.sortedRuns)
// 마지막 레이싱(self-race 태그) 기록 — 레이싱 카드 표시용. 없으면 null(독려 문구).
const lastRace = computed(() => runs.value.find((run) => run.tags?.includes('self-race')) ?? null)
const runDataLoading = computed(() => runStore.loading || (!runStore.loaded && !runStore.error))
const memoryDataLoading = computed(() => memoryStore.loading)
const monthDistance = computed(() => sumDistance(getThisMonthRuns(runs.value, today.value)))
const last7 = computed(() => sumDistance(getRunsWithinDays(runs.value, 7, today.value)))
const easyRatio = computed(() => getEasyRatio(getRunsWithinDays(runs.value, 30, today.value)))
const nextSession = computed(() => getNextSessionRecommendation(memoryStore.memory, runs.value, today.value))
const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
const ageLoadWeight = computed(() => getAgeLoadWeight(memoryStore.memory.athleteProfile.birthYear, today.value))
const observedMaxHr = computed(() => deriveObservedMaxHr(runs.value.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })), today.value))
const heartRateModel = computed(() => deriveHeartRateModel(memoryStore.memory.athleteProfile, today.value.getFullYear(), observedMaxHr.value))
const raceProjection = computed(() =>
  getRaceProjection(runs.value, activeGoal.value, today.value, activeInjury.value, ageLoadWeight.value, {
    easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
    tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm
  })
)
const runnerProgress = computed(() =>
  resolveRunnerProgress(memoryStore.memory.athleteProfile, runs.value, today.value, {
    maxDistanceM: levelStore.selfReportedMaxDistanceM
  })
)
const weeklyRunCount = computed(() => getThisWeekRuns(runs.value, today.value).length)
const weeklyRunTarget = computed(() => memoryStore.memory.athleteProfile.weeklyRunDaysTarget ?? 0)

// === 목표 기반 주기화 스케줄 + 주간 캐러셀 (에픽 #362) ===
const scheduleStore = useTrainingScheduleStore()
const chronicLoad = computed(() => getChronicLoadTrend(runs.value, today.value, ageLoadWeight.value))

function dateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

/** 목표에 targetDate+거리가 있으면 골격 생성, 없으면 재정렬 점검(best-effort, no-op 안전). */
let ensureInFlight: Promise<void> | null = null
function ensureSchedule(): Promise<void> {
  // in-flight 가드(B1): watch 가 여러 번 fire 해도 골격을 이중 생성하지 않는다.
  if (ensureInFlight) return ensureInFlight
  ensureInFlight = doEnsureSchedule().finally(() => {
    ensureInFlight = null
  })
  return ensureInFlight
}
async function doEnsureSchedule() {
  if (!isSupabaseConfigured) return
  const goal = activeGoal.value
  if (!goal?.targetDate || !goal.distanceKm) return
  try {
    if (!scheduleStore.loaded) await scheduleStore.load(goal.id)
    const mine = scheduleStore.sessions.filter((s) => s.goalId === goal.id)
    const hasActive = mine.some(isActiveSession)
    if (!hasActive) {
      const drafts = buildPeriodizedSchedule({ goal, profile: memoryStore.memory.athleteProfile, today: today.value })
      if (drafts.length) await scheduleStore.insertMany(drafts)
      return
    }
    const plan = buildRealignedSchedule(mine, goal, memoryStore.memory.athleteProfile, today.value)
    if (plan.drafts.length) {
      await scheduleStore.realign(goal.id, plan.fromDate, plan.drafts)
      if (plan.deviation.reason) toastStore.success(plan.deviation.reason)
    }
  } catch {
    // best-effort: 스케줄 생성 실패가 대시보드를 막지 않는다.
  }
}

const CAROUSEL_DAYS_BEFORE = 2 // 오늘 이전 표시 일수 → 오늘의 인덱스
const CAROUSEL_DAYS_AFTER = 4
const scheduleDays = computed<CarouselDay[]>(() => {
  const out: CarouselDay[] = []
  for (let offset = -CAROUSEL_DAYS_BEFORE; offset <= CAROUSEL_DAYS_AFTER; offset++) {
    const d = new Date(today.value)
    d.setDate(d.getDate() + offset)
    const date = dateOnly(d)
    const session = scheduleStore.sessionOnDate(date)
    const run = runs.value.find((r) => r.date === date) ?? null
    const isToday = offset === 0
    const state: CarouselDay['state'] = run
      ? 'done'
      : offset < 0
        ? 'past'
        : session
          ? isToday
            ? 'today'
            : 'future'
          : 'rest'
    const chip = run ? sessionTypeLabel(run.type) : session ? sessionTypeLabel(session.sessionType) : '휴식'
    out.push({ date, label: `${WEEKDAY_KO[d.getDay()]} ${d.getDate()}`, state, chip })
  }
  return out
})
const hasSchedule = computed(() => scheduleDays.value.some((d) => d.state !== 'rest' && d.state !== 'past'))
// 위크 요약(이번 주 단계·포커스·핵심·볼륨·D-day) — "이번 주가 통째로 뭘 위한 주인지"
const weekSummary = computed(() => buildWeekSummary(scheduleStore.sessions, today.value, activeGoal.value?.targetDate ?? null))
const activeDayIndex = ref(CAROUSEL_DAYS_BEFORE) // 기본 = 오늘(offset 0)
const activeDay = computed(() => scheduleDays.value[activeDayIndex.value] ?? null)
const activeSession = computed<ScheduledSession | null>(() =>
  activeDay.value ? scheduleStore.sessionOnDate(activeDay.value.date) : null
)
const activeDoneRun = computed(() =>
  activeDay.value ? runs.value.find((r) => r.date === activeDay.value!.date) ?? null : null
)
const activeBriefing = computed<SessionBriefing | null>(() => {
  const session = activeSession.value
  if (!session || activeDoneRun.value) return null
  // 오늘 세션이면 SessionIntent(의도·성공기준·타겟)를 흡수해 단일 카드로(중복 의도 카드 제거).
  const intent =
    activeDay.value?.state === 'today' && activePlannedIntent.value
      ? {
          why: activePlannedIntent.value.why,
          successCriteria: activePlannedIntent.value.successCriteria,
          targets: activePlannedIntent.value.targets
        }
      : null
  return buildSessionBriefing(session, {
    goal: activeGoal.value,
    injury: activeInjury.value,
    chronic: chronicLoad.value,
    vdot: resolvePaceModel(memoryStore.memory.athleteProfile).vdot,
    adaptiveProfile: memoryStore.memory.adaptiveTrainingProfile,
    progression: adaptiveProgress.value.criteria,
    intent
  })
})
const briefingCeilingText = computed(() =>
  heartRateModel.value.easyCeilingBpm ? `심박 상한 ${heartRateModel.value.easyCeilingBpm}` : null
)

// 디브리핑(완료 슬라이드, #378): 요약 + 의도 달성률(#310) + 세션 등급(#354) + 다음
const activeDoneSummary = computed(() => {
  const run = activeDoneRun.value
  if (!run) return ''
  const distance = Number.isFinite(run.distanceKm) ? `${Math.round(run.distanceKm * 10) / 10}km` : ''
  const dur = run.durationSec ? formatDuration(run.durationSec) : ''
  return [run.type, distance, dur].filter(Boolean).join(' · ')
})
const activeDoneIntent = computed(() =>
  activeDoneRun.value ? sessionIntentStore.intents.find((i) => i.runId === activeDoneRun.value!.id) ?? null : null
)
const activeFulfillment = computed(() => {
  const run = activeDoneRun.value
  const intent = activeDoneIntent.value
  return run && intent ? computeIntentFulfillment(intent, run) : null
})
const activeGradeLine = computed<string | null>(() => {
  const run = activeDoneRun.value
  if (!run) return null
  if (run.type === 'Steady Long') {
    const e = evaluateSteadyLong(run)
    return `${STEADY_LONG_GRADE_LABEL[e.grade]}${e.reasons[0] ? ` · ${e.reasons[0]}` : ''}`
  }
  if (run.type === 'LSD') {
    const e = evaluateLsd(run, { easyCeilingBpm: heartRateModel.value.easyCeilingBpm, recoveryCeilingBpm: heartRateModel.value.recoveryCeilingBpm })
    return `${LSD_KIND_LABEL[e.kind]}${e.reasons[0] ? ` · ${e.reasons[0]}` : ''}`
  }
  return null
})
const debriefNextLine = computed(() => {
  const next = dayView.value.next
  return next ? `${formatDateWithWeekday(next.date)} · ${next.title}` : null
})

// 전략적 휴식(#378): 휴식날도 회복·부상관리·근력 보강 안내
const restGuidance = computed(() => buildRestGuidance(activeInjury.value, chronicLoad.value))

function onBriefingAck() {
  toastStore.success('좋아요, 오늘은 이 훈련에 집중해요.')
}
async function onBriefingAlternative(direction: 'easier' | 'harder') {
  const session = activeSession.value
  if (!session || intentBusy.value) return
  intentBusy.value = true
  try {
    const { draft, warning, atBoundary } = proposeAlternativeSession(
      session,
      activeGoal.value,
      memoryStore.memory.athleteProfile,
      direction
    )
    if (atBoundary) {
      toastStore.success(direction === 'easier' ? '이미 가장 가벼운 세션이에요.' : '이미 가장 강한 세션이에요.')
      return
    }
    await scheduleStore.setStatus(session.id, 'superseded')
    await scheduleStore.insertMany([draft])
    if (warning) toastStore.success(warning)
  } catch {
    toastStore.error('작전을 바꾸지 못했어요.')
  } finally {
    intentBusy.value = false
  }
}

// Pre-Run 의도(#309): 결정론 신호를 조합해 오늘 의도를 만들고 하루 1건 영속한다.
const sessionIntentStore = useSessionIntentStore()
const toastStore = useToastStore()
const intentBusy = ref(false)
const activePlannedIntent = computed(() => sessionIntentStore.activePlannedIntent)
const weakestFactorLabel = computed(() => {
  const factors = raceProjection.value?.factors ?? []
  if (!factors.length) return null
  return [...factors].sort((a, b) => a.score - b.score)[0]?.label ?? null
})
function intentArgs(overrideType?: BuildSessionIntentArgs['overrideType']): BuildSessionIntentArgs {
  return {
    recommendation: nextSession.value,
    heartRateModel: {
      easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
      tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm,
      recoveryCeilingBpm: heartRateModel.value.recoveryCeilingBpm
    },
    weakestFactorLabel: weakestFactorLabel.value,
    activeGoalId: activeGoal.value?.id ?? null,
    overrideType
  }
}
async function ensureTodayIntent() {
  if (!isSupabaseConfigured || !runStore.loaded || !memoryStore.loaded) return
  try {
    await sessionIntentStore.ensureIntentFor(buildSessionIntentDraft(intentArgs()))
  } catch {
    // best-effort: 의도 생성 실패가 대시보드를 막지 않는다.
  }
}
function onAcknowledgeIntent() {
  toastStore.success('좋아요, 오늘은 이 훈련에 집중해요.')
}
async function onRequestAlternative() {
  const current = activePlannedIntent.value
  if (!current || intentBusy.value) return
  intentBusy.value = true
  try {
    await sessionIntentStore.setStatus(current.id, 'superseded')
    await sessionIntentStore.plan(buildSessionIntentDraft(intentArgs(easierAlternative(current.sessionType))))
  } catch {
    toastStore.error('다른 훈련을 제안하지 못했어요.')
  } finally {
    intentBusy.value = false
  }
}
watch(
  () => [runStore.loaded, memoryStore.loaded] as const,
  () => {
    void ensureTodayIntent()
    void ensureSchedule()
  },
  { immediate: true }
)

watch(
  () => route.path,
  (path) => {
    if (path === '/') refreshDashboardContext()
  },
  { immediate: true }
)

function refreshDashboardContext() {
  today.value = new Date()
  if (!runStore.loaded && !runStore.loading) {
    void runStore.load()
  }
  if (!memoryStore.loading) {
    void memoryStore.load()
  }
  weatherStore.init()
  void weatherStore.refreshAfterActivation()
}

function refreshDashboardContextWhenVisible() {
  if (document.visibilityState === 'visible') refreshDashboardContext()
}
const raceProjectionHint = computed(() => {
  const projection = raceProjection.value
  if (!projection) return ''
  const parts: string[] = []
  // #312: readinessScore(0~100)를 "달성 가능성 %(준비도 기반)"로 노출(진짜 확률 아님 명시).
  if (projection.readinessLevel) parts.push(`달성 가능성 ${projection.readinessScore}% (준비도 기반) · ${projection.readinessLevel}`)
  // 최근 변화 %: 이전 환산기록 대비. 음수 deltaSec=개선.
  if (projection.deltaSec !== null && projection.previous && projection.previous.projectedSec > 0) {
    const pct = Math.round((projection.deltaSec / projection.previous.projectedSec) * 100)
    if (pct !== 0) parts.push(`최근 ${pct < 0 ? '개선' : '저하'} ${Math.abs(pct)}%`)
  }
  return parts.length ? parts.join(' · ') : `${formatDateWithWeekday(projection.current.date)} 기준`
})
// #312: 부상으로 세션이 하향됐을 때 "목표 포기가 아니라 목표 보호"임을 알린다.
const goalProtectionText = computed(() =>
  nextSession.value.injuryAdjusted && nextSession.value.injuryNote ? `목표 보호: ${nextSession.value.injuryNote}` : ''
)
const hardSessions = computed(() =>
  getRunsWithinDays(runs.value, 7, today.value).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type)).length
)
// #352: 오늘/다음 2섹션 카드 뷰(결정론, AI 호출 없음)
const dayView = computed(() => getTrainingDayView(memoryStore.memory, runs.value, today.value))
const heroWeatherLine = computed(() => {
  const snapshot = weatherStore.snapshot
  if (!snapshot) return ''
  const target = nextSession.value.plannedDate
  const daily = snapshot.daily.find((day) => day.date === target)
  if (target !== todayDate.value && daily) {
    return `${weatherSymbolToEmoji(daily.symbolName)} 최고 ${formatWeatherNumber(daily.maxTemperatureC, '°')} · 강수 ${Math.round((daily.precipitationChance ?? 0) * 100)}%`
  }
  return `${weatherSymbolToEmoji(snapshot.current.symbolName)} 체감 ${formatWeatherNumber(snapshot.current.apparentTemperatureC, '°')}`
})

const goalDdayText = computed(() => {
  const target = activeGoal.value.targetDate
  if (!target) return ''
  const targetMs = new Date(`${target}T00:00:00`).getTime()
  const todayMs = new Date(`${todayDate.value}T00:00:00`).getTime()
  const diffDays = Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return 'D-Day'
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
})
const goalMetaText = computed(() => {
  const goal = activeGoal.value
  const parts: string[] = []
  if (goal.distanceKm) parts.push(`${goal.distanceKm}km`)
  if (goal.targetDurationSec) parts.push(`목표 ${formatDuration(goal.targetDurationSec)}`)
  if (goal.targetDate) parts.push(`${formatDateWithWeekday(goal.targetDate)} ${goalDdayText.value}`)
  return parts.join(' · ')
})
const goalProjectionText = computed(() => {
  const projection = raceProjection.value
  if (!projection) return '목표 예상 산출에 필요한 품질 세션이 아직 부족합니다.'
  return `예상 ${formatDuration(projection.current.projectedSec)} · ${raceProjectionHint.value}`
})

const fatigueWarning = computed(() => getFatigueWarning(runs.value, today.value, ageLoadWeight.value))
const volumeWarning = computed(() => fatigueWarning.value.message)
const volumeCaution = computed(() => fatigueWarning.value.caution)

const trendTitle = computed(() => {
  if (trendMetric.value === 'month') return '이번 달 거리 추이'
  if (trendMetric.value === 'last7') return '최근 7일 거리 추이'
  if (trendMetric.value === 'easy') return '최근 30일 Easy 비율 근거'
  if (trendMetric.value === 'hard') return '최근 7일 강훈련'
  return ''
})

const trendRuns = computed(() => {
  if (trendMetric.value === 'month') return getThisMonthRuns(runs.value, today.value)
  if (trendMetric.value === 'last7') return getRunsWithinDays(runs.value, 7, today.value)
  if (trendMetric.value === 'easy') return getRunsWithinDays(runs.value, 30, today.value)
  if (trendMetric.value === 'hard') return getRunsWithinDays(runs.value, 7, today.value).filter((run) => ['Tempo', 'LSD', 'Steady Long', 'Race'].includes(run.type))
  return []
})

const trendChartPoints = computed<TrendChartPoint[]>(() => {
  return [...trendRuns.value]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((run) => ({
      label: run.date.slice(5).replace('-', '.'),
      value: run.distanceKm,
      detail: run.sessionTitle || run.type
    }))
})

watch(
  () => Boolean(trendMetric.value || detailRun.value || projectionDetailOpen.value || nextSessionDetailOpen.value),
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
  window.removeEventListener('focus', refreshDashboardContext)
  window.removeEventListener('pageshow', refreshDashboardContext)
  document.removeEventListener('visibilitychange', refreshDashboardContextWhenVisible)
})

onBeforeRouteLeave(() => {
  closeTrend()
  closeRunDetail()
  closeProjectionDetail()
  closeNextSessionDetail()
})

function closeTrend() {
  trendMetric.value = null
}

function openRunDetail(run: RunLog) {
  detailRun.value = run
}

function closeRunDetail() {
  detailRun.value = null
}

function openProjectionDetail() {
  projectionDetailOpen.value = true
}

function closeProjectionDetail() {
  projectionDetailOpen.value = false
}

function openNextSessionDetail() {
  nextSessionDetailOpen.value = true
}

function closeNextSessionDetail() {
  nextSessionDetailOpen.value = false
}

function openGoalCard() {
  if (raceProjection.value) {
    openProjectionDetail()
    return
  }
  openMemoryPanel('goals')
}

function openCoachForRun(run: RunLog) {
  router.push({ path: '/runs', query: { runId: run.id, coach: '1' } })
}

function openRunAction(run: RunLog, action: 'edit' | 'delete') {
  router.push({ path: '/runs', query: { runId: run.id, action } })
}

function canRefreshFromHealthKit(_run: RunLog) {
  return hasNativeBridge()
}

function openMemoryPanel(panel: 'goals' | 'injuries') {
  router.push({ path: '/memory', query: { panel } })
}

function formatDateOnly(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-')
}

// #339/#337: 훈련 단계 진행 평가 + 전환 제안
const adaptiveProgress = computed(() => buildCoachAdaptiveProgress(runs.value, memoryStore.memory))
const phaseModalOpen = ref(false)
const phaseSaving = ref(false)

// Base→Build→Threshold→Race Specific→Taper 다음 단계(전환 후 nextPhase 표시용).
const PHASE_NEXT: Record<TrainingPhaseName, TrainingPhaseName | null> = {
  Base: 'Build',
  Build: 'Threshold',
  Threshold: 'Race Specific',
  'Race Specific': 'Taper',
  Taper: 'Recovery',
  Recovery: 'Base'
}

async function applyPhaseTransition() {
  const proposal = adaptiveProgress.value.phaseProposal
  if (!proposal.shouldTransition || !proposal.toPhase || phaseSaving.value) return
  phaseSaving.value = true
  try {
    const toPhase = proposal.toPhase
    const statusMap: Record<string, string> = {}
    for (const criterion of adaptiveProgress.value.criteria) statusMap[criterion.id] = criterion.status

    const memory = JSON.parse(JSON.stringify(memoryStore.memory))
    memory.adaptiveTrainingProfile.trainingPhase.currentPhase = toPhase
    memory.adaptiveTrainingProfile.trainingPhase.startedAt = new Date().toISOString()
    memory.adaptiveTrainingProfile.trainingPhase.nextPhase = PHASE_NEXT[toPhase] ?? null
    await memoryStore.update(memory)
    try {
      await appendPhaseTransition(toPhase, proposal.reason, statusMap)
    } catch {
      /* 이력 저장 실패는 치명적이지 않음 */
    }
    phaseModalOpen.value = false
  } finally {
    phaseSaving.value = false
  }
}
</script>

<template>
  <PageLayout variant="dashboard">
    <!-- 위크 요약(#362): 이번 주가 뭘 위한 주인지 — 단계·포커스·핵심·볼륨·D-day -->
    <div v-if="hasSchedule && weekSummary" class="week-summary-bar">
      <span class="week-summary-phase">{{ weekSummary.phaseLabel }}</span>
      <span class="week-summary-focus">{{ weekSummary.focusLine }}</span>
      <span class="week-summary-meta">핵심 {{ weekSummary.keyCount }} · 약 {{ weekSummary.weekKm }}km<template v-if="weekSummary.dDayText"> · {{ weekSummary.dDayText }}</template></span>
    </div>

    <!-- 목표 기반 주간 캐러셀 (에픽 #362). 스케줄이 있으면 히어로 대신 표시. -->
    <WeekTrainingCarousel v-if="hasSchedule" v-model:active-index="activeDayIndex" :days="scheduleDays">
      <template #default="{ day }">
        <p class="eyebrow carousel-date">{{ formatDateWithWeekday(day.date) }}</p>
        <!-- 갔다와서: 디브리핑 (#372/#378) — 의도 달성률·세션 등급·다음 -->
        <SessionDebriefCard
          v-if="day.state === 'done' && activeDoneRun"
          :run="activeDoneRun"
          :summary="activeDoneSummary"
          :grade-line="activeGradeLine"
          :intent="activeDoneIntent"
          :fulfillment="activeFulfillment"
          :next-line="debriefNextLine"
        />
        <!-- 나가기 전: 작전 브리핑 -->
        <SessionBriefingCard
          v-else-if="activeBriefing && (day.state === 'today' || day.state === 'future')"
          :briefing="activeBriefing"
          :session-type="activeSession ? sessionTypeLabel(activeSession.sessionType) : ''"
          :ceiling-text="briefingCeilingText"
          :busy="intentBusy"
          @acknowledge="onBriefingAck"
          @request-alternative="onBriefingAlternative"
        />
        <!-- 휴식: 전략적 휴식(#378) — 회복·부상관리·근력 -->
        <article v-else class="carousel-card">
          <strong class="carousel-card-title">🌙 전략적 휴식</strong>
          <p class="carousel-card-line">{{ restGuidance.purpose }}</p>
          <ul class="rest-list">
            <li v-for="(item, i) in restGuidance.items" :key="i">{{ item }}</li>
          </ul>
        </article>
      </template>
    </WeekTrainingCarousel>

    <button v-else class="hero-card hero-card-interactive" type="button" @click="openNextSessionDetail">
      <div class="hero-body">
        <section class="day-block">
          <p class="eyebrow">오늘 · {{ formatDateWithWeekday(todayDate) }}</p>
          <template v-if="dayView.today.state === 'pending'">
            <h2>{{ dayView.today.title }}</h2>
            <p v-if="dayView.today.coachLine" class="helper coach-line">{{ dayView.today.coachLine }}</p>
          </template>
          <template v-else-if="dayView.today.state === 'done'">
            <h2>✅ 오늘 완료</h2>
            <p v-if="dayView.today.doneSummary" class="helper">{{ dayView.today.doneSummary }}</p>
          </template>
          <template v-else>
            <h2>🌙 오늘은 휴식</h2>
            <p class="helper">예정 세션이 없어요. 가볍게 풀거나 쉬어가요.</p>
          </template>
        </section>

        <section v-if="dayView.next" class="day-block day-block-next">
          <p class="eyebrow">다음 훈련</p>
          <p class="next-line">{{ formatDateWithWeekday(dayView.next.date) }} · {{ dayView.next.title }}</p>
        </section>

        <p v-if="heroWeatherLine" class="helper hero-weather-line">
          {{ heroWeatherLine }} · {{ formatDateWithWeekday(todayDate) }} 기준
        </p>
      </div>
      <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>

    <SectionGroup title="내 레벨" :surface="false">
      <LevelCard :progress="runnerProgress" :coins="levelStore.coins" hide-eyebrow />
    </SectionGroup>

    <SectionGroup title="훈련 단계" :surface="false">
      <TrainingPhaseCard :summary="adaptiveProgress" @open="phaseModalOpen = true" />
    </SectionGroup>

    <PhaseTransitionModal
      v-if="phaseModalOpen"
      :summary="adaptiveProgress"
      :saving="phaseSaving"
      @confirm="applyPhaseTransition"
      @close="phaseModalOpen = false"
    />

    <!-- 캐러셀 브리핑이 의도·성공기준·타겟을 흡수하므로, 폴백(스케줄 없음) 때만 옛 의도 카드 표시(중복 제거). -->
    <SectionGroup v-if="activePlannedIntent && !hasSchedule" title="훈련 의도" :surface="false">
      <PreRunIntentCard
        :intent="activePlannedIntent"
        :busy="intentBusy"
        @acknowledge="onAcknowledgeIntent"
        @request-alternative="onRequestAlternative"
      />
    </SectionGroup>

    <QuestPanel
      :progress="runnerProgress"
      :next-session="nextSession"
      :weekly-done="weeklyRunCount"
      :weekly-target="weeklyRunTarget"
    />

    <SectionGroup title="레이싱하기" :surface="false">
      <button class="stat-card stat-card-interactive" type="button" @click="raceOpen = true">
        <div class="stat-card-data">
          <template v-if="lastRace">
            <strong class="stat-card-value stat-card-text-value">{{ lastRace.distanceKm.toFixed(2) }}km · {{ formatDuration(lastRace.durationSec ?? 0) }}</strong>
            <small>마지막 레이싱 · {{ formatDateWithWeekday(lastRace.date) }}</small>
          </template>
          <template v-else>
            <strong class="stat-card-value stat-card-text-value">첫 레이싱을 시작해보세요</strong>
            <small>아직 레이싱 기록이 없어요. 고스트와 달리거나 자유 레이싱으로 기록에 도전하세요.</small>
          </template>
        </div>
        <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </SectionGroup>

    <Teleport to="body">
      <Transition name="stack-page-up">
        <div v-if="raceOpen" class="memory-stack-layer" data-no-swipe>
          <RacePage @close="raceOpen = false" />
        </div>
      </Transition>
    </Teleport>

    <SectionGroup v-if="runStore.loading || runStore.error" title="데이터 상태">
      <template #actions>
        <button class="ghost" type="button" :disabled="runStore.loading" @click="runStore.load">
          {{ runStore.loading ? '불러오는 중' : '다시 불러오기' }}
        </button>
      </template>
      <p v-if="runStore.loading" class="helper">Run Log를 불러오고 있습니다.</p>
      <p v-if="runStore.error" class="error">{{ runStore.error }}</p>
    </SectionGroup>

    <SectionGroup title="활성 목표" :surface="false">
      <button class="stat-card stat-card-interactive dashboard-goal-card" type="button" @click="openGoalCard">
        <div v-if="memoryDataLoading || runDataLoading" class="stat-card-data stat-card-skeleton" aria-hidden="true">
          <span class="skeleton-line skeleton-line-value" />
          <span class="skeleton-line skeleton-line-hint" />
        </div>
        <div v-else class="stat-card-data">
          <strong class="stat-card-value stat-card-text-value">{{ activeGoal.title }}</strong>
          <small v-if="goalMetaText">{{ goalMetaText }}</small>
          <small class="dashboard-goal-projection">{{ goalProjectionText }}</small>
          <small v-if="goalProtectionText" class="dashboard-goal-projection">{{ goalProtectionText }}</small>
        </div>
        <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </SectionGroup>

    <SectionGroup title="몸 상태 신호" :surface="false">
      <MetricGrid>
        <StatCard
          class="dashboard-context-card"
          label="부상 기준"
          :value="activeInjury?.title || '관리 항목 없음'"
          :hint="activeInjury ? `${activeInjury.status}${activeInjury.severity ? ` · ${activeInjury.severity}/5` : ''}` : '코칭 제한 없음'"
          value-kind="text"
          :loading="memoryDataLoading"
          interactive
          @click="openMemoryPanel('injuries')"
        />
        <StatCard
          class="dashboard-context-card"
          label="피로 경고"
          :value="volumeCaution ? '주의' : '안정'"
          :hint="volumeWarning"
          value-kind="text"
          :tone="volumeCaution ? 'warning' : undefined"
          :loading="runDataLoading"
          interactive
          @click="trendMetric = 'last7'"
        />
      </MetricGrid>
    </SectionGroup>

    <SectionGroup title="최근 훈련 흐름" :surface="false">
      <MetricGrid>
        <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" :loading="runDataLoading" interactive @click="trendMetric = 'month'" />
        <RunSummaryCard label="최근 7일" :value="`${last7}km`" :loading="runDataLoading" interactive @click="trendMetric = 'last7'" />
        <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" :loading="runDataLoading" interactive @click="trendMetric = 'easy'" />
        <RunSummaryCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" :loading="runDataLoading" interactive @click="trendMetric = 'hard'" />
      </MetricGrid>
    </SectionGroup>

    <RecentRuns :runs="runs.slice(0, 5)" :weekly-pattern="memoryStore.memory.weeklyPattern" @show-all="router.push('/runs')" @select="openRunDetail" />

    <Teleport to="body">
      <Transition name="stack-page">
        <div v-if="nextSessionDetailOpen" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>다음 훈련</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeNextSessionDetail">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <SectionGroup title="추천 세션">
                <div class="recommendation-card">
                  <strong>{{ nextSession.title }}</strong>
                  <span>{{ formatDateWithWeekday(nextSession.plannedDate) }} · {{ nextSession.dayName }}</span>
                </div>
                <div v-if="nextSession.injuryAdjusted" class="next-session-injury-note">
                  <strong>부상 조정</strong>
                  <p>{{ nextSession.injuryNote }}</p>
                </div>
                <div v-if="nextSession.loadCaution" class="next-session-injury-note next-session-load-note">
                  <strong>부하 주의</strong>
                  <p>{{ nextSession.loadNote }}</p>
                </div>
                <p>{{ nextSession.reason }}</p>
                <p class="helper">{{ nextSession.intensity }}</p>
                <WeatherCard
                  :snapshot="weatherStore.snapshot"
                  :loading="weatherStore.loading"
                  :error="weatherStore.error"
                  :target-date="nextSession.plannedDate"
                  :session-title="nextSession.title"
                  @refresh="weatherStore.requestForecast()"
                />
              </SectionGroup>
            </main>
          </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="trendMetric" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>{{ trendTitle }}</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeTrend">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <SectionGroup title="추이">
                <template #actions>
                  <small class="helper">{{ trendRuns.length }}개 세션</small>
                </template>
                <TrendChart v-if="trendChartPoints.length" :points="trendChartPoints" unit="km" />
                <EmptyState v-else title="표시할 기록이 없습니다." description="해당 기간의 러닝 기록이 아직 부족합니다." />
              </SectionGroup>
              <SectionGroup v-if="trendRuns.length" title="세션" :surface="false">
                <RunSessionList :runs="trendRuns" :weekly-pattern="memoryStore.memory.weeklyPattern" interactive @select="openRunDetail" />
              </SectionGroup>
            </main>
          </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="projectionDetailOpen && raceProjection" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>목표 예상</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeProjectionDetail">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </header>
            <main class="memory-stack-content">
              <SectionGroup title="현재 예상">
                <div class="projection-detail-metric">
                  <strong>{{ formatDuration(raceProjection.current.projectedSec) }}</strong>
                  <span>{{ raceProjection.targetDistanceKm }}km 기준</span>
                </div>
                <p class="helper">
                  {{ formatDateWithWeekday(raceProjection.current.date) }} {{ raceProjection.current.type }}
                  {{ raceProjection.current.distanceKm.toFixed(2) }}km 기록을 목표 거리로 환산한 값입니다.
                </p>
              </SectionGroup>
              <SectionGroup title="목표 준비도">
                <div class="projection-score">
                  <strong>{{ raceProjection.readinessScore }}</strong>
                  <span>/100 · {{ raceProjection.readinessLevel }}</span>
                </div>
                <p class="helper">{{ raceProjection.readinessSummary }}</p>
              </SectionGroup>
              <SectionGroup title="판단 근거">
                <div class="projection-factor-list">
                  <article
                    v-for="factor in raceProjection.factors"
                    :key="factor.key"
                    class="projection-factor"
                    :class="`projection-factor-${factor.status}`"
                  >
                    <div>
                      <strong>{{ factor.label }}</strong>
                      <small>{{ factor.summary }}</small>
                    </div>
                    <span>{{ factor.score }}</span>
                    <p>{{ factor.detail }}</p>
                  </article>
                </div>
              </SectionGroup>
              <SectionGroup title="변화">
                <p v-if="raceProjection.deltaSec === null" class="helper">
                  아직 비교할 이전 품질 세션이 부족합니다. Tempo, Race, Steady Long 기록이 쌓이면 변화 방향을 보여줍니다.
                </p>
                <p v-else class="helper">
                  {{ raceProjectionHint }}입니다. 이 값은 루틴 상향/유지 판단의 보조 근거로만 사용합니다.
                </p>
              </SectionGroup>
            </main>
          </section>
        </div>
      </Transition>

      <Transition name="stack-page">
        <div v-if="detailRun" class="memory-stack-layer" data-no-swipe>
          <section class="memory-stack-page">
            <header class="memory-stack-header">
              <div>
                <h2>세션 상세</h2>
              </div>
              <button class="stack-icon-button" type="button" aria-label="닫기" @click="closeRunDetail">
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
                  <button class="icon-only-button" type="button" aria-label="기록 수정" @click.stop="openRunAction(detailRun, 'edit')">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4.5 19.5h4.2L18.8 9.4a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4.5 15.3z" />
                      <path d="m13.6 6.2 4.2 4.2" />
                    </svg>
                  </button>
                  <button class="icon-only-button danger" type="button" aria-label="기록 삭제" @click.stop="openRunAction(detailRun, 'delete')">
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
              <button type="button" @click.stop="openCoachForRun(detailRun)">
                AI 코칭 받기
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </PageLayout>
</template>

<style scoped>
/* #362: 주간 캐러셀 슬라이드(디브리핑/휴식) */
.carousel-date {
  margin-bottom: var(--space-2, 8px);
}
.carousel-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
  box-shadow: var(--shadow-card);
}
.carousel-card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}
.carousel-card-line {
  margin: 0;
  font-size: var(--text-info-size, 14px);
  color: var(--color-text);
}
.week-summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  margin-bottom: var(--space-2, 8px);
  background: var(--color-primary-soft, var(--color-surface-card));
  border-radius: var(--radius-button, 12px);
  font-size: 12px;
  color: var(--color-muted);
}
.week-summary-phase {
  font-weight: 700;
  color: var(--color-primary);
}
.week-summary-focus {
  color: var(--color-text);
}
.week-summary-meta {
  margin-left: auto;
}
.rest-list {
  margin: var(--space-1, 4px) 0 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
  color: var(--color-text);
}

/* #352: 오늘/다음 훈련 2섹션 카드 */
.hero-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.day-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.day-block-next {
  padding-top: 12px;
  border-top: 1px solid rgba(120, 120, 120, 0.2);
}

.coach-line {
  color: var(--color-text);
}

.next-line {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}
</style>

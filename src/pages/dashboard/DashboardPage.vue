<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useSessionDetailStore } from '@/app/stores/sessionDetailStore'
import { getActiveGoal, getActiveInjuryItem, isInjuryProbeEligible } from '@/entities/training-memory/model'
import RunSummaryCard from '@/widgets/run-summary-card/RunSummaryCard.vue'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import WeatherCard from '@/widgets/weather-card/WeatherCard.vue'
import { getAgeLoadWeight, getEasyRatio, getFatigueWarning, getLongestRunKmWithinDays, getNextSessionRecommendation, getRunsWithinDays, getThisMonthRuns, getTrainingDayView, sumDistance, type NextSessionRecommendation } from '@/shared/lib/runStats'
import { returnRampWindowSessions, returnSessionCapKm } from '@/shared/lib/coaching/returnRamp'
import { formatDateWithWeekday, formatDuration, formatInteger } from '@/shared/lib/format'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import {
  compareProjectionToRaceBenchmarks,
  formatRaceBenchmarkPercentilePoint,
  formatRaceBenchmarkPercentileRange,
  formatRaceBenchmarkSegmentLabel,
  getRaceBenchmarkEvidenceLevel,
  getRaceBenchmarkCatalogSummary,
  getRaceBenchmarkDistanceCategory,
  raceBenchmarkDistanceCategories,
  raceBenchmarkDistanceCategoryLabel,
  raceBenchmarkDistributionLabel,
  raceBenchmarkFreshnessLabel,
  splitRaceBenchmarkComparisons,
  type RaceBenchmarkComparison,
  type RaceBenchmarkSegmentComparison,
  type RaceBenchmarkSegmentKey
} from '@/shared/lib/raceBenchmark'
import { resolveRunnerProgress } from '@/shared/lib/level/levelModel'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { formatWeatherNumber, weatherSymbolToEmoji } from '@/shared/lib/weather'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StackPage from '@/shared/ui/StackPage.vue'
import StatCard from '@/shared/ui/StatCard.vue'
import LevelCard from './LevelCard.vue'
import TrainingPhaseCard from './TrainingPhaseCard.vue'
import PhaseTransitionModal from './PhaseTransitionModal.vue'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { appendPhaseTransition } from '@/shared/api/adaptiveTrainingRepository'
import type { ActiveRest, RestReason, TrainingGoal, TrainingMemory, TrainingPhaseName } from '@/entities/training-memory/model'
import PreRunIntentCard from './PreRunIntentCard.vue'
import QuestPanel from './QuestPanel.vue'
import WeekTrainingCarousel, { type CarouselDay } from './WeekTrainingCarousel.vue'
import SessionBriefingCard from './SessionBriefingCard.vue'
import SessionDebriefCard from './SessionDebriefCard.vue'
import RescheduleSheet from './RescheduleSheet.vue'
import WeekendTriageSheet from './WeekendTriageSheet.vue'
import SessionDoublePanel from './SessionDoublePanel.vue'
import DoublesAddSheet from './DoublesAddSheet.vue'
import RestDeclarationSheet from './RestDeclarationSheet.vue'
import { deriveRestState, shouldOfferRecoveryRun } from '@/entities/training-memory/restWindow'
import { buildInjuryCoachSignals } from '@/entities/training-memory/injurySignals'
import { selectNextProbe, type InjuryProbeDef } from '@/entities/training-memory/injuryKnowledge'
import { buildRestGuidance, evaluateExtraRun } from '@/shared/lib/coaching/restGuidance'
import { collectCoachMoments, type CoachMomentOption } from '@/shared/lib/coaching/coachMoments'
import { detectScheduleDeviation } from '@/shared/lib/coaching/scheduleRealign'
import { useInjuryFlowStore } from '@/app/stores/injuryFlowStore'
import CoachMomentCard from './CoachMomentCard.vue'
import { computeIntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import { evaluateSteadyLong, STEADY_LONG_GRADE_LABEL, evaluateLsd, LSD_KIND_LABEL, evaluateEasyRecovery } from '@/shared/lib/coaching/sessionQuality'
import { gradeTempoRun, type TempoGrade } from '@/shared/lib/coaching/tempoAdaptation'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useToastStore } from '@/app/stores/toastStore'
import { buildSessionIntentDraft, easierAlternative, type BuildSessionIntentArgs } from '@/features/build-session-intent/buildSessionIntentDraft'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useGlossaryStore } from '@/app/stores/glossaryStore'
import { assessGoalFeasibility, buildPeriodizedSchedule, buildSteadyWeeklyRhythm, buildWeekSummary, goalArchetype, prescriptionFor, trainingWeekRange, withObservedEasy } from '@/shared/lib/coaching/periodizedSchedule'
import { deriveObservedEasyPace } from '@/shared/lib/coaching/observedEasyPace'
import { buildRealignedSchedule } from '@/shared/lib/coaching/scheduleRealign'
import { proposeAlternativeSession } from '@/shared/lib/coaching/alternativeSession'
import { proposeReschedule, proposeMoveToToday, proposeSwap } from '@/shared/lib/coaching/reschedule'
import { weeklyHardLoadGuard, weekEndTriage } from '@/shared/lib/coaching/weeklyTriage'
import { buildDoubleSuggestion, evaluateDoubleEligibility, buildPmEasyDraft, type DoubleEligibility } from '@/shared/lib/coaching/doubleSession'
import type { CriterionStatus } from '@/shared/lib/coaching/progressionCriteria'
import { buildSessionBriefing, sessionTypeLabel, type SessionBriefing } from '@/shared/lib/coaching/sessionBriefing'
import { resolvePaceModel } from '@/shared/lib/vdotPaces'
import { getChronicLoadTrend } from '@/shared/lib/runStats'
import { isActiveSession, type ScheduledSession } from '@/entities/training-schedule/model'
import { isSelfRaceRun } from '@/entities/competition/model'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import RacePage from '@/pages/race/RacePage.vue'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const weatherStore = useWeatherStore()
const levelStore = useLevelStore()
const sessionDetailStore = useSessionDetailStore()
const router = useRouter()
const route = useRoute()
const trendMetric = ref<'month' | 'last7' | 'easy' | 'hard' | null>(null)
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
// #235/§10: 레이싱(self-race)을 제외한 '훈련용' 런. 부하·추세·예측·세션상태·디브리핑·주간미션 등
// "레이싱은 훈련을 소비하지 않는다" 소비처가 전부 이걸 쓴다(레이싱 카드·TT 승급만 runs.value 유지).
const trainingRuns = computed(() => runs.value.filter((run) => !isSelfRaceRun(run)))
// 마지막 레이싱(self-race 태그) 기록 — 레이싱 카드 표시용. 없으면 null(독려 문구). 의도적으로 runs.value 사용.
const lastRace = computed(() => runs.value.find((run) => isSelfRaceRun(run)) ?? null)
const runDataLoading = computed(() => runStore.loading || (!runStore.loaded && !runStore.error))
const memoryDataLoading = computed(() => memoryStore.loading)
const monthDistance = computed(() => sumDistance(getThisMonthRuns(runs.value, today.value)))
const last7 = computed(() => sumDistance(getRunsWithinDays(runs.value, 7, today.value)))
const easyRatio = computed(() => getEasyRatio(getRunsWithinDays(runs.value, 30, today.value)))
const nextSession = computed(() => getNextSessionRecommendation(memoryStore.memory, runs.value, today.value))
const activeGoal = computed(() => getActiveGoal(memoryStore.memory))
const activeInjury = computed(() => getActiveInjuryItem(memoryStore.memory))
// 부상 감별 한 줄 힌트(§5 Phase E) — 활성 부상의 상위 "가능성" + 첫 조절 레버. redFlag면 의뢰 우선(처방 미표시).
// 진단 아님 — "가능성"으로만. 자세한 why·레버 전체는 부상 상세(메모리 패널)에서.
const injuryCoachSignals = computed(() => buildInjuryCoachSignals(memoryStore.memory, runs.value, today.value))
const injuryHypothesisHint = computed(() => {
  const signals = injuryCoachSignals.value
  if (!signals) return null
  if (signals.redFlag.tripped) {
    return { referral: true, possibility: '', lever: '', text: '통증 신호가 보여요 — 무리하지 말고 전문가 평가를 권해요' }
  }
  const top = signals.hypotheses[0]
  if (!top) return null
  return { referral: false, possibility: top.possibility, lever: top.levers[0] ?? '', text: '' }
})
// §5 Phase C — 부상 감별 grill "1문항" 능동 코치 모먼트. 활성 부상의 미답 프로브를 부상 id 변경 시 1회 스냅샷한다.
// "한 세션 1문항(피로 방지)": 답해도 같은 포커스 동안 다음 문항으로 자동 전진하지 않게 probeAnswers 변화엔 재계산하지 않는다
// (스냅샷이 고정 → 답을 골라도 그 프로브 모먼트가 응답을 계속 보여주고, 다음 프로브는 다음 앱 열림/부상 변경 때).
const injuryProbeSnapshot = ref<InjuryProbeDef | null>(null)
watch(
  () => activeInjury.value?.id ?? null,
  () => {
    const inj = activeInjury.value
    // #3 monitoring 게이트: active=항상, monitoring=재발 시만, resolved/archived=안 띄움(감별은 급성기 도구).
    injuryProbeSnapshot.value =
      inj && isInjuryProbeEligible(inj, today.value)
        ? selectNextProbe(inj.normalizedAreas.map((a) => a.areaId), Object.keys(inj.probeAnswers ?? {}))
        : null
  },
  { immediate: true }
)
const painProbeCtx = computed(() => {
  const probe = injuryProbeSnapshot.value
  const inj = activeInjury.value
  if (!probe || !inj) return null
  return {
    injuryItemId: inj.id,
    probeId: probe.id,
    question: probe.question,
    options: probe.options.map((o) => ({ label: o.label, response: o.response, sentiment: o.sentiment, value: o.value, subtype: o.subtype }))
  }
})
const ageLoadWeight = computed(() => getAgeLoadWeight(memoryStore.memory.athleteProfile.birthYear, today.value))
const observedMaxHr = computed(() => deriveObservedMaxHr(runs.value.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })), today.value))
const heartRateModel = computed(() => deriveHeartRateModel(memoryStore.memory.athleteProfile, today.value.getFullYear(), observedMaxHr.value))
// 관측 Easy 페이스(#405, A안): 실제 Easy 심박 이하에서 뛴 페이스. 있으면 VDOT 추정 대신 이걸로 처방(심박과 충돌 방지).
const observedEasyPace = computed(() =>
  deriveObservedEasyPace(trainingRuns.value, heartRateModel.value.easyCeilingBpm, today.value, heartRateModel.value.recoveryCeilingBpm)
)
// 보정 PaceModel: Easy 계열 페이스를 관측값으로 덮은 모델(브리핑 표시 즉시 보정용).
const calibratedPaceModel = computed(() => withObservedEasy(resolvePaceModel(memoryStore.memory.athleteProfile), observedEasyPace.value))
const EASY_FAMILY_TYPES = new Set(['Easy', 'Easy + Strides', 'Recovery', 'LSD', 'Steady Long'])
const raceProjection = computed(() =>
  getRaceProjection(trainingRuns.value, activeGoal.value, today.value, activeInjury.value, ageLoadWeight.value, {
    easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
    tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm
  })
)
const raceBenchmarkSummary = computed(() =>
  getRaceBenchmarkCatalogSummary(raceProjection.value?.targetDistanceKm ?? activeGoal.value?.distanceKm ?? null)
)
const raceBenchmarkComparisons = computed(() =>
  compareProjectionToRaceBenchmarks(raceProjection.value).sort((a, b) => {
    const statusRank = (status: typeof a.status) => (status === 'ready' ? 0 : status === 'pending-distribution' ? 1 : 2)
    const rankDelta = statusRank(a.status) - statusRank(b.status)
    if (rankDelta !== 0) return rankDelta
    if (a.snapshot.region !== b.snapshot.region) return a.snapshot.region === 'domestic' ? -1 : 1
    return b.snapshot.year - a.snapshot.year
  })
)
const raceBenchmarkGroups = computed(() => splitRaceBenchmarkComparisons(raceBenchmarkComparisons.value))
const raceBenchmarkCurrentDistanceItems = computed(() => raceBenchmarkGroups.value.currentDistance)
const raceBenchmarkReadyCurrentDistanceItems = computed(() =>
  raceBenchmarkCurrentDistanceItems.value.filter((item) => item.status === 'ready')
)
const raceBenchmarkEvidenceLevel = computed(() =>
  getRaceBenchmarkEvidenceLevel(raceBenchmarkReadyCurrentDistanceItems.value.length)
)
const raceBenchmarkPendingCurrentDistanceItems = computed(() =>
  raceBenchmarkCurrentDistanceItems.value.filter((item) => item.status === 'pending-distribution')
)
const raceBenchmarkDisplayedCurrentDistanceItems = computed(() =>
  raceBenchmarkReadyCurrentDistanceItems.value.length
    ? raceBenchmarkReadyCurrentDistanceItems.value
    : raceBenchmarkCurrentDistanceItems.value
)
const raceBenchmarkOtherDistanceItems = computed(() => raceBenchmarkGroups.value.otherDistances)

// 대회 벤치마크 세그먼트(전체/남/여) 선택. 기본은 사용자 성별 세그먼트(있으면), 없으면 전체.
const raceBenchmarkSegmentSelection = ref<Record<string, RaceBenchmarkSegmentKey>>({})
function raceBenchmarkUserSegment(): RaceBenchmarkSegmentKey {
  const sex = memoryStore.memory.athleteProfile?.sex
  return sex === 'male' || sex === 'female' ? sex : 'overall'
}
function raceBenchmarkSelectedSegment(item: RaceBenchmarkComparison): RaceBenchmarkSegmentComparison | null {
  if (!item.segments.length) return null
  const preferred = raceBenchmarkSegmentSelection.value[item.snapshot.id] ?? raceBenchmarkUserSegment()
  return item.segments.find((segment) => segment.segment === preferred) ?? item.segments[0]
}
function isRaceBenchmarkSegmentActive(item: RaceBenchmarkComparison, segment: RaceBenchmarkSegmentKey): boolean {
  return raceBenchmarkSelectedSegment(item)?.segment === segment
}
function setRaceBenchmarkSegment(id: string, segment: RaceBenchmarkSegmentKey) {
  raceBenchmarkSegmentSelection.value = { ...raceBenchmarkSegmentSelection.value, [id]: segment }
}
function raceBenchmarkPointText(item: RaceBenchmarkComparison): string {
  const segment = raceBenchmarkSelectedSegment(item)
  return segment ? formatRaceBenchmarkPercentilePoint(segment.percentile, segment.percentileBound) : ''
}
function raceBenchmarkDetailText(item: RaceBenchmarkComparison): string {
  const segment = raceBenchmarkSelectedSegment(item)
  if (!segment) return ''
  const who = segment.segment === 'overall' ? '' : `${formatRaceBenchmarkSegmentLabel(segment.segment)} ${formatInteger(segment.sampleSize)}명 중 `
  const range = `${formatRaceBenchmarkPercentileRange(segment.percentileRange, segment.percentileRangeBounds)} 예상 범위`
  const next = segment.nextCut && segment.nextCutGapSec !== null
    ? ` · ${formatRaceBenchmarkPercentilePoint(segment.nextCut.percentile)} 컷까지 ${formatDuration(segment.nextCutGapSec)} 단축 필요`
    : ''
  return `${who}${range}${next}`
}
const raceBenchmarkCurrentDistanceLabel = computed(() => {
  const distanceKm = raceProjection.value?.targetDistanceKm ?? activeGoal.value?.distanceKm ?? null
  if (typeof distanceKm !== 'number') return '현재 목표 거리'
  const category = getRaceBenchmarkDistanceCategory(distanceKm)
  return category ? raceBenchmarkDistanceCategoryLabel(category) : `${distanceKm}km`
})
const raceBenchmarkCoverageText = computed(() => {
  const summary = raceBenchmarkSummary.value
  if (!summary.total) return ''
  const distanceParts = raceBenchmarkDistanceCategories.map((category) => (
    `${raceBenchmarkDistanceCategoryLabel(category.id)} ${summary.distanceCoverage[category.id].total}개`
  ))
  const parts = [`국내 ${summary.domestic}개`, `해외 ${summary.international}개`, ...distanceParts, `최신 확인 ${summary.latestConfirmed}개`]
  if (summary.matchingDistance > 0) parts.push(`거리 일치 ${summary.matchingDistance}개`)
  return `대회 데이터 ${parts.join(' · ')}`
})
const raceBenchmarkSectionTitle = computed(() => {
  if (raceBenchmarkEvidenceLevel.value === 'multi-benchmark') return '대회 기준 현주소'
  if (raceBenchmarkEvidenceLevel.value === 'single-reference') return '공식 대회 1개 참고'
  return '대회 기준 데이터 준비'
})
const raceBenchmarkOverviewTitle = computed(() => {
  const summary = raceBenchmarkSummary.value
  if (raceBenchmarkEvidenceLevel.value === 'multi-benchmark') {
    return `${raceBenchmarkCurrentDistanceLabel.value} 기준 현주소 비교 가능 ${summary.matchingDistributionReady}개`
  }
  if (raceBenchmarkEvidenceLevel.value === 'single-reference') {
    return `${raceBenchmarkCurrentDistanceLabel.value} 기준 공식 대회 1개 참고`
  }
  if (summary.matchingDistance > 0) {
    return `${raceBenchmarkCurrentDistanceLabel.value} 기준 ${summary.matchingDistance}개 · 분포 컷 준비 중`
  }
  return `${raceBenchmarkCurrentDistanceLabel.value} 기준 데이터 없음`
})
const raceBenchmarkOverviewDescription = computed(() => {
  const pendingText = raceBenchmarkPendingCurrentDistanceItems.value.length
    ? ` 추가 후보 ${raceBenchmarkPendingCurrentDistanceItems.value.length}개는 분포 확보 전까지 계산에서 제외합니다.`
    : ''
  if (raceBenchmarkEvidenceLevel.value === 'multi-benchmark') {
    return `현주소 계산은 현재 목표 거리와 일치하고 비식별 분포 컷이 확보된 대회만 사용합니다.${pendingText}`
  }
  if (raceBenchmarkEvidenceLevel.value === 'single-reference') {
    return `현재 거리는 비교 가능한 대회가 1개뿐이라 현주소 단정이 아니라 공식 분포 참고값으로 보여줍니다.${pendingText}`
  }
  if (raceBenchmarkSummary.value.matchingDistance > 0) {
    return `최근 결과 출처는 확인됐지만 비식별 분포 컷이 없어 현재 목표 현주소 계산에서는 제외합니다.${pendingText}`
  }
  return '현재 목표 거리와 일치하는 대회 분포 컷이 아직 없습니다.'
})
const runnerProgress = computed(() =>
  resolveRunnerProgress(memoryStore.memory.athleteProfile, runs.value, today.value, {
    maxDistanceM: levelStore.selfReportedMaxDistanceM
  })
)
// 최근 한계 시험(TT) 결과(#411): self-race 태그 또는 type 'Race' 런 중 가장 최근. 3일 내면 승급 연결 메시지.
const timeTrialResult = computed(() => {
  const tt = runs.value.find((r) => r.tags?.includes('self-race') || r.type === 'Race')
  if (!tt) return null
  const daysAgo = Math.round((today.value.getTime() - new Date(`${tt.date}T00:00:00`).getTime()) / 86400000)
  if (daysAgo < 0 || daysAgo > 3) return null
  const p = runnerProgress.value
  return {
    daysAgo,
    nextClassLabel: p.nextClass?.label ?? null,
    gatePercent: p.gate1?.percent ?? null,
    eligible: Boolean(p.gate1?.eligible)
  }
})

// === 목표 기반 주기화 스케줄 + 주간 캐러셀 (에픽 #362) ===
const scheduleStore = useTrainingScheduleStore()
// #235/§10: 부하·추세는 레이싱을 소비하지 않는다(이중계산·오염 방지) → 훈련용 런만 투입.
const chronicLoad = computed(() => getChronicLoadTrend(trainingRuns.value, today.value, ageLoadWeight.value))
// #395 시작 볼륨 앵커: 최근 30일 총거리 → 주간 평균(데이터 없으면 null → 엔진이 보수적 기본값).
const currentWeeklyKm = computed(() => (chronicLoad.value.last30Km > 0 ? (chronicLoad.value.last30Km * 7) / 30 : null))
// #395 목표 실현가능성: 현재 체력 대비 목표가 무리면 코치가 솔직히 경고+대안(coach-moment로 노출).
const goalFeasibility = computed(() =>
  activeGoal.value
    ? assessGoalFeasibility({
        goal: activeGoal.value,
        profile: memoryStore.memory.athleteProfile,
        today: today.value,
        currentWeeklyKm: currentWeeklyKm.value
      })
    : null
)

// 휴식 선언 상태(#473): activeRest + 오늘 기준 파생(active·복귀 D-N·복귀일 등). 차분 배너·복귀 컨트롤이 쓴다.
const restState = computed(() => deriveRestState(memoryStore.memory.activeRest, todayDate.value))

function diffDaysIso(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000)
}

// 코치 보이스(#473 PR3)용 휴식 컨텍스트: active 중 닦달 억제 + "푹 쉬세요"(선언 직후 회복주 1회) /
// 복귀 전후(0~2일) "회복 후 정리" / 긴 휴식(>4주) 목표 재점검. coachMoments 가 톤·억제를 담당한다.
const restMomentCtx = computed(() => {
  const meta = memoryStore.memory.activeRest
  if (!meta) return null
  const s = restState.value
  const todayIso = todayDate.value
  // declaredAt 은 UTC ISO 타임스탬프 → 로컬 캘린더 날짜로 환산해 todayIso(로컬)와 같은 기준으로 비교(TZ 어긋남 방지).
  const daysSinceDeclared = diffDaysIso(todayIso, formatDateOnly(new Date(meta.declaredAt)))
  const daysSinceReturn = s.returnDate ? diffDaysIso(todayIso, s.returnDate) : null
  return {
    active: s.active,
    reason: s.reason,
    daysUntilReturn: s.daysUntilReturn,
    justDeclared: daysSinceDeclared >= 0 && daysSinceDeclared <= 1,
    // 회복주 게이트(이유·공존 부상 severity)는 엔티티 도메인 함수에서 판정해 플래그로 넘긴다(#397 — shared 에 도메인 안 쌓기).
    offerRecoveryRun: shouldOfferRecoveryRun(s.reason, activeInjury.value?.severity ?? null),
    showReturn: s.isOver && daysSinceReturn !== null && daysSinceReturn >= 0 && daysSinceReturn <= 2,
    longLayoff: s.durationDays !== null && s.durationDays > 28
  }
})

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
/**
 * 스케줄 앵커(scheduleAnchorWeeklyKm)를 현재 체력으로 영속한다 — 매 (재)빌드·재앵커·최초 초기화 시.
 * tempoCeiling 채택 영속과 동일 메커니즘(memoryStore.update + adaptiveTrainingProfile 머지)을 쓴다.
 * 같은 값이면 no-op(불필요한 메모리 write·정규화 방지). null/≤0 은 저장하지 않는다.
 */
async function persistScheduleAnchor(weeklyKm: number | null) {
  if (weeklyKm == null || weeklyKm <= 0) return
  const memory = memoryStore.memory
  if (memory.adaptiveTrainingProfile.scheduleAnchorWeeklyKm === weeklyKm) return
  await memoryStore.update({
    ...memory,
    adaptiveTrainingProfile: {
      ...memory.adaptiveTrainingProfile,
      scheduleAnchorWeeklyKm: weeklyKm,
      updatedAt: new Date().toISOString()
    }
  })
}

async function doEnsureSchedule() {
  if (!isSupabaseConfigured) return
  const goal = activeGoal.value
  if (!goal) return
  const archetype = goalArchetype(goal.category)
  // 성과는 목표일+거리 필요. 비성과(체중·체형/건강·습관)는 마감 없이 상시 리듬(#398).
  if (archetype === 'performance' && (!goal.targetDate || !goal.distanceKm)) return
  try {
    // 미로딩이거나 '다른 목표'가 로딩돼 있으면 활성 목표 세션으로 재로딩(#398 — 탭 복귀·목표 전환 stale 방지).
    if (!scheduleStore.loaded || scheduleStore.loadedGoalId !== goal.id) await scheduleStore.load(goal.id)
    // #235 후속 G4: self-race 가 점유한 세션·의도를 먼저 비운다(무태그·늦은태깅 잔재 치유, 멱등).
    // ⚠️ 순서 절대조건: heal → reconcile → settle. 또 reconcile/repoint 입력에서 self-race 를 빼야 멱등 수렴한다
    //    (안 그러면 heal 이 떼도 reconcile 이 self-race 를 곧장 다시 붙이는 도돌이).
    await runStore.healSelfRaceLinks()
    const trainingRunsForSchedule = runs.value.filter((r) => !isSelfRaceRun(r))
    // 이미 들어온 런(특히 매칭이 안 돌던 시절의 HealthKit 인입)을 예정 세션에 정합(done 치유).
    // 정산 전에 돌려야 수행했는데 planned 로 남은 세션이 missed 로 오확정되지 않는다.
    await scheduleStore.reconcileRuns(trainingRunsForSchedule)
    // 라벨 재추론(reinferRunTypesOnce)으로 타입이 바뀐 런이 같은 날 더 맞는 세션(예: LSD)에 잘못 연결돼 있으면
    // 그쪽으로 재연결(정산 전). "같은 날 Easy done·LSD missed" 더블 오매칭 치유.
    await scheduleStore.repointReinferredRuns(trainingRunsForSchedule)
    const mine = scheduleStore.sessions.filter((s) => s.goalId === goal.id)
    const hasActive = mine.some(isActiveSession)
    // 앵커 드리프트 기준선(영속). 빌드/재앵커 때마다 currentWeeklyKm 로 갱신해 ratio≈1 로 수렴(멱등).
    const anchor = memoryStore.memory.adaptiveTrainingProfile.scheduleAnchorWeeklyKm
    if (archetype !== 'performance') {
      // 비성과: 비주기화 상시 주간 리듬. 롤링 소진(활성 없음) 시 재생성. 재정렬 없음.
      if (!hasActive) {
        const drafts = buildSteadyWeeklyRhythm({
          archetype,
          profile: memoryStore.memory.athleteProfile,
          today: today.value,
          currentWeeklyKm: currentWeeklyKm.value,
          observedEasyPace: observedEasyPace.value,
          goalId: goal.id
        })
        if (drafts.length) {
          await scheduleStore.insertMany(drafts)
          await persistScheduleAnchor(currentWeeklyKm.value)
        }
      }
    } else if (!hasActive) {
      // 성과·콜드스타트: 주기화 골격 생성(currentWeeklyKm 앵커, #395).
      const drafts = buildPeriodizedSchedule({
        goal,
        profile: memoryStore.memory.athleteProfile,
        today: today.value,
        currentWeeklyKm: currentWeeklyKm.value,
        observedEasyPace: observedEasyPace.value
      })
      if (drafts.length) {
        await scheduleStore.insertMany(drafts)
        await persistScheduleAnchor(currentWeeklyKm.value)
      }
    } else {
      const rest = memoryStore.memory.activeRest
      const todayIso = dateOnly(today.value)
      if (rest && rest.untilDate < todayIso && !rest.returnRampApplied) {
        // 복귀 램프(#473 Phase 2) 자연 만료 경로: 휴식이 끝났는데 아직 강제 적용 안 했으면, drift 유무와 무관하게
        // 현재 체력 재앵커 + 초반 세션 Easy·캡으로 "회복 후 정리"를 1회 강제(SSOT 라인 89는 무조건적 복귀 처방).
        // 짧은 휴식(<7일, returnRampPayload=null)은 무램프 — 원래 계획대로 이어간다(단기 손실 무시 수준).
        const payload = returnRampPayload(rest)
        if (payload) await applyReturnRampDrafts(goal, payload)
        await memoryStore.setActiveRest({ ...rest, returnRampApplied: true })
      } else {
        // 성과·운영중: 누적 이탈/앵커 드리프트 시 forward 재정렬.
        // 복귀 윈도(메타 살아있는 isOver) 동안엔 returnRamp 를 재전달해 캡을 보존하고 generic 닦달 토스트를 억제한다.
        const returnRamp = rest && restState.value.isOver ? returnRampPayload(rest) : null
        // 앵커 미초기화(기존 사용자 첫 부팅 등) → 현재 체력으로 조용히 초기화하고 그 값을 기준선으로 넘긴다.
        // ratio≈1 이 되어 앵커 드리프트가 발동하지 않으므로 재정렬·토스트 없이 초기화만 일어난다.
        let anchorForCheck = anchor
        if (anchorForCheck == null) {
          await persistScheduleAnchor(currentWeeklyKm.value)
          anchorForCheck = currentWeeklyKm.value
        }
        const plan = buildRealignedSchedule(mine, goal, memoryStore.memory.athleteProfile, today.value, currentWeeklyKm.value, anchorForCheck, observedEasyPace.value, returnRamp)
        if (plan.drafts.length) {
          await scheduleStore.realign(goal.id, plan.fromDate, plan.drafts)
          // 재앵커 발생 → 기준선을 현재 체력으로 갱신(다음 부팅부터 ratio≈1 로 수렴, 영구 재발동 방지).
          await persistScheduleAnchor(currentWeeklyKm.value)
          // (#235 후속 S3) self-race 를 부하에서 제외한 '첫 빌드'에선 weeklyKm 이 한 단계 낮아져 "체력 변화 감지"
          // 토스트가 1회 오발할 수 있다. 사용자가 레이싱 기록을 가진 첫 수렴 빌드의 deviation 토스트만 1회 억제한다
          // (앵커가 새 값으로 수렴한 뒤의 진짜 deviation 은 정상 노출). 세션 1회.
          const suppressSelfRaceDrift = !selfRaceAnchorSettledOnce && runs.value.some((r) => isSelfRaceRun(r))
          if (plan.deviation.reason && !returnRamp && !suppressSelfRaceDrift) toastStore.success(plan.deviation.reason)
          selfRaceAnchorSettledOnce = true
        }
      }
    }
    // 주간 정산(무조건·멱등): 닫힌 주(월~일)의 미수행 planned → missed 확정. realign 시도 뒤에 둬서
    // 닫힌 주 누락이 재정렬 트리거로 먼저 평가되게 한다. 현재 주의 지난 날은 'open'(따라잡기 가능)으로 유지.
    await scheduleStore.settleClosedWeeks(goal.id, trainingWeekRange(today.value).start)
    // 휴식 선언(#473) 보존: realign/콜드스타트가 휴식 구간에 planned 를 새로 깔았으면 다시 rested 로 되돌린다
    // (builder 를 건드리지 않고 멱등 재적용 — 휴식 중 닦달 재발/중복카드 방지). 복귀일이 지나면 건너뛴다.
    // (만료 메타 해제는 expireRestMetaIfOver 가 스케줄 게이트와 무관하게 항상 처리한다.)
    const rest = memoryStore.memory.activeRest
    if (rest && rest.untilDate >= dateOnly(today.value)) {
      await scheduleStore.declareRest(goal.id, rest.startDate, rest.untilDate)
    }
  } catch {
    // best-effort: 스케줄 생성 실패가 대시보드를 막지 않는다.
  }
}

/**
 * 복귀 램프(#473 Phase 2) 페이로드 — 휴식 '기간'으로 초반 캡 세션 수·세션 거리 상한을 계산한다.
 * layoffDays = 휴식 기간(durationDays = untilDate-startDate+1) — '앱을 언제 다시 열었나'(경과일)가 아니라
 * 디트레이닝 손실 추정이어야 하므로(SSOT 라인 84). longLayoff(restWindow durationDays)와 동일 측정으로 통일.
 * 짧은 휴식(<7일)이면 windowSessions=0 → null(무램프, 원래 계획대로). capKm = 직전30일 최장+10%(자기조절).
 */
function returnRampPayload(rest: ActiveRest): { capKm: number; windowSessions: number } | null {
  const layoffDays = diffDaysIso(rest.untilDate, rest.startDate) + 1
  const windowSessions = returnRampWindowSessions(layoffDays)
  if (windowSessions === 0) return null
  return { capKm: returnSessionCapKm(getLongestRunKmWithinDays(runs.value, 30, today.value)), windowSessions }
}

/**
 * 복귀 램프 강제 적용 — 현재(낮아진) 체력으로 forward 재앵커 + 초반 windowSessions 개 Easy·캡으로 점진 복원.
 * shouldRealign 게이트와 무관하게 항상 적용해 SSOT 라인 89 "복귀 초반 세션들 Easy·상한"을 보장한다(F1 수정).
 * generic 닦달 토스트 없음 — "회복 후 정리" 톤은 복귀 토스트/rest-return 모먼트가 담당.
 */
async function applyReturnRampDrafts(goal: TrainingGoal, payload: { capKm: number; windowSessions: number }) {
  const drafts = buildPeriodizedSchedule({
    goal,
    profile: memoryStore.memory.athleteProfile,
    today: today.value,
    currentWeeklyKm: currentWeeklyKm.value,
    observedEasyPace: observedEasyPace.value,
    returnRamp: payload
  }).map((d) => ({ ...d, source: 'realign' as const }))
  if (drafts.length) await scheduleStore.realign(goal.id, dateOnly(today.value), drafts)
}

// 주 고정 데이-스트립(월~일) ± weekOffset 주. 오늘 중심 롤링이 아니라 "이번 주"를 한눈에 조망·조정(설계 2026-06-19).
const weekOffset = ref(0)
const todayWeekdayIndex = computed(() => (new Date(today.value).getDay() + 6) % 7) // 월=0
function weekMonday(offsetWeeks: number): Date {
  const base = new Date(today.value)
  base.setDate(base.getDate() + offsetWeeks * 7)
  return new Date(`${trainingWeekRange(base).start}T00:00:00`)
}
const scheduleDays = computed<CarouselDay[]>(() => {
  const monday = weekMonday(weekOffset.value)
  const todayStr = dateOnly(today.value)
  const out: CarouselDay[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const date = dateOnly(d)
    // #235/§10 (M4): self-race 만 있는 날을 'done'(✅)으로 표시하지 않는다(레이싱≠훈련 완료). 세션 state/칩/더블
    // 판정 모두 이 run 을 보므로 trainingRuns 기준으로 도출하면 일관 정합(레이싱한 날은 세션 유무에 따라 today/rest).
    const run = trainingRuns.value.find((r) => r.date === date) ?? null
    // 그 날의 표시 세션(폐기 제외). 우선순위 planned(active) > missed > skipped.
    const onDay = scheduleStore.sessions.filter((s) => s.date === date && s.status !== 'superseded')
    const planned = onDay.find((s) => s.status === 'planned')
    const missed = onDay.find((s) => s.status === 'missed')
    const skipped = onDay.find((s) => s.status === 'skipped')
    const rested = onDay.find((s) => s.status === 'rested')
    const display = planned ?? missed ?? skipped ?? null
    let state: CarouselDay['state']
    if (run) state = 'done'
    else if (planned) state = date === todayStr ? 'today' : date < todayStr ? 'open' : 'future'
    else if (missed) state = 'missed'
    else if (skipped) state = 'skipped'
    else if (rested) state = 'rested' // 선언한 휴식(#473) — 차분한 💤, 'rest' fall-through 전에 명시 분기
    else state = 'rest'
    const chip = run ? sessionTypeLabel(run.type) : display ? sessionTypeLabel(display.sessionType) : rested ? '💤' : '휴식'
    // 같은 날 더블(#455): 실슬롯(planned/missed/done, 포기·휴식 제외) 2개 이상이면 ×2 배지.
    const double = onDay.filter((s) => s.status !== 'skipped' && s.status !== 'rested').length >= 2
    out.push({ date, label: `${WEEKDAY_KO[d.getDay()]} ${d.getDate()}`, state, chip, double })
  }
  return out
})
const weekLabel = computed(() => {
  const base = new Date(today.value)
  base.setDate(base.getDate() + weekOffset.value * 7)
  const r = trainingWeekRange(base)
  const fmt = (s: string) => { const p = s.split('-'); return `${Number(p[1])}/${Number(p[2])}` }
  const range = `${fmt(r.start)}~${fmt(r.end)}`
  if (weekOffset.value === 0) return `이번 주 · ${range}`
  if (weekOffset.value === -1) return `지난주 · ${range}`
  if (weekOffset.value === 1) return `다음주 · ${range}`
  return range
})
function navWeek(delta: number) {
  weekOffset.value = Math.max(-8, Math.min(8, weekOffset.value + delta))
}
// 실제 주기화 스케줄(목표+targetDate로 생성된 세션)이 있을 때만 캐러셀. 완료런만으론 표시 안 함(무계획 오인 방지).
const hasSchedule = computed(() => scheduleStore.sessions.length > 0)
// 목표 아키타입(#398): 성과만 주기화·예측·단계카드, 비성과는 상시 리듬.
const isPerformanceGoal = computed(() => (activeGoal.value ? goalArchetype(activeGoal.value.category) === 'performance' : false))
// 스케줄이 곧 생성될 목표면 로딩 중 옛 히어로 폴백을 깜빡이지 말고 플레이스홀더(FOUC 방지).
// 성과=목표일+거리, 비성과=활성 목표만 있으면(마감 불필요).
const expectsSchedule = computed(
  () =>
    isSupabaseConfigured &&
    (isPerformanceGoal.value
      ? Boolean(activeGoal.value?.targetDate && activeGoal.value?.distanceKm)
      : Boolean(activeGoal.value))
)
// 스케줄/메모리가 아직 정착 중이면 목표 없는 히어로(화살표만 보이는 폴백)를 깜빡이지 말고 플레이스홀더로.
// (콜드 첫 페인트: memory 미로드 → activeGoal null → expectsSchedule false → 폴백 히어로가 잠깐 뜨던 문제)
const scheduleLoadingPlaceholder = computed(
  () =>
    !hasSchedule.value &&
    !scheduleStore.error &&
    (expectsSchedule.value || scheduleStore.loading || memoryStore.loading || !memoryStore.loaded)
)
// 위크 요약(이번 주 단계·포커스·핵심·볼륨·D-day) — "이번 주가 통째로 뭘 위한 주인지"
const activeArchetype = computed(() => (activeGoal.value ? goalArchetype(activeGoal.value.category) : 'performance'))
const weekSummary = computed(() =>
  buildWeekSummary(scheduleStore.sessions, today.value, activeGoal.value?.targetDate ?? null, activeArchetype.value)
)
const activeDayIndex = ref((new Date(today.value).getDay() + 6) % 7) // 기본 = 이번 주 오늘(월=0)
// 주를 넘기면 활성 일자를 그 주 첫날로(현재 주면 오늘로) 맞춘다.
watch(weekOffset, (v) => {
  activeDayIndex.value = v === 0 ? todayWeekdayIndex.value : 0
})
const activeDay = computed(() => scheduleDays.value[activeDayIndex.value] ?? null)
const activeSession = computed<ScheduledSession | null>(() =>
  activeDay.value ? scheduleStore.sessionOnDate(activeDay.value.date) : null
)
// 같은 날 더블(#455): 그 날 활성 세션 전부(AM→PM). 2건이면 더블 패널을 렌더한다.
const activeSessions = computed<ScheduledSession[]>(() =>
  activeDay.value ? scheduleStore.sessionsOnDate(activeDay.value.date) : []
)
const isActiveDayDouble = computed(() => activeSessions.value.length >= 2)
// 안 뛴 날/포기(open·missed·skipped) 슬라이드용 세션(폐기 제외, planned>missed>skipped).
const activeOpenSession = computed<ScheduledSession | null>(() => {
  const day = activeDay.value
  if (!day || !(day.state === 'open' || day.state === 'missed' || day.state === 'skipped')) return null
  const onDay = scheduleStore.sessions.filter((s) => s.date === day.date && s.status !== 'superseded')
  return (
    onDay.find((s) => s.status === 'planned') ??
    onDay.find((s) => s.status === 'missed') ??
    onDay.find((s) => s.status === 'skipped') ??
    null
  )
})
// 세션 타입 → 용어집 슬러그(훈련법 해설 deep-link). 카드 제목 탭 시 그 항목으로 용어집을 연다.
const glossaryStore = useGlossaryStore()
const SESSION_TYPE_GLOSSARY_SLUG: Partial<Record<ScheduledSession['sessionType'], string>> = {
  Easy: 'easy',
  Recovery: 'recovery',
  'Easy + Strides': 'easy-strides',
  Tempo: 'tempo',
  LSD: 'lsd',
  'Steady Long': 'steady-long',
  Race: 'race-tt'
}
const activeMethodSlug = computed(() =>
  activeSession.value ? SESSION_TYPE_GLOSSARY_SLUG[activeSession.value.sessionType] ?? '' : ''
)
function openMethodGlossary() {
  if (activeMethodSlug.value) glossaryStore.requestOpen(activeMethodSlug.value)
}
// 포스트런 디브리핑: 완료 런 타입 → 용어집 슬러그('이 세션이 뭔가요?' 링크).
const activeDoneMethodSlug = computed(() =>
  activeDoneRun.value ? SESSION_TYPE_GLOSSARY_SLUG[activeDoneRun.value.type] ?? '' : ''
)
function openDoneMethodGlossary() {
  if (activeDoneMethodSlug.value) glossaryStore.requestOpen(activeDoneMethodSlug.value)
}
// #235/§10: 디브리핑/완료 카드는 훈련 런만 대상(세션 unlink 만으론 date-keyed 디브리핑이 안 사라진다).
// 레이싱한 날엔 디브리핑 대신 이지 브리핑 등 본래 처방이 그대로 보이도록 trainingRuns 로 도출.
const activeDoneRun = computed(() =>
  activeDay.value ? trainingRuns.value.find((r) => r.date === activeDay.value!.date) ?? null : null
)
const activeBriefing = computed<SessionBriefing | null>(() => {
  const base = activeSession.value
  if (!base || activeDoneRun.value) return null
  // Easy 계열이면 관측 보정 페이스로 처방 페이스를 다시 계산해 표시(#405) — 저장된 VDOT 추정 페이스 대신.
  const session =
    observedEasyPace.value && EASY_FAMILY_TYPES.has(base.sessionType)
      ? { ...base, prescription: prescriptionFor(base.sessionType, base.prescription.distanceKm ?? 0, calibratedPaceModel.value) }
      : base
  // 오늘 세션이면 SessionIntent(의도·성공기준·타겟)를 흡수해 단일 카드로(중복 의도 카드 제거).
  // 단 의도가 '오늘 + 스케줄 세션 타입과 일치'할 때만 흡수한다 — 옛 추천엔진으로 만든 다른 날/다른 타입
  // 의도(예: 목요일 Tempo)가 오늘 이지 브리핑에 모순된 타겟(심박 146~158·RPE 6~7)을 섞는 것 방지(#398 후속).
  const planned = todayPlannedIntent.value
  const intentMatchesToday = planned && (!base || planned.sessionType === base.sessionType)
  const intent =
    activeDay.value?.state === 'today' && planned && intentMatchesToday
      ? {
          why: planned.why,
          successCriteria: planned.successCriteria,
          targets: planned.targets
        }
      : null
  return buildSessionBriefing(session, {
    goal: activeGoal.value,
    injury: activeInjury.value,
    chronic: chronicLoad.value,
    vdot: resolvePaceModel(memoryStore.memory.athleteProfile).vdot,
    adaptiveProfile: memoryStore.memory.adaptiveTrainingProfile,
    progression: adaptiveProgress.value.criteria,
    intent,
    // 페이스 근거 투명화(#405) — 관측 보정이면 표본 수, 아니면 추정 안내. (나중에 "나의 통계"로 흡수)
    easyPaceBasis: observedEasyPace.value
      ? `내 Easy 런 ${observedEasyPace.value.sampleCount}건 기준 (심박 ${heartRateModel.value.easyCeilingBpm ?? '-'} 이하)`
      : 'VDOT 추정 — Easy 심박 이하 런 3건 모이면 내 데이터로 보정돼요',
    nonPeriodized: !isPerformanceGoal.value
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
// 플랜 시작일(가장 이른 세션 날짜). 이 날짜 이전 런은 "플랜 없던 시절"이라 추가런 판정에서 제외.
const scheduleStartDate = computed(() =>
  scheduleStore.sessions.reduce<string | null>((min, s) => (!min || s.date < min ? s.date : min), null)
)
// 진짜 엑스트라 런 = 스케줄이 있는데 그 세션/의도에 귀속 안 됨(따라잡기 아님). 스케줄 없으면 추가 런 아님.
const activeExtraEval = computed(() => {
  const run = activeDoneRun.value
  if (!run || !hasSchedule.value) return null
  // 플랜 시작 이전 런은 예정/예정 외를 따질 대상이 아니다(귀속할 플랜이 없었음). [[web-change-verify-render-and-migration]] 일반화: #390 추세 가드와 동일 기준.
  if (scheduleStartDate.value && run.date < scheduleStartDate.value) return null
  // 귀속 판정: ① 세션에 runId 링크됨, ② 의도 있음, ③ 그 날짜에 활성 계획 세션 존재.
  // ③은 임포트 시 런↔세션 링크(matchRun)가 안 걸려도 "예정된 날 뛴 것"을 예정 외로 오판하지 않게 한다
  // (캐러셀·이번주 미션과 동일한 날짜 기준 귀속). 링크 누락으로 오늘의 본세션이 "예정에 없던 런"으로 뜨던 버그.
  const attributed =
    scheduleStore.sessions.some((s) => s.runId === run.id) ||
    Boolean(activeDoneIntent.value) ||
    scheduleStore.sessions.some((s) => s.date === run.date && isActiveSession(s))
  if (attributed) return null
  return evaluateExtraRun(run, activeInjury.value, chronicLoad.value)
})
// Tempo A/B/C/D 등급 → 디브리핑 한 줄 라벨(이진 성공/실패 아님, #301).
const TEMPO_GRADE_LABEL: Record<TempoGrade, string> = {
  A: '잘 수행 ✓',
  B: '양호 ✓',
  C: '아쉬움 ⚠',
  D: '자극 부족'
}
const activeGradeLine = computed<string | null>(() => {
  const run = activeDoneRun.value
  if (!run) return null
  if (run.type === 'Steady Long') {
    const e = evaluateSteadyLong(run)
    return `${STEADY_LONG_GRADE_LABEL[e.grade]}${e.reasons[0] ? ` · ${e.reasons[0]}` : ''}`
  }
  if (run.type === 'LSD') {
    const e = evaluateLsd(run, { easyCeilingBpm: heartRateModel.value.easyCeilingBpm, recoveryCeilingBpm: heartRateModel.value.recoveryCeilingBpm })
    // kind(회복/표준/점증) + 후반 안정성을 함께 보여준다(reasons[0]은 항상 kind 문구라 부담 신호가 안 보이던 문제).
    const stability = e.hrDriftBpm === null ? '심박 데이터 없음' : e.stable ? '심박 안정 ✓' : '후반 드리프트 ⚠'
    return `${LSD_KIND_LABEL[e.kind]} · ${stability}`
  }
  // 이지·회복·이지+스트라이드: RPE 우선 강도 유지 판정(#354). 빈 디브리핑 방지.
  if (run.type === 'Easy' || run.type === 'Recovery' || run.type === 'Easy + Strides') {
    const isRecovery = run.type === 'Recovery'
    // 스트라이드 세션은 가속 구간 심박 상승이 정상이라 평균심박으로 본런 강도를 판정(브리핑과 정렬).
    const hasStrides = run.type === 'Easy + Strides'
    const ceilingBpm = isRecovery ? heartRateModel.value.recoveryCeilingBpm : heartRateModel.value.easyCeilingBpm
    const e = evaluateEasyRecovery(run, { ceilingBpm, isRecovery, hasStrides })
    const label = e.intentHeld ? (e.rpeOverride ? '강도 유지(RPE 우선) ✓' : '강도 유지 ✓') : '강도 초과 ⚠'
    return `${label}${e.reasons[0] ? ` · ${e.reasons[0]}` : ''}`
  }
  // 템포: 정본 gradeTempoRun(A/B/C/D — 자극 확보 × 상한 준수 × 후반 유지). 추세·적응과 동일 기준(#301).
  if (run.type === 'Tempo') {
    const g = gradeTempoRun(run, heartRateModel.value.tempoCeilingBpm, evaluateLapDrift(run).level)
    const label = TEMPO_GRADE_LABEL[g.grade]
    return `${label}${g.reasons[0] ? ` · ${g.reasons[0]}` : ''}`
  }
  return null
})
const debriefNextLine = computed(() => {
  // 새 주기화 스케줄 기준 다음 세션(옛 weeklyPattern dayView.next 아님 — 불일치 방지).
  // 방금 완료한 날(activeDoneRun.date) 이후로 — 링크 누락으로 오늘 세션이 미완료로 남아도 "다음"에 자기 자신이 안 뜨게.
  const after = activeDoneRun.value?.date ?? todayDate.value
  const next = scheduleStore.upcoming(todayDate.value).find((s) => s.date > after) ?? null
  return next ? `${formatDateWithWeekday(next.date)} · ${sessionTypeLabel(next.sessionType)}` : null
})

// 이번 주 미션(#401): 풀 주기화 스케줄의 "이번 주"를 완수 가능한 목표로 — 핵심 세션·볼륨 진행.
// 캐러셀(달력)·레벨카드(RPG)와 중복 없이 "이번 주에 뭘 끝내면 되는지"의 실행 레이어.
const weekMission = computed(() => {
  if (!hasSchedule.value) return null
  // "이번 주"는 위크요약과 동일 창(월~일 SSOT). 과거엔 미션=월~일, 요약=일~토로 어긋나 볼륨이 달라 보였다.
  const { start: lo, end: hi } = trainingWeekRange(today.value)
  const wk = scheduleStore.sessions.filter((s) => isActiveSession(s) && s.date >= lo && s.date <= hi)
  if (!wk.length) return null
  // 완수 판정은 캐러셀(✓)과 동일하게 "그 날짜에 실제 런이 있으면 완료"로 본다.
  // 세션 runId 링크에만 의존하면 임포트된 런이 스케줄 세션에 연결되기 전까지 0으로 누락된다.
  // #235/§10: 주간 완료/볼륨은 레이싱을 빼고 집계(레이싱이 주간 미션 달성을 부풀리지 않게).
  const runsInWeek = trainingRuns.value.filter((r) => r.date >= lo && r.date <= hi)
  const runDates = new Set(runsInWeek.map((r) => r.date))
  const isDone = (s: ScheduledSession) => s.status === 'done' || Boolean(s.runId) || runDates.has(s.date)
  const keys = wk.filter((s) => s.keySession)
  const sumPlanned = (arr: ScheduledSession[]) => Math.round(arr.reduce((sum, s) => sum + (s.prescription.distanceKm ?? 0), 0))
  // 완주 볼륨은 계획 km이 아닌 실제 런 거리(이번 주 누적)로 — "이번 주에 실제로 얼마 뛰었나".
  const doneKm = Math.round(runsInWeek.reduce((sum, r) => sum + (r.distanceKm ?? 0), 0))
  return {
    focusLine: weekSummary.value?.focusLine ?? '',
    sessionsTotal: wk.length,
    // 실제로 이번 주 뛴 횟수(볼륨 라인과 동일 기준). 계획 세션 매칭이 아니라 실주행 수 — 스케줄 생성 이전
    // 과거 요일에 뛴 런도 "이번 주 활동"으로 잡힌다.
    sessionsDone: runsInWeek.length,
    keyTotal: keys.length,
    keyDone: keys.filter(isDone).length,
    plannedKm: sumPlanned(wk),
    doneKm
  }
})

// 전략적 휴식(#378): 휴식날도 회복·부상관리·근력 보강 안내
const restGuidance = computed(() => buildRestGuidance(activeInjury.value, chronicLoad.value))

// 코치 모먼트 엔진(#382): 유의미한 순간(부상·부하·추가런 등) 감지 → 우선순위로 적시 노출.
const attributedRunIds = computed(() => {
  const ids = new Set<string>()
  for (const s of scheduleStore.sessions) if (s.runId) ids.add(s.runId)
  for (const i of sessionIntentStore.intents) if (i.runId) ids.add(i.runId)
  return ids
})
const dismissedMomentKeys = ref(new Set<string>())
const coachMoments = computed(() =>
  collectCoachMoments(
    {
      runs: runs.value,
      attributedRunIds: attributedRunIds.value,
      chronic: chronicLoad.value,
      injury: activeInjury.value,
      today: today.value,
      painProbe: painProbeCtx.value,
      scheduleExists: hasSchedule.value,
      scheduleStartDate: scheduleStartDate.value,
      deviation: detectScheduleDeviation(scheduleStore.sessions, today.value),
      weekendTriage: weekendTriageData.value
        ? {
            saveLabel: sessionTypeLabel(weekendTriageData.value.saveSession.sessionType),
            releaseCount: weekendTriageData.value.releaseSessions.length
          }
        : null,
      goalProgress: raceProjection.value
        ? {
            readinessScore: raceProjection.value.readinessScore,
            readinessLevel: raceProjection.value.readinessLevel,
            dDayText: weekSummary.value?.dDayText ?? ''
          }
        : null,
      goalFeasibility: goalFeasibility.value,
      timeTrialResult: timeTrialResult.value,
      doubleSuggestion: doubleSuggestionData.value
        ? { backlogLabel: doubleSuggestionData.value.backlogLabel, amDayLabel: doubleSuggestionData.value.amDayLabel }
        : null,
      rest: restMomentCtx.value
    },
    dismissedMomentKeys.value
  )
)
const topCoachMoment = computed(() => coachMoments.value[0] ?? null)
function dismissMoment(key: string) {
  dismissedMomentKeys.value = new Set([...dismissedMomentKeys.value, key])
}
function onMomentAction(moment: { key: string; action?: { kind: string } }) {
  if (moment.action?.kind === 'open-injury-screening') useInjuryFlowStore().requestScreening()
  else if (moment.action?.kind === 'open-weekend-triage') triageOpen.value = true
  else if (moment.action?.kind === 'open-doubles-add') openDoublesAdd(doubleSuggestionData.value?.amSession ?? null)
  dismissMoment(moment.key)
}
const probeSaving = ref(false)
/**
 * 부상 감별 grill 프로브 답(§5 Phase C)을 부상 항목에 영속한다 — probeAnswers[probeId]=value + (있으면) subtypeResolved.
 * App.vue submitInjuryCheckIn 패턴 미러(clone → 항목 갱신 → memoryStore.update). 모먼트는 닫지 않아 코치 응답이 계속 보인다.
 * ⚠ 비파괴 add 전용(probeAnswers 1키 추가 + subtypeResolved 1개). 다른 메모리 라이터와 겹친 덮어쓰기를 막으려 in-flight 가드를 둔다 —
 *    이 액션을 destructive(기존 항목 삭제/덮어쓰기)하게 확장하지 말 것.
 */
async function onMomentSelect(option: CoachMomentOption) {
  const probe = option.probe
  if (!probe || probeSaving.value) return
  probeSaving.value = true
  try {
    const memory = cloneMemory(memoryStore.memory)
    const item = memory.injuryItems.find((entry) => entry.id === probe.injuryItemId)
    if (!item) return
    item.probeAnswers = { ...(item.probeAnswers ?? {}), [probe.probeId]: probe.value }
    if (probe.subtype) item.subtypeResolved = probe.subtype
    item.updatedAt = new Date().toISOString()
    await memoryStore.update(memory)
  } finally {
    probeSaving.value = false
  }
}
function cloneMemory(memory: TrainingMemory): TrainingMemory {
  return JSON.parse(JSON.stringify(memory))
}

// 스케줄 변경 액션 공통 래퍼(중복 쓰기 방지 busy + 실패 토스트).
async function runScheduleOp(fn: () => Promise<void>) {
  if (intentBusy.value) return
  intentBusy.value = true
  try {
    await fn()
  } catch {
    toastStore.error('일정을 바꾸지 못했어요.')
  } finally {
    intentBusy.value = false
  }
}

function onBriefingAck() {
  toastStore.success('좋아요, 오늘은 이 훈련에 집중해요.')
}
async function onBriefingAlternative(direction: 'easier' | 'harder') {
  const session = activeSession.value
  if (!session) return
  await runScheduleOp(async () => {
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
    // 상향(harder)엔 주간 하드 부하 소프트 경고를 덧붙인다(막지 않음 — 이미 적용됨).
    const guard =
      direction === 'harder'
        ? weeklyHardLoadGuard(scheduleStore.sessions, today.value, memoryStore.memory.athleteProfile?.weeklyRunDaysTarget ?? 4)
        : null
    const msg = [warning, guard?.exceeds ? guard.message : ''].filter(Boolean).join(' ')
    if (msg) toastStore.success(msg)
  })
}

// 변경된(manual) 세션의 코치 원래 제안(같은 날 superseded 원본) — 원본 표시·되돌리기용.
const activeOriginal = computed<ScheduledSession | null>(() => {
  const s = activeSession.value
  if (!s || s.source !== 'manual') return null
  return (
    scheduleStore.sessions
      .filter((x) => x.date === s.date && x.status === 'superseded' && x.goalId === s.goalId && x.source !== 'manual')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
  )
})
const activeOriginalLabel = computed(() => {
  const o = activeOriginal.value
  if (!o) return null
  const km = o.prescription.distanceKm ? ` ${o.prescription.distanceKm}km` : ''
  return `${sessionTypeLabel(o.sessionType)}${km}`
})

async function onBriefingSkip() {
  const s = activeSession.value
  if (!s) return
  // 키 세션은 드롭 전에 "이번 주 다른 날로?"를 먼저 권한다(SSOT §훈련 스케줄 모델).
  if (s.keySession) {
    openReschedule(s, true)
    return
  }
  await runScheduleOp(async () => {
    await scheduleStore.skip(s.id)
    toastStore.success('이번 주 이 세션은 건너뛸게요. 회복도 훈련의 일부예요.')
  })
}
function onBriefingReschedule() {
  if (activeSession.value) openReschedule(activeSession.value, false)
}
async function onBriefingRevert() {
  const modified = activeSession.value
  const original = activeOriginal.value
  if (!modified || !original) return
  await runScheduleOp(async () => {
    await scheduleStore.revert(modified.id, original.id)
    toastStore.success('코치의 원래 제안으로 되돌렸어요.')
  })
}

// 안 뛴 날/포기 카드 액션
async function onMoveToToday() {
  const s = activeOpenSession.value
  if (!s) return
  const occupant = scheduleStore.sessionOnDate(dateOnly(today.value))
  // 오늘이 이미 더블(2세션)이면 3세션 미지원 — 가져오기 차단(#455 N≥3 보류).
  if (scheduleStore.sessionsOnDate(dateOnly(today.value)).filter((x) => x.id !== s.id).length >= 2) {
    toastStore.error('오늘은 이미 2세션이에요. 같은 날 3세션은 아직 지원하지 않아요.')
    return
  }
  await runScheduleOp(async () => {
    if (occupant && occupant.id !== s.id) {
      // 오늘 이미 세션 있음 → 같은 날 더블(미지원) 대신 스왑(오늘 세션을 가져온 세션의 원래 날짜로). 진짜 더블은 #455.
      const swap = proposeSwap(s, occupant)
      await scheduleStore.reschedule(swap.supersedeIds, swap.drafts)
      toastStore.success(`오늘로 가져왔어요. 오늘 있던 ${sessionTypeLabel(occupant.sessionType)}는 ${sessionTypeLabel(s.sessionType)}의 원래 날짜로 자리를 바꿨어요.`)
    } else {
      const { draft } = proposeMoveToToday(s, today.value)
      await scheduleStore.reschedule([s.id], [draft])
      toastStore.success('오늘 세션으로 가져왔어요.')
    }
    weekOffset.value = 0
    activeDayIndex.value = todayWeekdayIndex.value
  })
}
function onOpenReschedule() {
  if (activeOpenSession.value) openReschedule(activeOpenSession.value, false)
}
async function onOpenSkip() {
  const s = activeOpenSession.value
  if (!s || s.status === 'skipped') return
  await runScheduleOp(async () => {
    await scheduleStore.skip(s.id)
    toastStore.success('이번 주는 놓아줄게요. 회복도 훈련의 일부예요.')
  })
}

// === 휴식 선언/복귀 (#473, SSOT §휴식과 복귀) ===
const restSheetOpen = ref(false)
const restPresetReason = ref<RestReason | null>(null)
const restPresetUntil = ref<string | null>(null)
function openRestSheet() {
  restPresetReason.value = null
  restPresetUntil.value = null
  restSheetOpen.value = true
}
// 복귀일 조정: 현재 휴식의 이유·복귀일을 미리 채워 연다 — 날짜만 바꿔도 저장 활성(이유 재선택 불필요·버그 수정).
function openRestAdjust() {
  restPresetReason.value = restState.value.reason
  restPresetUntil.value = restState.value.untilDate
  restSheetOpen.value = true
}
// 부상 체크인 시트(App.vue) "한동안 쉴게요" 진입(#473 PR3): 이유=부상 프리셋으로 휴식 시트를 연다.
// immediate — 대시보드 마운트 전에 요청이 설정됐어도(부상 시트→라우팅) 마운트 시 한 번 집어낸다.
watch(
  () => useInjuryFlowStore().restRequest,
  (reason) => {
    if (!reason) return
    restPresetReason.value = reason
    restSheetOpen.value = true
    useInjuryFlowStore().clearRest()
  },
  { immediate: true }
)
function dayAfterIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return dateOnly(d)
}
function dayBeforeIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return dateOnly(d)
}
/** 휴식 선언/복귀일 조정 공통: [start, until] 을 rested 로 맞추고(연장 포함), until 이후 잔여 rested 는 되돌린다(단축). */
async function onDeclareRest(payload: { untilDate: string; reason: RestReason }) {
  const goal = activeGoal.value
  await runScheduleOp(async () => {
    // 조정이면 기존 시작일 유지, 신규면 오늘 시작.
    const start = restState.value.active && restState.value.startDate ? restState.value.startDate : todayDate.value
    if (goal) {
      await scheduleStore.declareRest(goal.id, start, payload.untilDate)
      await scheduleStore.unrestFrom(goal.id, dayAfterIso(payload.untilDate)) // 단축 시 잔여 tail 복원
    }
    await memoryStore.setActiveRest({
      startDate: start,
      untilDate: payload.untilDate,
      reason: payload.reason,
      declaredAt: new Date().toISOString()
    })
    restSheetOpen.value = false
    weekOffset.value = 0
    toastStore.success('푹 쉬세요. 일정은 정리해둘게요 — 돌아오면 가볍게 시작해요.')
  })
}
/**
 * 지금 복귀(#473 Phase 2): 오늘 이후 rested→planned 복원 + 휴식 메타를 "어제 종료된 복귀 윈도"로 전환한 뒤
 * ensure 를 돌린다. 명시 복귀와 자연 만료를 **같은 자연만료 경로**(doEnsureSchedule 의 untilDate<today &&
 * !returnRampApplied 분기)로 통일한다 — 그래야 복귀 윈도(isOver) 동안 후속 재정렬도 returnRamp 를 재전달해
 * 캡이 up-drift 재정렬에 소실되지 않고 generic 닦달 토스트도 억제된다(F1). 메타 정리는 expireRestMetaIfOver 가 맡는다.
 * 짧은 휴식(<7일)은 returnRampPayload=null 이라 램프 미적용(원래 계획대로).
 */
async function returnFromRestNow() {
  const goal = activeGoal.value
  const rest = memoryStore.memory.activeRest
  await runScheduleOp(async () => {
    if (goal) await scheduleStore.unrestFrom(goal.id, todayDate.value)
    if (rest) {
      // untilDate=어제 → isOver=true(복귀 윈도). 1일 휴식 당일 복귀 같은 퇴화 케이스(어제<시작일)는 메타 해제.
      const endIso = dayBeforeIso(todayDate.value)
      await memoryStore.setActiveRest(endIso >= rest.startDate ? { ...rest, untilDate: endIso } : null)
    }
    // 진행 중 ensure(이전 메타로 시작됐을 수 있음)를 비운 뒤 새 ensure 가 새 메타로 자연만료 램프를 강제한다.
    // drain 으로 충분한 이유: ensure 를 fire 하는 watcher 는 loaded 플래그·activeGoal.id 뿐이라 setActiveRest 로 재발화되지 않는다.
    // (향후 activeRest 변화에 ensure 를 묶으면 이 직렬화 가정이 깨지므로 가드를 다시 도입해야 한다.)
    if (ensureInFlight) await ensureInFlight.catch(() => {})
    await ensureSchedule()
    weekOffset.value = 0
    activeDayIndex.value = todayWeekdayIndex.value
    toastStore.success('돌아온 걸 환영해요. 오늘부터 가볍게 다시 시작해요.')
  })
}

// === 조정(다른 날로) 피커 — 이번 주 안 권장, 점유일은 스왑 ===
const rescheduleTarget = ref<ScheduledSession | null>(null)
const rescheduleKeySkip = ref(false) // true=키세션 포기 전 "다른 날로?" 맥락
const rescheduleOpen = computed(() => rescheduleTarget.value !== null)
function openReschedule(session: ScheduledSession, keySkipContext: boolean) {
  rescheduleTarget.value = session
  rescheduleKeySkip.value = keySkipContext
}
function closeReschedule() {
  rescheduleTarget.value = null
  rescheduleKeySkip.value = false
}
const rescheduleCandidates = computed(() => {
  const target = rescheduleTarget.value
  if (!target) return []
  const monday = weekMonday(0) // 이번 주(오늘 주) 안에서 옮긴다
  const todayStr = dateOnly(today.value)
  const out: { date: string; label: string; done: boolean; occupantLabel: string | null; isTarget: boolean; selectable: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    const date = dateOnly(d)
    const done = Boolean(runs.value.find((r) => r.date === date))
    const occs = scheduleStore.sessionsOnDate(date).filter((o) => o.id !== target.id)
    const isTarget = date === target.date
    // 같은 날 더블(#455): 점유 세션을 슬롯과 함께 라벨링(예: "Tempo(오전) + Easy(오후)").
    const occupantLabel = occs.length
      ? occs.map((o) => `${sessionTypeLabel(o.sessionType)}${o.slot === 'AM' ? '(오전)' : o.slot === 'PM' ? '(오후)' : ''}`).join(' + ')
      : null
    // 목적지는 오늘 이후·완료 아님·대상 자신 아님. 이미 더블(2세션)인 날은 3세션 미지원이라 선택 불가.
    const selectable = !done && !isTarget && date >= todayStr && occs.length < 2
    out.push({ date, label: `${WEEKDAY_KO[d.getDay()]} ${d.getDate()}`, done, occupantLabel, isTarget, selectable })
  }
  return out
})
const rescheduleTitle = computed(() =>
  rescheduleTarget.value ? `${sessionTypeLabel(rescheduleTarget.value.sessionType)} 언제로 옮길까요?` : ''
)
async function pickRescheduleDay(date: string) {
  const target = rescheduleTarget.value
  if (!target) return
  const occupant = scheduleStore.sessionOnDate(date)
  // 이미 더블(2세션)인 날로는 옮기지 않는다 — 3세션 미지원(#455 N≥3 보류).
  if (scheduleStore.sessionsOnDate(date).filter((x) => x.id !== target.id).length >= 2) {
    toastStore.error('그 날은 이미 2세션이에요. 같은 날 3세션은 아직 지원하지 않아요.')
    return
  }
  await runScheduleOp(async () => {
    if (occupant && occupant.id !== target.id) {
      const swap = proposeSwap(target, occupant)
      await scheduleStore.reschedule(swap.supersedeIds, swap.drafts)
      toastStore.success(swap.warning || '두 세션의 날짜를 맞바꿨어요.')
    } else {
      const { draft, warning } = proposeReschedule(target, date)
      await scheduleStore.reschedule([target.id], [draft])
      toastStore.success(warning || '일정을 옮겼어요.')
    }
    closeReschedule()
  })
}
async function skipFromRescheduleSheet() {
  // 키세션 포기 맥락에서 "그래도 건너뛰기"
  const target = rescheduleTarget.value
  if (!target) return
  await runScheduleOp(async () => {
    await scheduleStore.skip(target.id)
    closeReschedule()
    toastStore.success('이번 주 이 세션은 건너뛸게요. 회복도 훈련의 일부예요.')
  })
}

// === 주말 트리아지 ===
const weekendTriageData = computed(() =>
  activeGoal.value
    ? weekEndTriage(scheduleStore.sessions.filter((s) => s.goalId === activeGoal.value!.id), today.value)
    : null
)
const triageSaveLabel = computed(() =>
  weekendTriageData.value ? sessionTypeLabel(weekendTriageData.value.saveSession.sessionType) : ''
)
const triageReleaseLabels = computed(() =>
  weekendTriageData.value ? weekendTriageData.value.releaseSessions.map((s) => sessionTypeLabel(s.sessionType)) : []
)
const triageOpen = ref(false)
async function triageSave() {
  const t = weekendTriageData.value
  if (!t) return
  await runScheduleOp(async () => {
    if (t.saveSession.date < dateOnly(today.value)) {
      const { draft } = proposeMoveToToday(t.saveSession, today.value)
      await scheduleStore.reschedule([t.saveSession.id], [draft])
    }
    // 나머지(과거 밀린 것)는 놓아준다 → 백로그 해소로 트리아지 재노출 방지("집중하기"가 안 멈추던 버그).
    for (const s of t.releaseSessions) await scheduleStore.skip(s.id)
    triageOpen.value = false
    toastStore.success(`${sessionTypeLabel(t.saveSession.sessionType)} 하나에 집중해요. 나머지는 놓아줬어요.`)
  })
}
async function triageRelease() {
  const t = weekendTriageData.value
  if (!t) return
  await runScheduleOp(async () => {
    for (const s of t.releaseSessions) await scheduleStore.skip(s.id)
    triageOpen.value = false
    toastStore.success('나머지는 놓아줬어요. 회복도 훈련의 일부예요.')
  })
}

// === 같은 날 더블(#455) ===
// 단일 quality 적응 신호(tempo-ceiling-quality) — 적격 게이트 입력. 없으면 'n/a'.
const qualityAdaptationStatus = computed<CriterionStatus>(
  () => adaptiveProgress.value.criteria.find((c) => c.id === 'tempo-ceiling-quality')?.status ?? 'n/a'
)
const doubleEligibility = computed<DoubleEligibility>(() =>
  evaluateDoubleEligibility({
    memory: memoryStore.memory,
    runs: runs.value,
    qualityAdaptation: qualityAdaptationStatus.value,
    today: today.value
  })
)
// 코치 자동제안 신호(따라잡기 — 주말 트리아지의 자매 갈래). 적격·급성부하·백로그를 라이브러리가 판단.
const doubleSuggestionData = computed(() =>
  buildDoubleSuggestion({
    sessions: scheduleStore.sessions,
    memory: memoryStore.memory,
    runs: runs.value,
    qualityAdaptation: qualityAdaptationStatus.value,
    chronicSpike: chronicLoad.value.status === 'spike',
    today: today.value
  })
)
// 수동 진입(세션 행 '+오후 이지 추가') 노출 조건: 적격 + 오늘/미래 단일 세션이고 PM 여지가 있을 때(결정 D — 미달이면 숨김).
const canAddDoubleForActive = computed(() => {
  const s = activeSession.value
  if (!s || !doubleEligibility.value.eligible) return false
  if (s.slot === 'PM' || s.date < dateOnly(today.value)) return false
  const onDate = scheduleStore.sessionsOnDate(s.date)
  return onDate.length < 2 && !onDate.some((x) => x.slot === 'PM')
})
// 오전 세션에 매칭된 런의 종료시각(ISO). 더블 minGap 동적 안내(#462)의 기준 — 없으면(미수행) 일반 안내.
function amSessionEndAt(am: ScheduledSession | null | undefined): string | null {
  if (!am?.runId) return null
  return runs.value.find((r) => r.id === am.runId)?.endAt ?? null
}
const activeDoubleAmEndAt = computed<string | null>(() => amSessionEndAt(activeSessions.value[0]))
const doublesAddOpen = ref(false)
const doublesAddTarget = ref<ScheduledSession | null>(null)
const doublesAddAmEndAt = computed<string | null>(() => amSessionEndAt(doublesAddTarget.value))
function openDoublesAdd(session: ScheduledSession | null) {
  if (!session) return
  doublesAddTarget.value = session
  doublesAddOpen.value = true
}
async function onDoublesAdd(payload: { durationMin: number }) {
  const am = doublesAddTarget.value
  if (!am) return
  await runScheduleOp(async () => {
    const pmDraft = buildPmEasyDraft({ goalId: am.goalId, date: am.date, phase: am.phase, durationMin: payload.durationMin })
    const created = await scheduleStore.addDouble(am.id, pmDraft)
    doublesAddOpen.value = false
    if (created) toastStore.success('오후 이지 세션을 더블로 추가했어요. 둘째는 천천히 — 최소 5시간 벌려요.')
    else toastStore.error('같은 날 오후 세션이 이미 있어요.')
  })
}
// 더블 패널 행 액션(세션별 조정/포기) — 기존 핸들러 재사용.
function onDoublePanelAction(payload: { session: ScheduledSession; kind: 'reschedule' | 'skip' }) {
  if (payload.kind === 'reschedule') openReschedule(payload.session, false)
  else void onSkipSession(payload.session)
}
async function onSkipSession(s: ScheduledSession) {
  await runScheduleOp(async () => {
    await scheduleStore.skip(s.id)
    toastStore.success('이 세션은 건너뛸게요. 회복도 훈련의 일부예요.')
  })
}

// Pre-Run 의도(#309): 결정론 신호를 조합해 오늘 의도를 만들고 하루 1건 영속한다.
const sessionIntentStore = useSessionIntentStore()
const toastStore = useToastStore()
const intentBusy = ref(false)
const activePlannedIntent = computed(() => sessionIntentStore.activePlannedIntent)
// 오늘 날짜의 planned 의도(브리핑 흡수용) — 최신순 activePlannedIntent가 미래 stale 의도를 집는 것 방지(#398 후속).
const todayPlannedIntent = computed(
  () => sessionIntentStore.intents.find((i) => i.plannedDate === todayDate.value && i.status === 'planned') ?? null
)
const weakestFactorLabel = computed(() => {
  const factors = raceProjection.value?.factors ?? []
  if (!factors.length) return null
  return [...factors].sort((a, b) => a.score - b.score)[0]?.label ?? null
})
function intentArgs(overrideType?: BuildSessionIntentArgs['overrideType']): BuildSessionIntentArgs {
  // 스케줄이 있으면 오늘 의도를 '스케줄 세션'에서 만든다(옛 추천엔진 대신) — 타입·타겟·날짜 정합(#398 후속).
  const s = hasSchedule.value ? activeSession.value : null
  const recommendation: NextSessionRecommendation = s
    ? {
        title: sessionTypeLabel(s.sessionType),
        reason: s.prescription.note || '오늘 계획된 세션을 수행합니다.',
        intensity: '',
        plannedDate: s.date,
        dayName: '',
        injuryAdjusted: false,
        injuryNote: '',
        loadCaution: false,
        loadNote: ''
      }
    : nextSession.value
  return {
    recommendation,
    heartRateModel: {
      easyCeilingBpm: heartRateModel.value.easyCeilingBpm,
      tempoCeilingBpm: heartRateModel.value.tempoCeilingBpm,
      recoveryCeilingBpm: heartRateModel.value.recoveryCeilingBpm
    },
    weakestFactorLabel: weakestFactorLabel.value,
    activeGoalId: activeGoal.value?.id ?? null,
    overrideType: overrideType ?? (s ? s.sessionType : undefined)
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
// 과거 오분류 롱런 라벨 자가치유(로드당 1회·멱등·목표 비종속). runs+memory 로딩 후 1회 돈다.
// 스케줄 reconcile 전에 끝내야 매칭이 교정된 타입을 보고 같은 날 LSD 등으로 올바로 연결된다.
let reinferDone = false
let reinferInFlight: Promise<void> | null = null
// (#235 후속 S3) self-race 부하 제외로 인한 앵커 재수렴 deviation 토스트를 첫 빌드 1회만 억제하는 세션 플래그.
let selfRaceAnchorSettledOnce = false
function reinferRunTypesOnce(): Promise<void> {
  if (!isSupabaseConfigured || reinferDone) return Promise.resolve()
  if (reinferInFlight) return reinferInFlight
  reinferInFlight = runStore
    .reinferMislabeledLongRuns(heartRateModel.value)
    .then(() => {
      reinferDone = true
    })
    .catch(() => {
      // best-effort: 라벨 치유 실패가 대시보드를 막지 않는다.
    })
    .finally(() => {
      reinferInFlight = null
    })
  return reinferInFlight
}
watch(
  () => [runStore.loaded, memoryStore.loaded] as const,
  async () => {
    void ensureTodayIntent()
    await reinferRunTypesOnce()
    void ensureSchedule()
  },
  { immediate: true }
)

// 활성 목표가 바뀌면 그 목표의 스케줄로 교체·재생성(수동 새로고침 불필요, #398 증분3).
// 초기(undefined→id)는 위 loaded-watch가 처리하므로 prev==null은 건너뛴다 — 진짜 '전환'만 반응.
watch(
  () => activeGoal.value?.id ?? null,
  async (id, prev) => {
    if (!id || id === prev || prev == null) return
    await scheduleStore.load(id)
    void ensureSchedule()
  }
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
  expireRestMetaIfOver()
  if (!runStore.loaded && !runStore.loading) {
    void runStore.load()
  }
  if (!memoryStore.loading) {
    void memoryStore.load()
  }
  weatherStore.init()
  void weatherStore.refreshAfterActivation()
}

// 복귀 정리(#473): 복귀 모먼트 창(복귀일+2일)이 지나면 휴식 메타 해제 → 정상 흐름 복귀.
// 단 복귀 램프(Phase 2)가 아직 강제 적용되지 않았으면(returnRampApplied=false) 메타를 보존해, 늦게(복귀일+3 이후)
// 처음 접속해도 자연 만료 램프가 1회 걸리게 한다(F3). 그래도 14일이 지나면 하드캡으로 정리한다.
// doEnsureSchedule(스케줄 게이트)과 분리해 목표 종류·targetDate 무관하게 정리. 과거 rested 세션은 보존(닦달 금지).
function expireRestMetaIfOver() {
  const rest = memoryStore.memory.activeRest
  if (!rest) return
  const daysSinceReturn = diffDaysIso(dateOnly(today.value), dayAfterIso(rest.untilDate))
  if ((rest.returnRampApplied && daysSinceReturn > 2) || daysSinceReturn > 14) {
    void memoryStore.setActiveRest(null)
  }
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
const goalBenchmarkText = computed(() => {
  if (!isPerformanceGoal.value || !raceBenchmarkCoverageText.value) return ''
  const summary = raceBenchmarkSummary.value
  if (raceBenchmarkEvidenceLevel.value === 'multi-benchmark') {
    return `${raceBenchmarkCoverageText.value} · 현재 거리 현주소 비교 가능 ${summary.matchingDistributionReady}개`
  }
  if (raceBenchmarkEvidenceLevel.value === 'single-reference') {
    return `${raceBenchmarkCoverageText.value} · 현재 거리 공식 대회 1개 참고`
  }
  if (summary.matchingDistance > 0) {
    return `${raceBenchmarkCoverageText.value} · 현재 거리 분포 컷 준비 중`
  }
  return `${raceBenchmarkCoverageText.value} · 현재 거리 데이터 없음`
})

function raceBenchmarkBasisText(item: RaceBenchmarkComparison): string {
  const basis = item.snapshot.distributionBasis
  if (!basis) return '원본 참가자 기록은 저장하지 않고 비식별 퍼센타일 컷만 사용합니다.'
  return `${formatInteger(basis.sampleSize)}명 비식별 분포 · ${basis.method}`
}

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
  () => Boolean(trendMetric.value || projectionDetailOpen.value || nextSessionDetailOpen.value),
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
  closeProjectionDetail()
  closeNextSessionDetail()
})

function closeTrend() {
  trendMetric.value = null
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
    <!-- 코치 모먼트(#382): 유의미한 순간에 코치가 먼저 말 건다(우선순위 최상위 1건) -->
    <CoachMomentCard v-if="topCoachMoment" :key="topCoachMoment.key" :moment="topCoachMoment" @dismiss="dismissMoment" @action="onMomentAction" @select="onMomentSelect" />

    <!-- 위크 요약(#362): 이번 주가 뭘 위한 주인지 — 단계·포커스·핵심·볼륨·D-day -->
    <div v-if="hasSchedule && weekSummary" class="week-summary-bar">
      <span class="week-summary-phase">{{ weekSummary.phaseLabel }}</span>
      <span class="week-summary-focus">{{ weekSummary.focusLine }}</span>
      <span class="week-summary-meta"><template v-if="isPerformanceGoal">핵심 {{ weekSummary.keyCount }} · </template>약 {{ weekSummary.weekKm }}km<template v-if="weekSummary.dDayText"> · {{ weekSummary.dDayText }}</template></span>
    </div>

    <!-- 주 단위 네비(월~일 고정 스트립): 지난주·다음주 조망 -->
    <div v-if="hasSchedule" class="week-nav">
      <button type="button" class="week-nav-btn" :disabled="weekOffset <= -8" aria-label="지난 주" @click="navWeek(-1)">◀</button>
      <span class="week-nav-label">{{ weekLabel }}</span>
      <button type="button" class="week-nav-btn" :disabled="weekOffset >= 8" aria-label="다음 주" @click="navWeek(1)">▶</button>
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
          :extra-eval="activeExtraEval"
          :next-line="debriefNextLine"
          :method-slug="activeDoneMethodSlug"
          @open-method="openDoneMethodGlossary"
        />
        <!-- 같은 날 더블(#455): 오전·오후 grouped 패널(2세션) -->
        <SessionDoublePanel
          v-else-if="isActiveDayDouble && (day.state === 'today' || day.state === 'future' || day.state === 'open' || day.state === 'missed')"
          :am-session="activeSessions[0]"
          :pm-session="activeSessions[1]"
          :am-end-at="activeDoubleAmEndAt"
          :busy="intentBusy"
          @action="onDoublePanelAction"
        />
        <!-- 나가기 전: 작전 브리핑 -->
        <SessionBriefingCard
          v-else-if="activeBriefing && (day.state === 'today' || day.state === 'future')"
          :briefing="activeBriefing"
          :session-type="activeSession ? sessionTypeLabel(activeSession.sessionType) : ''"
          :ceiling-text="briefingCeilingText"
          :busy="intentBusy"
          :time-trial="activeSession?.sessionType === 'Race'"
          :method-slug="activeMethodSlug"
          :original-label="activeOriginalLabel"
          :can-add-double="canAddDoubleForActive"
          @acknowledge="onBriefingAck"
          @request-alternative="onBriefingAlternative"
          @start-time-trial="raceOpen = true"
          @open-method="openMethodGlossary"
          @skip="onBriefingSkip"
          @reschedule="onBriefingReschedule"
          @revert="onBriefingRevert"
          @add-double="openDoublesAdd(activeSession)"
        />
        <!-- 안 뛴 날(open/missed)·포기(skipped): 조정 액션 인라인 카드 -->
        <article
          v-else-if="activeOpenSession && (day.state === 'open' || day.state === 'missed' || day.state === 'skipped')"
          class="carousel-card open-card"
        >
          <strong class="carousel-card-title">
            <template v-if="day.state === 'skipped'">🍃 포기한 세션</template>
            <template v-else>⚠ 안 뛴 날</template>
          </strong>
          <p class="carousel-card-line">
            {{ sessionTypeLabel(activeOpenSession.sessionType)
            }}<template v-if="activeOpenSession.prescription.distanceKm"> · {{ activeOpenSession.prescription.distanceKm }}km</template>
          </p>
          <p class="open-card-help">
            <template v-if="day.state === 'skipped'">이번 주 놓아준 세션이에요. 다시 하고 싶으면 다른 날로 등록할 수 있어요.</template>
            <template v-else-if="day.state === 'open'">아직 이번 주 안이라 따라잡을 수 있어요. 어떻게 할까요?</template>
            <template v-else>지난주에 못 한 세션이에요. 다시 시도하거나 놓아줘도 괜찮아요.</template>
          </p>
          <div class="open-card-actions">
            <button type="button" class="open-card-primary" :disabled="intentBusy" @click="onMoveToToday">📥 오늘로 가져오기</button>
            <div class="open-card-row">
              <button type="button" class="open-card-secondary" :disabled="intentBusy" @click="onOpenReschedule">📅 다른 날로</button>
              <button
                v-if="day.state !== 'skipped'"
                type="button"
                class="open-card-secondary open-card-release"
                :disabled="intentBusy"
                @click="onOpenSkip"
              >
                놓아주기
              </button>
            </div>
          </div>
        </article>
        <!-- 선언한 휴식(#473): 차분한 "쉬는 중 · 복귀 D-N" 배너 + 복귀 컨트롤. 경고색·취소선 금지 -->
        <article v-else-if="day.state === 'rested'" class="carousel-card rest-declared-card">
          <strong class="carousel-card-title">💤 쉬는 중</strong>
          <p class="carousel-card-line">
            <template v-if="restState.daysUntilReturn !== null && restState.daysUntilReturn > 0">
              복귀까지 D-{{ restState.daysUntilReturn
              }}<template v-if="restState.returnDate"> · {{ formatDateWithWeekday(restState.returnDate) }}부터 가볍게 시작해요</template>.
            </template>
            <template v-else>돌아올 준비가 되면 언제든 가볍게 시작해요.</template>
          </p>
          <p class="open-card-help">충분히 쉬는 것도 훈련의 일부예요. 일정은 정리해뒀으니 마음 편히 쉬어요.</p>
          <div class="open-card-actions">
            <button type="button" class="open-card-primary" :disabled="intentBusy" @click="returnFromRestNow">▶ 지금 복귀</button>
            <div class="open-card-row">
              <button type="button" class="open-card-secondary" :disabled="intentBusy" @click="openRestAdjust">📅 복귀일 조정</button>
            </div>
          </div>
        </article>
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

    <!-- 스케줄 로딩 중: 옛 히어로 폴백 깜빡임 방지 플레이스홀더(#390) -->
    <div v-else-if="scheduleLoadingPlaceholder" class="schedule-loading">
      <p class="helper">이번 주 코칭 계획을 불러오는 중…</p>
    </div>

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

    <!-- 휴식 선언 진입(#473): 쉬는 중이 아닐 때만. 닦달이 아니라 "필요하면 쓰는 도구"로 차분히 노출. -->
    <button v-if="hasSchedule && !restState.active" type="button" class="rest-declare-entry" @click="openRestSheet">
      💤 한동안 쉬어갈까요?
    </button>

    <SectionGroup title="내 레벨" :surface="false">
      <LevelCard :progress="runnerProgress" :coins="levelStore.coins" hide-eyebrow />
    </SectionGroup>

    <!-- 훈련 단계(주기화 전환)는 성과 목표에만 — 비성과는 단계 개념 없음(#398) -->
    <SectionGroup v-if="isPerformanceGoal" title="훈련 단계" :surface="false">
      <TrainingPhaseCard :summary="adaptiveProgress" @open="phaseModalOpen = true" />
    </SectionGroup>

    <PhaseTransitionModal
      :open="phaseModalOpen"
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

    <QuestPanel v-if="weekMission" :mission="weekMission" />

    <SectionGroup title="한계 도전" :surface="false">
      <button class="stat-card stat-card-interactive" type="button" @click="raceOpen = true">
        <div class="stat-card-data">
          <template v-if="lastRace">
            <strong class="stat-card-value stat-card-text-value">{{ lastRace.distanceKm.toFixed(2) }}km · {{ formatDuration(lastRace.durationSec ?? 0) }}</strong>
            <small>마지막 한계 도전 · {{ formatDateWithWeekday(lastRace.date) }}</small>
          </template>
          <template v-else>
            <strong class="stat-card-value stat-card-text-value">한계 도전으로 체력을 측정해요</strong>
            <small>과거의 나(고스트)와 겨루거나 한계 시험(TT)으로 현재 실력을 갱신하세요. 기록은 등급 승급으로 이어져요.</small>
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

    <!-- 세션 조정(다른 날로) 피커 -->
    <RescheduleSheet
      :open="rescheduleOpen"
      :title="rescheduleTitle"
      :candidates="rescheduleCandidates"
      :key-skip="rescheduleKeySkip"
      :busy="intentBusy"
      @pick="pickRescheduleDay"
      @skip="skipFromRescheduleSheet"
      @close="closeReschedule"
    />

    <!-- 주말 트리아지(키 세션 하나 살리고 나머지 놓아주기) -->
    <WeekendTriageSheet
      :open="triageOpen"
      :save-label="triageSaveLabel"
      :release-labels="triageReleaseLabels"
      :busy="intentBusy"
      @save="triageSave"
      @release="triageRelease"
      @close="triageOpen = false"
    />

    <!-- 같은 날 더블(#455): 오후 이지 추가 시트(적격 카드 + 차단 variant) -->
    <DoublesAddSheet
      :open="doublesAddOpen"
      :am-session="doublesAddTarget"
      :am-end-at="doublesAddAmEndAt"
      :eligibility="doubleEligibility"
      :busy="intentBusy"
      @add="onDoublesAdd"
      @close="doublesAddOpen = false"
    />

    <!-- 휴식 선언(#473): 기간·이유 선택 → declareRest. 부상·날씨·개인 일정 등 범용. -->
    <RestDeclarationSheet :open="restSheetOpen" :today="todayDate" :busy="intentBusy" :preset-reason="restPresetReason" :preset-until="restPresetUntil" @declare="onDeclareRest" @close="restSheetOpen = false" />

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
          <!-- 레이스 예측은 성과 목표에만(비성과는 진행지표가 '이번 주 미션'으로 대체, #398) -->
          <small v-if="isPerformanceGoal" class="dashboard-goal-projection">{{ goalProjectionText }}</small>
          <small v-if="goalBenchmarkText" class="dashboard-goal-projection">{{ goalBenchmarkText }}</small>
          <small v-if="isPerformanceGoal && goalProtectionText" class="dashboard-goal-projection">{{ goalProtectionText }}</small>
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
      <p
        v-if="injuryHypothesisHint"
        class="injury-hypothesis-hint"
        :class="{ 'injury-hypothesis-hint-referral': injuryHypothesisHint.referral }"
      >
        <span class="injury-hypothesis-hint-icon" aria-hidden="true">{{ injuryHypothesisHint.referral ? '⚠' : '🔎' }}</span>
        <span v-if="injuryHypothesisHint.referral">{{ injuryHypothesisHint.text }}</span>
        <span v-else>가능성 <strong>{{ injuryHypothesisHint.possibility }}</strong><template v-if="injuryHypothesisHint.lever"> · 조절 {{ injuryHypothesisHint.lever }}</template></span>
      </p>
    </SectionGroup>

    <SectionGroup title="최근 훈련 흐름" :surface="false">
      <MetricGrid>
        <RunSummaryCard label="이번 달" :value="`${monthDistance}km`" :loading="runDataLoading" interactive @click="trendMetric = 'month'" />
        <RunSummaryCard label="최근 7일" :value="`${last7}km`" :loading="runDataLoading" interactive @click="trendMetric = 'last7'" />
        <RunSummaryCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" :loading="runDataLoading" interactive @click="trendMetric = 'easy'" />
        <RunSummaryCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" :loading="runDataLoading" interactive @click="trendMetric = 'hard'" />
      </MetricGrid>
    </SectionGroup>

    <RecentRuns :runs="runs.slice(0, 5)" :weekly-pattern="memoryStore.memory.weeklyPattern" @show-all="router.push('/runs')" @select="sessionDetailStore.open" />

    <StackPage :open="nextSessionDetailOpen" title="다음 훈련" @close="closeNextSessionDetail">
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
    </StackPage>

    <StackPage :open="!!trendMetric" :title="trendTitle" @close="closeTrend">
      <SectionGroup title="추이">
        <template #actions>
          <small class="helper">{{ trendRuns.length }}개 세션</small>
        </template>
        <TrendChart v-if="trendChartPoints.length" :points="trendChartPoints" unit="km" />
        <EmptyState v-else title="표시할 기록이 없습니다." description="해당 기간의 러닝 기록이 아직 부족합니다." />
      </SectionGroup>
      <SectionGroup v-if="trendRuns.length" title="세션" :surface="false">
        <RunSessionList :runs="trendRuns" :weekly-pattern="memoryStore.memory.weeklyPattern" interactive @select="sessionDetailStore.open" />
      </SectionGroup>
    </StackPage>

    <StackPage :open="projectionDetailOpen && Boolean(raceProjection)" title="목표 예상" @close="closeProjectionDetail">
      <template v-if="raceProjection">
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
        <SectionGroup :title="raceBenchmarkSectionTitle">
          <div class="race-benchmark-overview">
            <strong>{{ raceBenchmarkOverviewTitle }}</strong>
            <span>{{ raceBenchmarkOverviewDescription }}</span>
          </div>
          <div v-if="raceBenchmarkDisplayedCurrentDistanceItems.length" class="race-benchmark-list">
            <article v-for="item in raceBenchmarkDisplayedCurrentDistanceItems" :key="item.snapshot.id" class="race-benchmark-row">
              <div>
                <strong>{{ item.snapshot.eventName }}</strong>
                <small>
                  {{ item.snapshot.year }} · {{ item.snapshot.distanceKm }}km ·
                  {{ raceBenchmarkFreshnessLabel(item.snapshot.freshnessStatus) }} ·
                  {{ raceBenchmarkDistributionLabel(item.snapshot.distributionStatus) }}
                </small>
              </div>
              <span v-if="item.status === 'ready' && item.percentile !== null" class="race-benchmark-status race-benchmark-status-ready">
                {{ raceBenchmarkPointText(item) }}
              </span>
              <span v-else class="race-benchmark-status">컷 준비 중</span>
              <div v-if="item.status === 'ready' && item.segments.length > 1" class="race-benchmark-segments" role="group" aria-label="성별 구간 선택">
                <button
                  v-for="segment in item.segments"
                  :key="segment.segment"
                  type="button"
                  class="race-benchmark-segment"
                  :class="{ 'is-active': isRaceBenchmarkSegmentActive(item, segment.segment) }"
                  :aria-pressed="isRaceBenchmarkSegmentActive(item, segment.segment)"
                  @click="setRaceBenchmarkSegment(item.snapshot.id, segment.segment)"
                >
                  {{ formatRaceBenchmarkSegmentLabel(segment.segment) }}
                </button>
              </div>
              <p>
                {{ item.status === 'ready'
                  ? raceBenchmarkDetailText(item)
                  : '최근 결과 출처는 확보됐고, 비식별 퍼센타일 컷이 준비되면 현재 목표 참고 계산에 사용합니다.' }}
              </p>
              <p v-if="item.status === 'ready'" class="race-benchmark-basis">
                {{ raceBenchmarkBasisText(item) }}
              </p>
            </article>
          </div>
          <p v-else class="helper">
            현재 목표 거리와 바로 맞는 최근 대회 데이터가 아직 없습니다. 국내·해외 주요대회 최신 결과 카탈로그는 유지하고, 거리별 분포 컷이 확보되면 자동으로 비교를 엽니다.
          </p>
        </SectionGroup>
        <SectionGroup v-if="raceBenchmarkOtherDistanceItems.length" title="거리별 카탈로그">
          <div class="race-benchmark-overview">
            <strong>{{ raceBenchmarkCoverageText }}</strong>
            <span>{{ raceBenchmarkCurrentDistanceLabel }} 현주소 계산에는 쓰지 않는 거리입니다. 거리별 데이터 확보 현황만 별도로 보여줍니다.</span>
          </div>
          <div class="race-benchmark-list">
            <article v-for="item in raceBenchmarkOtherDistanceItems" :key="item.snapshot.id" class="race-benchmark-row race-benchmark-row-muted">
              <div>
                <strong>{{ item.snapshot.eventName }}</strong>
                <small>
                  {{ item.snapshot.year }} · {{ item.snapshot.distanceKm }}km ·
                  {{ raceBenchmarkFreshnessLabel(item.snapshot.freshnessStatus) }} ·
                  {{ raceBenchmarkDistributionLabel(item.snapshot.distributionStatus) }}
                </small>
              </div>
              <span class="race-benchmark-status">카탈로그</span>
              <p>현재 목표 거리와 달라 현주소 퍼센타일 계산에서 제외합니다.</p>
            </article>
          </div>
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
      </template>
    </StackPage>

  </PageLayout>
</template>

<style scoped>
/* §5 Phase E: 부상 감별 한 줄 힌트(몸 상태 신호 카드 아래). 진단 아님 — "가능성"만. */
.injury-hypothesis-hint {
  margin: var(--space-2, 8px) 0 0;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: var(--text-info-size, 0.8rem);
  line-height: var(--text-info-line, 1.4);
  color: var(--color-muted);
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button, 10px);
}
.injury-hypothesis-hint strong {
  color: var(--color-text);
  font-weight: 600;
}
.injury-hypothesis-hint-icon {
  flex: none;
}
.injury-hypothesis-hint-referral {
  color: var(--color-warning-text);
  border-color: var(--color-warning-text);
}

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
  min-width: 0;
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
  overflow-wrap: anywhere;
}

/* 주 단위 네비(월~일 고정 스트립의 지난주/다음주 페이징) */
.week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 0;
}
.week-nav-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.week-nav-btn {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-button, 12px);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.2));
  background: var(--color-surface-card);
  color: var(--color-muted);
  box-shadow: none;
  cursor: pointer;
  font-size: 12px;
}
.week-nav-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 안 뛴 날/포기 인라인 카드 액션 */
.open-card-help {
  margin: 0;
  font-size: 12.5px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
}
.open-card-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.open-card-row {
  display: flex;
  gap: 8px;
}
.open-card-primary,
.open-card-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.open-card-primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}
.open-card-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
}
.open-card-release {
  color: var(--color-warning-text, var(--color-muted));
}
.open-card-primary:disabled,
.open-card-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

/* 휴식 선언 진입(#473): 차분한 muted 고스트 — 닦달/강조가 아니라 필요할 때 쓰는 조용한 도구. */
.rest-declare-entry {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  border: 1px dashed var(--color-border, rgba(120, 120, 120, 0.3));
  background: transparent;
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}

.rest-declared-card .open-card-help {
  color: var(--color-muted);
}

.schedule-loading {
  padding: var(--space-5, 24px) var(--space-4, 16px);
  text-align: center;
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
}
.week-summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  min-width: 0;
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
  min-width: 0;
  overflow-wrap: anywhere;
}

.race-benchmark-overview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3, 12px);
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card, 16px);
}

.race-benchmark-overview strong {
  color: var(--color-text);
  font-size: 15px;
}

.race-benchmark-overview span {
  color: var(--color-muted);
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
}

.race-benchmark-list {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2, 8px);
  background: var(--color-surface-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card, 16px);
  overflow: hidden;
}

.race-benchmark-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  padding: var(--space-3, 12px);
  min-width: 0;
}

.race-benchmark-row + .race-benchmark-row {
  border-top: 1px solid var(--color-border);
}

.race-benchmark-row-muted strong,
.race-benchmark-row-muted p {
  color: var(--color-muted);
}

.race-benchmark-row strong,
.race-benchmark-row small,
.race-benchmark-row p {
  min-width: 0;
  overflow-wrap: anywhere;
}

.race-benchmark-row strong {
  display: block;
  color: var(--color-text);
  font-size: 14px;
}

.race-benchmark-row small {
  display: block;
  margin-top: 2px;
  color: var(--color-muted);
  font-size: 12px;
}

.race-benchmark-row p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-info-size, 14px);
  line-height: var(--text-info-line, 1.5);
}

.race-benchmark-status {
  align-self: start;
  padding: 4px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-surface-panel);
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.race-benchmark-status-ready {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.race-benchmark-segments {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.race-benchmark-segment {
  appearance: none;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid var(--color-border);
  background: var(--color-surface-panel);
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.race-benchmark-segment.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
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

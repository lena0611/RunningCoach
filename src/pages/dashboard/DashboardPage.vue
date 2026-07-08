<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { useSessionDetailStore } from '@/app/stores/sessionDetailStore'
import { useToastStore } from '@/app/stores/toastStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useInjuryFlowStore } from '@/app/stores/injuryFlowStore'
import type { RestReason } from '@/entities/training-memory/model'
import type { RunType } from '@/entities/run/model'
import { buildInjuryCoachSignals } from '@/entities/training-memory/injurySignals'
import RecentRuns from '@/widgets/recent-runs/RecentRuns.vue'
import { getEasyRatio, getFatigueWarning, getRunsWithinDays, getTrainingDayView, sumDistance } from '@/shared/lib/runStats'
import { formatDateWithWeekday, formatDuration, formatInteger } from '@/shared/lib/format'
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
import { formatWeatherNumber, weatherSymbolToEmoji } from '@/shared/lib/weather'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import EmptyState from '@/shared/ui/EmptyState.vue'
import MetricGrid from '@/shared/ui/MetricGrid.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import RunSessionList from '@/shared/ui/RunSessionList.vue'
import RunTypeBadge from '@/shared/ui/RunTypeBadge.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import StackPage from '@/shared/ui/StackPage.vue'
import StatCard from '@/shared/ui/StatCard.vue'
import RestDeclarationSheet from '@/pages/coach/RestDeclarationSheet.vue'
import CoachMomentCard from '@/pages/coach/CoachMomentCard.vue'
import { useCoachMoments } from '@/pages/coach/useCoachMoments'
import type { CoachMoment } from '@/shared/lib/coaching/coachMoments'
import HeroIllustration, { type HeroIllustrationTopic } from './HeroIllustration.vue'
import WeekStrip from '@/shared/ui/WeekStrip.vue'
import SegmentTabs, { type SegmentTabValue } from '@/shared/ui/SegmentTabs.vue'
import { useTrainingWeek, dayAfterIso } from './useTrainingWeek'
import type { TrendChartPoint } from '@/shared/ui/TrendChart.vue'

const TrendChart = defineAsyncComponent(() => import('@/shared/ui/TrendChart.vue'))

const runStore = useRunStore()
const memoryStore = useMemoryStore()
const weatherStore = useWeatherStore()
const scheduleStore = useTrainingScheduleStore()
const sessionDetailStore = useSessionDetailStore()
const toastStore = useToastStore()
const router = useRouter()
const trendMetric = ref<'last7' | 'easy' | 'hard' | null>(null)
const projectionDetailOpen = ref(false)

// 훈련 주간 상태(요약 홈 인스턴스 — activeDayIndex 는 항상 오늘에 고정돼 있어 hero=오늘 세션).
const week = useTrainingWeek({
  routePath: '/',
  onRefresh: () => {
    weatherStore.init()
    void weatherStore.refreshAfterActivation()
  }
})
const {
  today,
  todayDate,
  todayWeekdayIndex,
  runs,
  activeGoal,
  activeInjury,
  ageLoadWeight,
  raceProjection,
  nextSession,
  restState,
  weekOffset,
  scheduleDays,
  activeDayIndex,
  hasSchedule,
  isPerformanceGoal,
  scheduleLoadingPlaceholder,
  activeBriefing,
  activeDisplaySession,
  activeDoneRun,
  activeDoneSummary,
  intentBusy,
  runScheduleOp,
  returnFromRestNow
} = week

// CoachInsights(1장): 코치 탭과 동일 모먼트 엔진의 top 1 — 두 탭 간 코치 발화 불일치 방지(useCoachMoments 추출).
const { topCoachMoment, dismissMoment, onMomentSelect } = useCoachMoments(week)
// 시트(트리아지·더블)는 코치 탭 소유 — 그런 액션은 코치 탭으로 이동만 하고 dismiss 하지 않는다(코치 탭에서 실행).
function onDashboardMomentAction(moment: CoachMoment) {
  if (moment.action?.kind === 'open-injury-screening') {
    useInjuryFlowStore().requestScreening()
    dismissMoment(moment.key)
    return
  }
  goCoachTab()
}

const runDataLoading = computed(() => runStore.loading || (!runStore.loaded && !runStore.error))
const memoryDataLoading = computed(() => memoryStore.loading)
const last7 = computed(() => sumDistance(getRunsWithinDays(runs.value, 7, today.value)))
const easyRatio = computed(() => getEasyRatio(getRunsWithinDays(runs.value, 30, today.value)))
// NumbersGrid 평균 심박: 최근 7일 러닝의 avgHeartRate 단순 평균(표시용 뷰 집계 — getRunsWithinDays 재사용).
const avgHeartRate7d = computed(() => {
  const values = getRunsWithinDays(runs.value, 7, today.value)
    .map((run) => run.avgHeartRate)
    .filter((value): value is number => typeof value === 'number' && value > 0)
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
})
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
function setRaceBenchmarkSegment(id: string, segment: SegmentTabValue) {
  raceBenchmarkSegmentSelection.value = { ...raceBenchmarkSegmentSelection.value, [id]: segment as RaceBenchmarkSegmentKey }
}
function raceBenchmarkSegmentItems(item: RaceBenchmarkComparison) {
  return item.segments.map((segment) => ({ value: segment.segment, label: formatRaceBenchmarkSegmentLabel(segment.segment) }))
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

function raceBenchmarkBasisText(item: RaceBenchmarkComparison): string {
  const basis = item.snapshot.distributionBasis
  if (!basis) return '원본 참가자 기록은 저장하지 않고 비식별 퍼센타일 컷만 사용합니다.'
  return `${formatInteger(basis.sampleSize)}명 비식별 분포 · ${basis.method}`
}

// === 휴식 선언/복귀 (#473, SSOT §휴식과 복귀) — 요약 홈 소유(오늘 뭐하지 즉답 원칙) ===
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
    activeDayIndex.value = todayWeekdayIndex.value
    toastStore.success('푹 쉬세요. 일정은 정리해둘게요 — 돌아오면 가볍게 시작해요.')
  })
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
// #352: 오늘/다음 폴백 히어로(스케줄 없음) 뷰(결정론, AI 호출 없음)
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

// 오늘의 처방 히어로(리디자인 ①b): 스케줄이 있으면 오늘 세션 요약(세션명·얼마나(mono)·페이스 + 핵심 한 줄).
const todayHero = computed(() => {
  const s = activeDisplaySession.value
  if (!s) return null
  return {
    title: sessionTypeLabel(s.sessionType),
    sessionType: s.sessionType,
    distanceKm: s.prescription.distanceKm ?? null,
    metaLine: s.prescription.paceRange ?? (s.prescription.durationMin ? `약 ${s.prescription.durationMin}분` : ''),
    keyPoint: activeBriefing.value?.keyPoint ?? ''
  }
})
// 세션 타입 → 히어로 배경 삽화 토픽(디자인 확정 매핑). Steady Long 은 긴 지속주 → lsd(굽은 길+해), 휴식 → recovery(달).
function heroTopicFor(type: RunType | null | undefined): HeroIllustrationTopic {
  switch (type) {
    case 'Tempo':
      return 'tempo'
    case 'LSD':
    case 'Steady Long':
      return 'lsd'
    case 'Recovery':
      return 'recovery'
    case 'Race':
      return 'race'
    default:
      return 'easy'
  }
}
const heroTopic = computed<HeroIllustrationTopic>(() => {
  if (activeDoneRun.value) return heroTopicFor(activeDoneRun.value.type)
  if (hasSchedule.value) return todayHero.value ? heroTopicFor(todayHero.value.sessionType) : 'recovery'
  // 폴백(스케줄 없음): 예정(pending)=easy 톤, 그 외(완료/휴식)=recovery(달).
  return dayView.value.today.state === 'pending' ? 'easy' : 'recovery'
})
function goCoachTab() {
  router.push('/coach')
}

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

const fatigueWarning = computed(() => getFatigueWarning(runs.value, today.value, ageLoadWeight.value))
const volumeWarning = computed(() => fatigueWarning.value.message)
const volumeCaution = computed(() => fatigueWarning.value.caution)

const trendTitle = computed(() => {
  if (trendMetric.value === 'last7') return '최근 7일 거리 추이'
  if (trendMetric.value === 'easy') return '최근 30일 Easy 비율 근거'
  if (trendMetric.value === 'hard') return '최근 7일 강훈련'
  return ''
})

const trendRuns = computed(() => {
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
  () => Boolean(trendMetric.value || projectionDetailOpen.value),
  (open) => {
    document.body.classList.toggle('memory-stack-open', open)
  }
)

onBeforeUnmount(() => {
  document.body.classList.remove('memory-stack-open')
})

onBeforeRouteLeave(() => {
  closeTrend()
  closeProjectionDetail()
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
</script>

<template>
  <PageLayout variant="dashboard">
    <!-- 주간 스트립(리디자인 ①b): 월~일 요일 칩 — 오늘 강조·타입 dot·완료 ✓. 탭하면 코치 탭(주간 캐러셀). -->
    <WeekStrip :days="scheduleDays" :today="todayDate" @select="goCoachTab" />

    <!-- 쉬는 중(#473): 복귀 컨트롤 히어로 — 캐러셀(코치 탭) rested 분기에서 이동(오늘 뭐하지 즉답 원칙) -->
    <article v-if="restState.active" class="hero-card rest-hero hero-topic-recovery">
      <HeroIllustration topic="recovery" />
      <div class="hero-body">
        <section class="day-block">
          <p class="eyebrow today-hero-eyebrow">오늘 · {{ formatDateWithWeekday(todayDate) }}</p>
          <h2>💤 쉬는 중</h2>
          <p class="helper coach-line">
            <template v-if="restState.daysUntilReturn !== null && restState.daysUntilReturn > 0">
              복귀까지 D-{{ restState.daysUntilReturn
              }}<template v-if="restState.returnDate"> · {{ formatDateWithWeekday(restState.returnDate) }}부터 가볍게 시작해요</template>.
            </template>
            <template v-else>돌아올 준비가 되면 언제든 가볍게 시작해요.</template>
          </p>
          <p class="helper">충분히 쉬는 것도 훈련의 일부예요. 일정은 정리해뒀으니 마음 편히 쉬어요.</p>
        </section>
        <div class="hero-actions">
          <button type="button" class="hero-action-primary" :disabled="intentBusy" @click="returnFromRestNow">▶ 지금 복귀</button>
          <button type="button" class="hero-action-secondary" :disabled="intentBusy" @click="openRestAdjust">📅 복귀일 조정</button>
        </div>
      </div>
    </article>

    <!-- 스케줄 로딩 중: 옛 히어로 폴백 깜빡임 방지 플레이스홀더(#390) -->
    <div v-else-if="scheduleLoadingPlaceholder" class="schedule-loading">
      <p class="helper">이번 주 코칭 계획을 불러오는 중…</p>
    </div>

    <!-- 오늘의 처방 히어로(리디자인 ①b): hasSchedule 여부와 무관하게 항상 렌더. 타입 삽화 배경 + 타입 틴트. -->
    <article
      v-else
      class="hero-card hero-card-interactive today-hero"
      :class="`hero-topic-${heroTopic}`"
      role="button"
      tabindex="0"
      @click="goCoachTab"
      @keydown.enter="goCoachTab"
    >
      <HeroIllustration :topic="heroTopic" />
      <div class="hero-body">
        <section class="day-block">
          <p class="eyebrow today-hero-eyebrow">오늘의 처방 · {{ formatDateWithWeekday(todayDate) }}</p>
          <template v-if="hasSchedule">
            <template v-if="activeDoneRun">
              <h2>✅ 오늘 완료</h2>
              <p v-if="activeDoneSummary" class="helper">{{ activeDoneSummary }}</p>
              <p class="helper">디브리핑은 코치 탭에서 확인해요.</p>
            </template>
            <template v-else-if="todayHero">
              <RunTypeBadge :type="todayHero.sessionType" class="today-hero-badge" />
              <h2>
                {{ todayHero.title
                }}<span v-if="todayHero.distanceKm" class="today-hero-distance num-mono">
                  {{ todayHero.distanceKm }}<small>km</small></span
                >
              </h2>
              <p v-if="todayHero.metaLine" class="helper today-hero-meta num-mono">{{ todayHero.metaLine }}</p>
              <p v-if="todayHero.keyPoint" class="helper coach-line">🎯 {{ todayHero.keyPoint }}</p>
            </template>
            <template v-else>
              <h2>🌙 오늘은 휴식</h2>
              <p class="helper">예정 세션이 없어요. 가볍게 풀거나 쉬어가요.</p>
            </template>
          </template>
          <template v-else>
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
          </template>
        </section>

        <section v-if="!hasSchedule && dayView.next" class="day-block day-block-next">
          <p class="eyebrow">다음 훈련</p>
          <p class="next-line">{{ formatDateWithWeekday(dayView.next.date) }} · {{ dayView.next.title }}</p>
        </section>

        <p v-if="heroWeatherLine" class="helper hero-weather-line">
          {{ heroWeatherLine }} · {{ formatDateWithWeekday(todayDate) }} 기준
        </p>

        <!-- 주 CTA: 상세 브리핑(의도·웜업·단계·성공기준)은 코치 탭 작전 카드가 정본 — 그리로 보낸다. -->
        <div v-if="hasSchedule && todayHero && !activeDoneRun" class="hero-actions">
          <button type="button" class="hero-action-primary" @click.stop="goCoachTab">상세 브리핑 보기</button>
        </div>
      </div>
      <svg class="card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </article>

    <!-- 휴식 선언 진입(#473): 쉬는 중이 아닐 때만. 닦달이 아니라 "필요하면 쓰는 도구"로 차분히 노출. -->
    <button v-if="hasSchedule && !restState.active" type="button" class="rest-declare-entry" @click="openRestSheet">
      💤 한동안 쉬어갈까요?
    </button>

    <!-- NumbersGrid(리디자인 ①b): 2×2 — 주간 거리·Easy 비율·강훈련·평균 심박(지표 액센트 dot + 큰 mono 숫자) -->
    <MetricGrid>
      <StatCard label="주간 거리" :value="`${last7}km`" hint="최근 7일" dot :loading="runDataLoading" interactive @click="trendMetric = 'last7'" />
      <StatCard label="Easy 비율" :value="`${easyRatio}%`" hint="최근 30일 · 랩/페이스 기준" dot :loading="runDataLoading" interactive @click="trendMetric = 'easy'" />
      <StatCard label="강훈련" :value="`${hardSessions}회`" hint="최근 7일" dot tone="warning" :loading="runDataLoading" interactive @click="trendMetric = 'hard'" />
      <StatCard label="평균 심박" :value="avgHeartRate7d ? `${avgHeartRate7d}bpm` : '—'" hint="최근 7일" dot tone="accent" :loading="runDataLoading" :value-kind="avgHeartRate7d ? 'metric' : 'text'" />
    </MetricGrid>

    <!-- CoachInsights(1장): 코치 탭과 같은 모먼트 엔진 top 1 — 시트형 액션은 코치 탭으로 이동 -->
    <CoachMomentCard
      v-if="topCoachMoment"
      :key="topCoachMoment.key"
      :moment="topCoachMoment"
      @dismiss="dismissMoment"
      @action="onDashboardMomentAction"
      @select="onMomentSelect"
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

    <RecentRuns :runs="runs.slice(0, 5)" :weekly-pattern="memoryStore.memory.weeklyPattern" @show-all="router.push('/runs')" @select="sessionDetailStore.open" />


    <StackPage :open="!!trendMetric" :title="trendTitle" @close="closeTrend">
      <SectionGroup title="추이">
        <template #actions>
          <small class="helper">{{ trendRuns.length }}개 세션</small>
        </template>
        <TrendChart v-if="trendChartPoints.length" :points="trendChartPoints" unit="km" />
        <EmptyState v-else title="표시할 기록이 없습니다." description="해당 기간의 러닝 기록이 아직 부족합니다." />
      </SectionGroup>
      <SectionGroup v-if="trendRuns.length" title="세션" :surface="false">
        <RunSessionList :runs="trendRuns" :weekly-pattern="memoryStore.memory.weeklyPattern" interactive @select="(run) => sessionDetailStore.open(run, { nested: true })" />
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
              <SegmentTabs
                v-if="item.status === 'ready' && item.segments.length > 1"
                variant="segmented"
                tone="accent"
                aria-label="성별 구간 선택"
                :items="raceBenchmarkSegmentItems(item)"
                :active="raceBenchmarkSelectedSegment(item)?.segment ?? null"
                @change="setRaceBenchmarkSegment(item.snapshot.id, $event)"
              />
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

/* 휴식 선언 진입(#473): 차분한 muted 고스트 — 닦달/강조가 아니라 필요할 때 쓰는 조용한 도구. */
.rest-declare-entry {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  border: 1px dashed var(--color-border, rgba(120, 120, 120, 0.3));
  background: transparent;
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}

.schedule-loading {
  padding: var(--space-5, 24px) var(--space-4, 16px);
  text-align: center;
  background: var(--color-surface-card);
  border-radius: var(--radius-card, 20px);
}

/* #352 → 리디자인 ①b: 오늘의 처방/휴식 히어로 — 타입 틴트 그라디언트 + 삽화 배경(Row5/Row6 확정) */
.today-hero,
.rest-hero {
  --hero-accent: var(--color-primary);
  position: relative;
  overflow: hidden;
  display: block;
  min-height: 0;
  padding: var(--space-4, 16px);
  border: 1px solid color-mix(in srgb, var(--hero-accent) 30%, var(--color-surface-2));
  border-radius: var(--radius-card-lg, 16px);
  background: linear-gradient(150deg, color-mix(in srgb, var(--hero-accent) 13%, transparent), var(--color-surface) 60%);
  box-shadow: none;
}

/* 토픽별 액센트(타입 토큰) — HeroIllustration 색과 동일 매핑 */
.hero-topic-easy {
  --hero-accent: var(--color-primary);
}
.hero-topic-tempo {
  --hero-accent: var(--color-perf);
}
.hero-topic-lsd,
.hero-topic-interval {
  --hero-accent: var(--color-warning);
}
.hero-topic-recovery {
  --hero-accent: var(--color-accent);
}
.hero-topic-race {
  --hero-accent: var(--color-race);
}

.today-hero .today-hero-eyebrow,
.rest-hero .today-hero-eyebrow {
  color: color-mix(in srgb, var(--hero-accent) 78%, var(--color-text));
  font-family: var(--font-mono);
  font-size: var(--text-micro-size);
  letter-spacing: 0.14em;
}

.today-hero h2,
.rest-hero h2 {
  font-size: clamp(23px, 6.4vw, 28px);
  line-height: 1.15;
}

.today-hero-badge {
  width: fit-content;
  margin-top: 2px;
}

.today-hero-distance {
  margin-left: 6px;
  font-weight: 800;
}
.today-hero-distance small {
  margin-left: 2px;
  font-size: 0.55em;
  color: var(--color-muted-2);
}

/* 본문 텍스트는 max-width 로 우하단 삽화와 겹치지 않게(디자인 Row6). 버튼 행은 삽화 위(레이어). */
.today-hero .day-block p,
.rest-hero .day-block p {
  max-width: 250px;
}

.hero-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.day-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.day-block-next {
  padding-top: 12px;
  border-top: 1px solid var(--color-border, rgba(120, 120, 120, 0.2));
}

.coach-line {
  color: var(--color-text);
}

.today-hero-meta {
  font-weight: 700;
  color: var(--color-text);
}

.next-line {
  font-size: var(--text-info-size);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

/* 히어로 액션(수락/바꾸기·복귀 컨트롤) — article 히어로 내부 버튼 행 */
.hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.hero-action-primary,
.hero-action-secondary {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--radius-button, 12px);
  font-size: var(--text-caption-size);
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
.hero-action-primary {
  background: var(--color-primary);
  color: var(--color-on-primary, #fff);
  border: none;
}
.hero-action-secondary {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border, rgba(120, 120, 120, 0.3));
}
.hero-action-primary:disabled,
.hero-action-secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

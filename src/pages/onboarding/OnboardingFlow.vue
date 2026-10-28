<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/app/stores/authStore'
import { useHealthKitSyncStore } from '@/app/stores/healthKitSyncStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useRunStore } from '@/app/stores/runStore'
import { hasNativeBridge } from '@/shared/lib/runtime'
import { skipsHealthKitImport } from '@/shared/api/testAccountRepository'
import {
  answerBelowRecord,
  distanceKeyFromLongestKm,
  summarizeHealthKitPreview,
  weeklyDaysFromPreview
} from '@/features/import-healthkit-run/onboardingImport'
import { goalPlanKey, type TrainingGoal, type TrainingInjuryItem, type TrainingMemory } from '@/entities/training-memory/model'
import { injuryAreaSelectionsFor, summarizeInjuryAreas, type InjurySide } from '@/entities/training-memory/injuryAreas'
import { vdotFromPerformance, vdotFromVo2Max } from '@/shared/lib/vdotPaces'
import { distanceClassFromMeters, gradeBandFromVdot, nextDistanceClass } from '@/shared/lib/level/levelModel'
import { formatDateWithWeekday, formatDuration, formatMonthDay } from '@/shared/lib/format'
import {
  assessGoalFeasibility,
  buildPeriodizedSchedule,
  buildSteadyWeeklyRhythm,
  goalArchetype,
  GOAL_DISTANCE_RECENCY_DAYS,
  minimumGoalWeeklyKm,
  planStartWeeklyKm,
  type GoalFeasibilityInput
} from '@/shared/lib/coaching/periodizedSchedule'
import { earliestFeasibleRaceDate, recommendedRaceDate } from '@/shared/lib/coaching/raceDate'
import { beginnerWalkRunStage } from '@/shared/lib/coaching/beginnerWalkRun'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import { WALK_RUN_SESSION_TYPES } from '@/shared/lib/coaching/walkRunReturn'
import DateField from '@/shared/ui/DateField.vue'

const memoryStore = useMemoryStore()
const levelStore = useLevelStore()
const authStore = useAuthStore()
const healthKitSyncStore = useHealthKitSyncStore()
const runStore = useRunStore()

type DistKey = 'pre' | '5k' | '10k' | 'half' | 'full'
type GoalKey = '5k' | '10k' | 'half' | 'full'
// 목표 종류 = TrainingGoal.category 그대로. 플랜 모양은 goalArchetype 이 가른다(race=주기화, fitness=체중, health=건강·습관).
type GoalType = 'race' | 'health' | 'fitness'

const DIST_M: Record<DistKey, number> = { pre: 0, '5k': 5000, '10k': 10000, half: 21097.5, full: 42195 }
const DIST_LABEL: Record<DistKey, string> = { pre: '아직 레이싱 전', '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }
const GOAL_ORDER: GoalKey[] = ['5k', '10k', 'half', 'full']
const GOAL_KM: Record<GoalKey, number> = { '5k': 5, '10k': 10, half: 21.0975, full: 42.195 }
const GOAL_LABEL: Record<GoalKey, string> = { '5k': '5K', '10k': '10K', half: '하프', full: '풀마라톤' }
/** 대회 거리 기본 선택 — 완주해 본 거리의 다음 거리. */
const NEXT_GOAL: Record<DistKey, GoalKey> = { pre: '5k', '5k': '10k', '10k': 'half', half: 'full', full: 'full' }
const GOAL_TYPES: Array<{ key: GoalType; title: string; help: string }> = [
  { key: 'race', title: '대회·기록', help: '날짜가 있는 목표. 대회일까지 단계별로 쌓아 가는 플랜이에요.' },
  { key: 'health', title: '건강·습관', help: '마감 없이 꾸준히. 편한 강도로 이어 가요.' },
  { key: 'fitness', title: '체중 관리', help: '편한 강도로 오래. 주 1회는 조금 길게 뛰어요.' }
]
const GOAL_TYPE_TITLE: Record<Exclude<GoalType, 'race'>, string> = { health: '건강·습관 러닝', fitness: '체중 관리 러닝' }
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DAY_MS = 86_400_000

// base = 부위 카탈로그 id 의 좌우를 뗀 이름(#878 A3) — 좌우를 골라야 부위별 제한·보강운동·감별 질문이 붙는다.
const INJURY_AREAS = [
  { label: '햄스트링', base: 'hamstring' },
  { label: '무릎', base: 'knee' },
  { label: '족저/발바닥', base: 'plantar-fascia' },
  { label: '아킬레스', base: 'achilles' },
  { label: '종아리', base: 'calf' },
  { label: '장경인대(IT밴드)', base: 'it-band' },
  { label: '정강이', base: 'shin' },
  { label: '발목', base: 'ankle' },
  { label: '고관절/엉덩이', base: 'hip' },
  { label: '허리', base: 'lower-back' },
  { label: '기타', base: '' }
] as const
const INJURY_SIDE_LABEL: Record<InjurySide, string> = { left: '왼쪽', right: '오른쪽', both: '양쪽' }
const SEVERITY_LABEL: Record<number, string> = { 1: '자각 정도', 2: '러닝 후 통증', 3: '러닝 중 통증', 4: '러닝 어려움' }

const form = reactive({
  birthYear: null as number | null,
  sex: 'unknown' as 'male' | 'female' | 'other' | 'unknown',
  experienceMonths: null as number | null,
  maxDistanceKey: 'pre' as DistKey,
  recordMin: null as number | null,
  recordSec: null as number | null,
  goalType: 'race' as GoalType,
  goalKey: '5k' as GoalKey,
  raceDate: null as string | null,
  noRaceDate: false,
  goalMin: null as number | null,
  goalSec: null as number | null,
  weeklyDays: 4,
  hasInjury: false,
  injuryArea: '' as string,
  injurySide: null as InjurySide | null,
  injurySeverity: 2 as number,
  injuryOnset: '' as string
})
/** 거리 칩을 직접 골랐나 — 안 골랐으면 완주 경험이 바뀔 때 기본 거리를 다시 맞춘다. */
let goalKeyPicked = false
/** 목표 id — 예전 고정 id('goal-10k-60')는 개발자 예시에서 온 이름이라 쓰지 않는다(#878 B5). */
const goalId = `goal-${crypto.randomUUID()}`

type StepKey = 'basic' | 'records' | 'distance' | 'goalType' | 'race' | 'routine' | 'preview' | 'reveal'
const step = ref<StepKey>('basic')
const saving = ref(false)
const error = ref('')

// ── 기록 가져오기 단계(#870) ─────────────────────────────────────────────
// 아이폰 앱(HealthKit 브리지)에서만 보인다. HealthKit 차단 테스트 계정도 건너뛴다. 1단계를 넘길 때 정한다.
const recordsEnabled = ref(false)
let recordsDecided = false
/** 'import' = 미리본 기록을 온보딩 마지막에 저장, 'today' = 오늘 이전 러닝은 가져오지 않음, null = 고르지 않음(단계 없음). */
const recordsChoice = ref<'import' | 'today' | null>(null)
const PREVIEW_TIMEOUT_MS = 20_000
let previewTimer: ReturnType<typeof setTimeout> | null = null

// 대회 상세는 대회·기록 목표일 때만. 예전 4·5단계(루틴 편집·훈련 확인)는 저장하지 않는 편집이라 실제 플랜과 달랐다 —
// 실제 생성기로 만든 첫 주 미리보기 한 장으로 바꿨다(#878 B5).
const stepOrder = computed<StepKey[]>(() => [
  'basic',
  ...(recordsEnabled.value ? (['records'] as StepKey[]) : []),
  'distance',
  'goalType',
  ...(form.goalType === 'race' ? (['race'] as StepKey[]) : []),
  'routine',
  'preview'
])
const stepIndex = computed(() => stepOrder.value.indexOf(step.value))

const preview = computed(() => healthKitSyncStore.onboardingPreview)
const previewSummary = computed(() => {
  const p = preview.value
  return p?.status === 'done' && p.candidates.length ? summarizeHealthKitPreview(p.candidates, localTodayIso()) : null
})
const recordsView = computed<'ask' | 'loading' | 'found' | 'empty'>(() => {
  const p = preview.value
  if (!p) return 'ask'
  if (p.status === 'loading') return 'loading'
  return previewSummary.value ? 'found' : 'empty'
})
/** 가져오기로 고른 기록의 요약 — 미리 채우기·어긋남 확인·시작 위치 근거에 쓴다. */
const importedSummary = computed(() => (recordsChoice.value === 'import' ? previewSummary.value : null))
const recordDistanceKey = computed(() => (importedSummary.value ? distanceKeyFromLongestKm(importedSummary.value.longestKm) : null))
/** '아직 레이싱 전'을 골랐는데 기록상 5K 이상을 뛰었다 — 걷기·뛰기부터 시작할지 한 번 묻는다. */
const showRecordConflict = computed(
  () => form.maxDistanceKey === 'pre' && recordDistanceKey.value !== null && answerBelowRecord('pre', recordDistanceKey.value)
)

async function decideRecordsStep() {
  if (recordsDecided) return
  recordsDecided = true
  const userId = authStore.user?.id
  recordsEnabled.value = hasNativeBridge() && !(userId && (await skipsHealthKitImport(userId)))
}

function findRecords() {
  recordsChoice.value = null // 찾으면 다시 '가져오기'가 기본 선택이 되게
  healthKitSyncStore.requestOnboardingPreview()
  if (previewTimer) clearTimeout(previewTimer)
  // 권한 시트에서 오래 머물거나 응답이 끊기면 '찾지 못했어요'로 넘긴다(무한 로딩 금지).
  previewTimer = setTimeout(() => {
    if (healthKitSyncStore.onboardingPreview?.status === 'loading') {
      healthKitSyncStore.onboardingPreview = { status: 'error', candidates: [], error: '응답이 없어요' }
    }
  }, PREVIEW_TIMEOUT_MS)
}

function startFresh() {
  recordsChoice.value = 'today'
  goNext()
}

// 기록을 찾으면 기본 선택은 '가져오기'(추천).
watch(recordsView, (view) => {
  if (view === 'found' && recordsChoice.value === null) recordsChoice.value = 'import'
})

/** 가져오기로 고르면 다음 단계들을 기록으로 미리 채운다(바꿔도 된다). */
function applyRecordsPrefill() {
  const summary = importedSummary.value
  if (!summary) return
  form.maxDistanceKey = distanceKeyFromLongestKm(summary.longestKm)
  const days = weeklyDaysFromPreview(summary)
  if (days) form.weeklyDays = days
}

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

const selfMaxDistanceM = computed(() => DIST_M[form.maxDistanceKey])
const selfDistanceKm = computed(() => selfMaxDistanceM.value / 1000)

const recordSec = computed<number | null>(() => {
  if (form.maxDistanceKey === 'pre') return null
  const total = (form.recordMin ?? 0) * 60 + (form.recordSec ?? 0)
  return total > 0 ? total : null
})

const placementVdot = computed<number | null>(() => {
  if (recordSec.value && selfDistanceKm.value >= 3) {
    const v = vdotFromPerformance(selfDistanceKm.value, recordSec.value)
    if (v !== null) return v
  }
  return vdotFromVo2Max(memoryStore.memory.athleteProfile.vo2Max)
})

const previewClass = computed(() => distanceClassFromMeters(selfMaxDistanceM.value))
const previewNextClass = computed(() => nextDistanceClass(previewClass.value))
const previewGrade = computed(() => gradeBandFromVdot(placementVdot.value))
const previewLabel = computed(() =>
  previewGrade.value ? `${previewClass.value.label} · ${previewGrade.value.label}` : previewClass.value.label
)

// ── 목표와 첫 주 (#878 B5) ───────────────────────────────────────────────
// 플랜은 온보딩이 끝난 뒤 대시보드가 짓는다(#865). 여기서는 **같은 입력·같은 생성기**로 미리 계산해 보여준다 —
// 시작 볼륨(planStartWeeklyKm)·입문 판정(beginnerWalkRunStage)·무리 판정(assessGoalFeasibility)이 대시보드와 같다.
/** 미리보기·추천 기준일 — 온보딩을 연 날. */
const today = new Date()
const todayLocal = localTodayIso()

/** 플랜이 보게 될 기록 — 이미 저장된 런 + 가져오기로 고른 기록(저장은 마지막에 한다). */
const planRuns = computed(() => [
  ...runStore.runs.map((run) => ({ date: run.date, distanceKm: run.distanceKm ?? 0 })),
  ...(recordsChoice.value === 'import' ? (preview.value?.candidates ?? []) : []).map((c) => ({ date: c.date, distanceKm: c.distanceKm ?? 0 }))
])
const selfReportedM = computed(() => selfMaxDistanceM.value || null)
const startWeeklyKm = computed(() => planStartWeeklyKm(planRuns.value, selfReportedM.value, today))
/** 입문(5K 미완주) — 대시보드 entryLevel 과 같은 판정. 플랜은 주 3회 걷기·뛰기, 목표 기록 칸은 숨긴다. */
const entryLevel = computed(() => beginnerWalkRunStage(selfReportedM.value, planRuns.value) !== null)
const recentLongestKm = computed(() => {
  const from = shiftLocalIso(todayLocal, -GOAL_DISTANCE_RECENCY_DAYS)
  return planRuns.value.reduce((max, run) => (run.date.slice(0, 10) >= from ? Math.max(max, run.distanceKm) : max), 0)
})
const planProfile = computed(() => ({ ...memoryStore.memory.athleteProfile, weeklyRunDaysTarget: form.weeklyDays }))

/** 목표 기록 — 걷기·뛰기 단계는 기록보다 완주가 먼저라 받지 않는다. */
const raceTargetSec = computed<number | null>(() => {
  if (entryLevel.value) return null
  const total = (form.goalMin ?? 0) * 60 + (form.goalSec ?? 0)
  return total > 0 ? total : null
})

function buildGoal(targetDate: string | null): TrainingGoal {
  const now = new Date().toISOString()
  const race = form.goalType === 'race'
  const label = GOAL_LABEL[form.goalKey]
  const targetSec = race ? raceTargetSec.value : null
  return {
    id: goalId,
    title: race ? `${label} ${targetSec ? formatDuration(targetSec) : '완주'}` : GOAL_TYPE_TITLE[form.goalType as Exclude<GoalType, 'race'>],
    category: form.goalType,
    startDate: todayLocal,
    targetDate: race ? targetDate : null,
    distanceKm: race ? GOAL_KM[form.goalKey] : null,
    targetDurationSec: targetSec,
    priority: 1,
    status: 'active',
    successCriteria: race ? `${label} 완주${targetSec ? ` — ${formatDuration(targetSec)} 이내` : ''}` : '',
    strategyNotes: '',
    notes: '온보딩에서 정한 목표',
    createdAt: now,
    updatedAt: now
  }
}

function feasibilityInput(goalKey: GoalKey, targetDate: string | null): GoalFeasibilityInput {
  return {
    goal: { ...buildGoal(targetDate), category: 'race', distanceKm: GOAL_KM[goalKey] },
    profile: planProfile.value,
    today,
    currentWeeklyKm: startWeeklyKm.value,
    recentLongestKm: recentLongestKm.value
  }
}

/** 날짜가 아직 없을 때 쓰는 날짜 — 기본 준비 기간(입문은 걷기·뛰기 9주 더), 무리면 안전하게 닿는 날. */
const recommendedDate = computed(() => recommendedRaceDate(feasibilityInput(form.goalKey, null), entryLevel.value))
const raceDateInPast = computed(() => Boolean(form.raceDate && form.raceDate <= todayLocal))
const effectiveRaceDate = computed<string | null>(() => {
  if (form.goalType !== 'race') return null
  if (form.noRaceDate) return recommendedDate.value.date
  return form.raceDate && !raceDateInPast.value ? form.raceDate : null
})
const chosenFeasibility = computed(() =>
  form.goalType === 'race' && !form.noRaceDate && effectiveRaceDate.value
    ? assessGoalFeasibility(feasibilityInput(form.goalKey, effectiveRaceDate.value))
    : null
)
/** 고른 날짜가 지금 체력으로 무리 — 코치 경고(goal-feasibility)와 같은 판정이라 미리 말한다. */
const tooSoon = computed(() => chosenFeasibility.value?.feasible === false)
/** '그대로 할게요'를 골랐다. 거리·날짜를 바꾸면 다시 묻는다. */
const tooSoonAccepted = ref(false)
watch(
  () => [form.goalKey, form.raceDate, form.noRaceDate],
  () => {
    tooSoonAccepted.value = false
  }
)
const postponeOption = computed(() => (tooSoon.value ? earliestFeasibleRaceDate(feasibilityInput(form.goalKey, null)) : null))
/** 같은 날짜에 닿는 더 짧은 거리 중 가장 긴 것 — '거리를 바꿀게요'. */
const shorterGoalOption = computed<GoalKey | null>(() => {
  const date = effectiveRaceDate.value
  if (!tooSoon.value || !date) return null
  const shorter = GOAL_ORDER.slice(0, GOAL_ORDER.indexOf(form.goalKey)).reverse()
  return shorter.find((key) => assessGoalFeasibility(feasibilityInput(key, date)).feasible) ?? null
})
const raceIncomplete = computed(
  () => form.goalType === 'race' && (!effectiveRaceDate.value || (tooSoon.value && !tooSoonAccepted.value))
)
const raceHint = computed(() => {
  if (raceDateInPast.value) return '오늘 이후 날짜를 골라주세요.'
  if (!form.noRaceDate && !form.raceDate) return "대회 날짜를 고르거나, 아직 없으면 '아직 날짜가 없어요'를 켜 주세요."
  return ''
})
const recommendedReason = computed(() => {
  const label = GOAL_LABEL[form.goalKey]
  if (recommendedDate.value.extended) return `지금 주행량에서 안전하게 늘리면 ${label} 준비에 이만큼 걸려요.`
  if (entryLevel.value) {
    return form.goalKey === '5k'
      ? '걷기·뛰기 9주로 쉬지 않고 30분을 뛰게 되면 5K를 뛸 수 있어요.'
      : `걷기·뛰기 9주로 쉬지 않고 30분을 만든 다음 ${label} 준비를 시작해요.`
  }
  return `${label} 초보 플랜의 기본 준비 기간이에요.`
})
/** 코치가 목표를 읽을 때 알아야 할 사정 — 날짜가 임시인지, 빠듯한 걸 알고 골랐는지. */
const goalStrategyNote = computed(() => {
  if (form.goalType !== 'race') return ''
  if (form.noRaceDate) return '대회 날짜 미정 — 기본 준비 기간으로 잡은 임시 날짜다. 대회가 정해지면 날짜를 바꾼다.'
  if (tooSoon.value && tooSoonAccepted.value) {
    return '목표일이 빠듯한 걸 알고 그대로 정했다 — 플랜은 안전한 증가 폭만 쓰므로, 대회는 걷기를 섞어 완주하는 걸 목표로 한다.'
  }
  return ''
})

function pickGoalKey(key: GoalKey) {
  form.goalKey = key
  goalKeyPicked = true
}

/** 첫 주 미리보기 — 대시보드가 온보딩 직후 짓는 플랜과 같은 생성기·같은 입력. */
const previewDrafts = computed(() => {
  const goal = buildGoal(effectiveRaceDate.value)
  const archetype = goalArchetype(goal.category)
  if (archetype === 'performance') {
    return buildPeriodizedSchedule({
      goal,
      profile: planProfile.value,
      today,
      currentWeeklyKm: startWeeklyKm.value,
      entryLevel: entryLevel.value
    })
  }
  return buildSteadyWeeklyRhythm({ archetype, profile: planProfile.value, today, currentWeeklyKm: startWeeklyKm.value, goalId: goal.id })
})
const firstWeekRows = computed(() => {
  const lastDay = shiftLocalIso(todayLocal, 6)
  return previewDrafts.value
    .filter((draft) => draft.date <= lastDay)
    .map((draft, index) => {
      // 걷기·뛰기 회차는 완료한 런 수로 나아간다 — 앞 세션들을 마쳤다고 보고 그 회차를 보여준다(브리핑과 같은 함수).
      const stage = WALK_RUN_SESSION_TYPES.has(draft.sessionType)
        ? beginnerWalkRunStage(selfReportedM.value, [...planRuns.value, ...Array.from({ length: index }, () => ({ distanceKm: 0 }))])
        : null
      const [, month, day] = draft.date.split('-')
      return {
        date: draft.date,
        weekday: WEEKDAYS[new Date(`${draft.date}T12:00:00`).getDay()],
        monthDay: `${Number(month)}/${Number(day)}`,
        title: stage ? `걷기·뛰기 ${stage.week}주차 ${stage.run}회차` : sessionTypeLabel(draft.sessionType),
        detail: stage
          ? `${stage.mainSet} · 앞뒤 걷기 포함 약 ${Math.round(stage.totalMin)}분`
          : [draft.prescription.distanceKm ? `${draft.prescription.distanceKm}km` : '', draft.prescription.note].filter(Boolean).join(' · ')
      }
    })
})
const previewSubtitle = computed(() => {
  const perWeek = `주 ${firstWeekRows.value.length}회`
  if (form.goalType !== 'race') return `${GOAL_TYPE_TITLE[form.goalType]} · 마감 없이 · ${perWeek}`
  const date = effectiveRaceDate.value
  return date ? `${GOAL_LABEL[form.goalKey]} · ${shortDate(date)}까지 ${weeksUntil(date)}주 · ${perWeek}` : perWeek
})

async function next() {
  if (step.value === 'basic') await decideRecordsStep()
  if (step.value === 'records') applyRecordsPrefill()
  if (step.value === 'distance' && !goalKeyPicked) form.goalKey = NEXT_GOAL[form.maxDistanceKey]
  if (step.value === 'race' && raceIncomplete.value) return
  if (step.value === 'routine' && injuryIncomplete.value) return
  goNext()
}
function goNext() {
  step.value = stepOrder.value[stepIndex.value + 1] ?? 'reveal'
}
function back() {
  if (step.value === 'reveal') step.value = stepOrder.value[stepOrder.value.length - 1]
  else if (stepIndex.value > 0) step.value = stepOrder.value[stepIndex.value - 1]
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
/** 기기 시간대 기준 오늘(YYYY-MM-DD). "오늘부터만" 기준일은 UTC 가 아니라 사용자의 오늘이어야 한다. */
function localTodayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftLocalIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysUntil(iso: string) {
  return Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayLocal}T12:00:00`).getTime()) / DAY_MS)
}
/** 고른 날짜까지 몇 주(반올림). 추천 날짜는 일요일로 맞추며 며칠 늘어나므로 내림한 recommendedDate.weeks 를 쓴다. */
function weeksUntil(iso: string) {
  return form.noRaceDate ? recommendedDate.value.weeks : Math.round(daysUntil(iso) / 7)
}
/** "3주 뒤" — 2주 안쪽은 날짜로. */
function relativeLabel(iso: string) {
  const days = daysUntil(iso)
  return days < 14 ? `${days}일 뒤` : `${weeksUntil(iso)}주 뒤`
}
function shortDate(iso: string) {
  return formatMonthDay(iso, true)
}

const injuryAreaOption = computed(() => INJURY_AREAS.find((area) => area.label === form.injuryArea) ?? null)
/** 좌우를 물어야 하는 부위인가 — 허리·기타는 묻지 않는다. */
const injuryNeedsSide = computed(() => {
  const base = injuryAreaOption.value?.base
  return Boolean(base) && injuryAreaSelectionsFor(base!, null, null).length === 0
})
const injuryAreaSelections = computed(() => {
  const base = injuryAreaOption.value?.base
  return base ? injuryAreaSelectionsFor(base, form.injurySide, form.injurySeverity) : []
})
/** 부상 있음인데 부위(·좌우)를 안 골랐으면 다음으로 못 간다 — 예전엔 기본값 '햄스트링'이 그대로 저장됐다. */
const injuryIncomplete = computed(() =>
  form.hasInjury && (!injuryAreaOption.value || (injuryNeedsSide.value && !form.injurySide))
)

function buildInjuryItem(): TrainingInjuryItem {
  // 부위 심각도는 painLevel 에서 파생된다(deriveInjurySeverity) — 온보딩 심각도를 부위에도 실어 같은 값이 되게 한다.
  const summary = summarizeInjuryAreas(injuryAreaSelections.value) || '기타 부위'
  return {
    title: `${summary} (온보딩 신고)`,
    area: summary,
    normalizedAreas: injuryAreaSelections.value,
    status: 'active',
    severity: form.injurySeverity,
    onsetDate: form.injuryOnset || null,
    returnToRunCriteria: ''
  } as unknown as TrainingInjuryItem
}

async function persist(placed: boolean) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    // 기록 가져오기(#870): 플랜을 짓기 전에(아래 complete 가 짓는 신호다) 고른 대로 저장한다.
    // 건너뛰기면 고르지 않은 것으로 보고 미리본 것도 버린다 — 온보딩이 끝나면 평소 자동 동기화가 돈다.
    if (placed && recordsChoice.value === 'import') await healthKitSyncStore.importOnboardingPreview()
    else healthKitSyncStore.clearOnboardingPreview()
    if (placed) {
      const memory: TrainingMemory = JSON.parse(JSON.stringify(memoryStore.memory))
      if (recordsChoice.value === 'today') memory.healthKitImportFrom = localTodayIso()
      memory.athleteProfile.birthYear = form.birthYear
      memory.athleteProfile.sex = form.sex
      memory.athleteProfile.runningExperienceMonths = form.experienceMonths
      memory.athleteProfile.weeklyRunDaysTarget = form.weeklyDays
      if (recordSec.value && selfDistanceKm.value > 0) {
        memory.athleteProfile.personalBests = [
          ...(memory.athleteProfile.personalBests ?? []),
          { distanceKm: selfDistanceKm.value, durationSec: recordSec.value, date: todayIso(), source: 'estimated' }
        ]
      }
      // 목표는 미리보기에 쓴 것 그대로 — 첫 자리(빈 메모리의 '목표 미설정')를 바꾸고 활성으로 둔다.
      const goal: TrainingGoal = {
        ...buildGoal(effectiveRaceDate.value),
        strategyNotes: goalStrategyNote.value,
        // '그대로 할게요'(빠듯한 날짜를 알고 정함)는 코치 무리 카드가 같은 날짜·거리 동안 다시 묻지 않게 남긴다(#886).
        feasibilityAcceptedFor: tooSoon.value && tooSoonAccepted.value ? goalPlanKey(buildGoal(effectiveRaceDate.value)) : null
      }
      memory.goals = [goal, ...(memory.goals ?? []).slice(1)]
      memory.activeGoalId = goal.id
      memory.goal = goal.title

      // 주간 루틴의 정본은 목표로 생성되는 주기화 플랜(training_schedule), 세션별 실행 지침은 sessionBriefing 이 갖는다.
      // 온보딩은 처방을 따로 저장하지 않는다(2026-09-07) — 첫 주 미리보기도 같은 생성기로 계산만 한다.

      // #331: 부상 심화 입력 → 구조화 TrainingInjuryItem
      if (form.hasInjury) {
        memory.injuryItems = [...(memory.injuryItems ?? []), buildInjuryItem()]
      }

      await memoryStore.update(memory)
    }
    await levelStore.complete({
      self_reported_max_distance_m: placed ? selfMaxDistanceM.value || null : null,
      self_reported_vdot: placed ? placementVdot.value : null
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '저장에 실패했어요. 잠시 후 다시 시도해주세요.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="onboarding" role="dialog" aria-modal="true" aria-label="시작 인터뷰">
    <div class="onboarding-card">
      <header class="onboarding-head">
        <div class="onboarding-dots" v-if="step !== 'reveal'">
          <span v-for="(key, index) in stepOrder" :key="key" :class="{ on: index <= stepIndex }" />
        </div>
        <button v-if="step !== 'reveal'" class="onboarding-skip" type="button" :disabled="saving" @click="persist(false)">
          건너뛰기
        </button>
      </header>

      <!-- 기본 -->
      <section v-if="step === 'basic'" class="onboarding-step">
        <h2>나를 알려주세요</h2>
        <p class="onboarding-help">레벨을 정확히 잡기 위한 기본 정보예요.</p>
        <label class="field">
          <span>출생연도</span>
          <input v-model.number="form.birthYear" type="number" inputmode="numeric" placeholder="예: 1992" />
        </label>
        <label class="field">
          <span>성별</span>
          <select v-model="form.sex">
            <option value="unknown">선택 안 함</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
            <option value="other">기타</option>
          </select>
        </label>
        <label class="field">
          <span>러닝 경력 (개월)</span>
          <input v-model.number="form.experienceMonths" type="number" inputmode="numeric" placeholder="예: 18" />
        </label>
      </section>

      <!-- 기록 가져오기(#870): 아이폰 앱에서만. 조회는 미리보기이고 저장은 온보딩 마지막에 한다. -->
      <section v-else-if="step === 'records'" class="onboarding-step">
        <template v-if="recordsView === 'ask'">
          <h2>지금까지 뛴 기록이 있나요?</h2>
          <p class="onboarding-help">아이폰 건강 앱에 러닝 기록이 있으면 가져와서, 처음부터 내 몸에 맞는 강도로 시작해요.</p>
          <div class="records-box">
            <span class="records-box-label">가져오는 것</span>
            <span>러닝 운동 — 거리·시간·페이스</span>
            <span>심박·케이던스</span>
            <span>경로(지도)</span>
            <small class="onboarding-help">몇 개가 있는지 먼저 보여드리고, 가져올지는 그다음에 골라요.</small>
          </div>
          <div class="records-actions">
            <button class="primary" type="button" @click="findRecords">건강 앱에서 찾아보기</button>
            <button class="ghost" type="button" @click="startFresh">아직 뛴 기록이 없어요</button>
          </div>
        </template>

        <template v-else-if="recordsView === 'loading'">
          <h2>건강 앱에서 찾는 중…</h2>
          <p class="onboarding-help">권한을 묻는 창이 뜨면 '운동'과 '운동 경로'를 허용해 주세요.</p>
        </template>

        <template v-else-if="recordsView === 'found' && previewSummary">
          <h2>최근 90일 러닝을 {{ previewSummary.count }}개 찾았어요</h2>
          <p class="onboarding-help">아직 아무것도 저장하지 않았어요.</p>
          <div class="records-grid">
            <div class="records-stat">
              <span>기간</span>
              <strong>{{ previewSummary.firstDate?.slice(5).replace('-', '/') }} ~ {{ previewSummary.lastDate?.slice(5).replace('-', '/') }}</strong>
            </div>
            <div class="records-stat">
              <span>가장 긴 러닝</span>
              <strong>{{ previewSummary.longestKm }}km</strong>
            </div>
            <div class="records-stat">
              <span>최근 4주 평균</span>
              <strong>{{ previewSummary.recentRunsPerWeek > 0 ? `주 ${previewSummary.recentKmPerWeek}km · ${Math.round(previewSummary.recentRunsPerWeek)}회` : '기록 없음' }}</strong>
            </div>
            <div class="records-stat">
              <span>마지막 러닝</span>
              <strong>{{ previewSummary.daysSinceLast === 0 ? '오늘' : `${previewSummary.daysSinceLast}일 전` }}</strong>
            </div>
          </div>
          <div class="choice-list" role="radiogroup" aria-label="기록을 어떻게 할까요">
            <button
              type="button"
              role="radio"
              class="choice-card"
              :class="{ on: recordsChoice === 'import' }"
              :aria-checked="recordsChoice === 'import'"
              @click="recordsChoice = 'import'"
            >
              <strong>이 기록 가져오기 <span class="choice-badge">추천</span></strong>
              <span>시작 강도를 이 기록에 맞춰요. 기록·추세 탭에도 바로 보여요.</span>
            </button>
            <button
              type="button"
              role="radio"
              class="choice-card"
              :class="{ on: recordsChoice === 'today' }"
              :aria-checked="recordsChoice === 'today'"
              @click="recordsChoice = 'today'"
            >
              <strong>오늘부터 뛴 것만</strong>
              <span>지금까지 기록은 가져오지 않아요. 오늘 이후 러닝만 들어와요.</span>
            </button>
          </div>
        </template>

        <template v-else>
          <h2>최근 90일 러닝을 찾지 못했어요</h2>
          <p class="onboarding-help">둘 중 하나예요. iOS 는 어느 쪽인지 알려주지 않아요.</p>
          <div class="records-box">
            <strong>아직 아이폰으로 뛴 기록이 없어요</strong>
            <small class="onboarding-help">처음부터 시작하면 돼요. 걷기·뛰기부터 차근차근 안내할게요.</small>
          </div>
          <div class="records-box">
            <strong>건강 앱에서 '운동' 읽기를 꺼 두었어요</strong>
            <small class="onboarding-help">설정 › 건강 › 데이터 접근 및 기기 › PaceLAB 에서 '운동'과 '운동 경로'를 켠 뒤 다시 찾아보세요.</small>
          </div>
          <div class="records-actions">
            <button class="primary" type="button" @click="startFresh">처음부터 시작할게요</button>
            <button class="ghost" type="button" @click="findRecords">켜고 다시 찾아보기</button>
          </div>
        </template>
      </section>

      <!-- 완주 경험 + 기록 -->
      <section v-else-if="step === 'distance'" class="onboarding-step">
        <h2>완주해본 가장 긴 거리는?</h2>
        <p class="onboarding-help">거리 클래스(전직)를 정합니다. 영구 해금이라 줄어들지 않아요.</p>
        <div class="chip-grid">
          <button
            v-for="key in (['pre','5k','10k','half','full'] as DistKey[])"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: form.maxDistanceKey === key }"
            @click="form.maxDistanceKey = key"
          >
            {{ DIST_LABEL[key] }}
          </button>
        </div>
        <small v-if="importedSummary" class="onboarding-help">
          기록상 가장 긴 러닝 {{ importedSummary.longestKm }}km · {{ importedSummary.longestDate?.slice(5).replace('-', '/') }} — 기록으로 미리 골라 두었어요. 바꿔도 돼요.
        </small>
        <div v-if="showRecordConflict && importedSummary" class="records-conflict" role="status">
          <strong>기록을 보니 이미 {{ importedSummary.longestKm }}km를 뛰셨어요</strong>
          <span>'레이싱 전'으로 시작하면 걷기·뛰기 1주차부터예요. 지금 기록이면 그보다 위에서 시작하는 게 맞아 보여요.</span>
          <button class="primary" type="button" @click="form.maxDistanceKey = recordDistanceKey ?? 'pre'">기록 기준으로 시작 (추천)</button>
          <button class="ghost" type="button" @click="recordsChoice = 'today'">그래도 걷기·뛰기부터 — 지금까지 기록은 안 가져와요</button>
        </div>
        <div v-if="form.maxDistanceKey !== 'pre'" class="record-row">
          <span class="field-label">{{ DIST_LABEL[form.maxDistanceKey] }} 기록 (선택)</span>
          <div class="record-inputs">
            <input v-model.number="form.recordMin" type="number" inputmode="numeric" placeholder="분" />
            <span>:</span>
            <input v-model.number="form.recordSec" type="number" inputmode="numeric" placeholder="초" />
          </div>
          <small class="onboarding-help">기록을 넣으면 등급이 정확해져요(없으면 추정).</small>
        </div>
      </section>

      <!-- 목표 종류 (#878 B5) -->
      <section v-else-if="step === 'goalType'" class="onboarding-step">
        <h2>무엇을 위해 뛰나요?</h2>
        <p class="onboarding-help">플랜 모양이 달라져요. 나중에 기억 탭에서 바꿀 수 있어요.</p>
        <div class="choice-list" role="radiogroup" aria-label="목표 종류">
          <button
            v-for="option in GOAL_TYPES"
            :key="option.key"
            type="button"
            role="radio"
            class="choice-card"
            :class="{ on: form.goalType === option.key }"
            :aria-checked="form.goalType === option.key"
            @click="form.goalType = option.key"
          >
            <strong>{{ option.title }}</strong>
            <span>{{ option.help }}</span>
          </button>
        </div>
      </section>

      <!-- 대회 상세 (#878 B5): 날짜가 없으면 추천 날짜, 무리면 솔직하게 -->
      <section v-else-if="step === 'race'" class="onboarding-step">
        <h2>어떤 대회를 준비하나요?</h2>
        <span class="field-label">거리</span>
        <div class="chip-grid">
          <button
            v-for="key in GOAL_ORDER"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: form.goalKey === key }"
            :aria-pressed="form.goalKey === key"
            @click="pickGoalKey(key)"
          >
            {{ GOAL_LABEL[key] }}
          </button>
        </div>

        <template v-if="!form.noRaceDate">
          <DateField v-model="form.raceDate" class="field" label="대회 날짜" placeholder="날짜 선택" />
          <small v-if="effectiveRaceDate" class="onboarding-help">{{ relativeLabel(effectiveRaceDate) }} · 대회일에 맞춰 단계를 나눠요</small>
        </template>
        <div class="field field-row">
          <span id="onboarding-no-date-label">아직 날짜가 없어요</span>
          <button
            class="switch-control"
            :class="{ on: form.noRaceDate }"
            type="button"
            role="switch"
            aria-labelledby="onboarding-no-date-label"
            :aria-checked="form.noRaceDate"
            @click="form.noRaceDate = !form.noRaceDate"
          >
            <span />
          </button>
        </div>
        <small v-if="raceHint" class="onboarding-help" role="status">{{ raceHint }}</small>

        <div v-if="form.noRaceDate" class="goal-box" role="status">
          <span class="goal-box-label">이 날짜를 목표로 플랜을 짤게요</span>
          <strong>{{ formatDateWithWeekday(recommendedDate.date) }} · {{ recommendedDate.weeks }}주 뒤</strong>
          <span>{{ recommendedReason }} 대회가 정해지면 기억 탭에서 날짜만 바꾸면 돼요.</span>
        </div>

        <div v-if="tooSoon && !tooSoonAccepted && effectiveRaceDate" class="records-conflict" role="status">
          <strong>{{ relativeLabel(effectiveRaceDate) }} {{ GOAL_LABEL[form.goalKey] }} 대회는 지금 몸으로는 무리예요</strong>
          <span>
            <template v-if="startWeeklyKm">지금은 주 {{ Math.round(startWeeklyKm) }}km예요. </template>
            {{ GOAL_LABEL[form.goalKey] }} 완주 준비엔 주 {{ Math.round(minimumGoalWeeklyKm(GOAL_KM[form.goalKey])) }}km 안팎이 필요해요.
            <template v-if="postponeOption">한 주에 안전하게 늘릴 수 있는 만큼 늘리면 {{ postponeOption.weeks }}주쯤 걸려요.</template>
          </span>
          <button v-if="postponeOption" class="primary" type="button" @click="form.raceDate = postponeOption.date">
            {{ shortDate(postponeOption.date) }}로 미루기 (추천)
          </button>
          <button v-if="shorterGoalOption" class="ghost" type="button" @click="pickGoalKey(shorterGoalOption)">
            이 날짜에 {{ GOAL_LABEL[shorterGoalOption] }}로 바꿀게요
          </button>
          <button class="ghost" type="button" @click="tooSoonAccepted = true">그대로 할게요</button>
          <small>'그대로'를 골라도 플랜은 한 주에 안전하게 늘릴 수 있는 만큼만 늘려요. 대회 날엔 걷기를 섞어 완주하는 걸 목표로 잡아요.</small>
        </div>
        <small v-else-if="tooSoon && tooSoonAccepted" class="onboarding-help" role="status">
          빠듯한 날짜로 가요 — 플랜은 안전한 폭으로만 늘리고, 대회 날엔 걷기를 섞어 완주를 노려요.
        </small>

        <div v-if="!entryLevel" class="record-row">
          <span class="field-label">목표 기록 (선택)</span>
          <div class="record-inputs">
            <input v-model.number="form.goalMin" type="number" inputmode="numeric" placeholder="분" aria-label="목표 기록 분" />
            <span>:</span>
            <input v-model.number="form.goalSec" type="number" inputmode="numeric" placeholder="초" aria-label="목표 기록 초" />
          </div>
          <small class="onboarding-help">비워 두면 완주가 목표예요.</small>
        </div>
        <small v-else class="onboarding-help">걷기·뛰기 단계에선 기록보다 완주가 먼저라, 목표 기록은 5K를 뛰고 나서 정해요.</small>
      </section>

      <!-- 지금 루틴 + 부상 심화 -->
      <section v-else-if="step === 'routine'" class="onboarding-step">
        <h2>지금 루틴과 몸 상태</h2>
        <p class="onboarding-help">주 횟수는 플랜에, 부상은 세션 강도에 반영돼요.</p>
        <label class="field">
          <span>주간 러닝 목표 (회/주)</span>
          <input v-model.number="form.weeklyDays" type="number" inputmode="numeric" min="1" max="7" />
        </label>
        <small v-if="entryLevel" class="onboarding-help">걷기·뛰기 단계는 주 3회로 시작해요 — 사이사이 쉬는 날을 둬요.</small>
        <!-- 체크박스는 전역 input 스타일(폭 100%·높이 48px)에 늘어나 회색 막대로 보였다(#866) — 앱의 켬/끔 스위치로 -->
        <div class="field field-row">
          <span id="onboarding-injury-label">현재 관리 중인 부상이 있나요?</span>
          <button
            class="switch-control"
            :class="{ on: form.hasInjury }"
            type="button"
            role="switch"
            aria-labelledby="onboarding-injury-label"
            :aria-checked="form.hasInjury"
            @click="form.hasInjury = !form.hasInjury"
          >
            <span />
          </button>
        </div>
        <div v-if="form.hasInjury" class="injury-detail">
          <label class="field">
            <span>부위</span>
            <select v-model="form.injuryArea" @change="form.injurySide = null">
              <option value="" disabled>부위를 골라주세요</option>
              <option v-for="area in INJURY_AREAS" :key="area.label" :value="area.label">{{ area.label }}</option>
            </select>
          </label>
          <template v-if="injuryNeedsSide">
            <span class="field-label">어느 쪽인가요?</span>
            <div class="chip-grid">
              <button
                v-for="side in (['left', 'right', 'both'] as InjurySide[])"
                :key="side"
                type="button"
                class="chip"
                :class="{ on: form.injurySide === side }"
                :aria-pressed="form.injurySide === side"
                @click="form.injurySide = side"
              >
                {{ INJURY_SIDE_LABEL[side] }}
              </button>
            </div>
          </template>
          <span class="field-label">심각도</span>
          <div class="chip-grid">
            <button
              v-for="level in ([1,2,3,4] as number[])"
              :key="level"
              type="button"
              class="chip"
              :class="{ on: form.injurySeverity === level }"
              @click="form.injurySeverity = level"
            >
              {{ level }}. {{ SEVERITY_LABEL[level] }}
            </button>
          </div>
          <label class="field">
            <span>언제부터인가요? (선택)</span>
            <input v-model="form.injuryOnset" type="date" />
          </label>
          <small class="onboarding-help">부상 정보는 세션마다 강도를 자동으로 낮춰요.</small>
          <small v-if="injuryIncomplete" class="onboarding-help" role="status">
            {{ injuryAreaOption ? '어느 쪽인지 골라주세요.' : '부위를 골라주세요.' }}
          </small>
        </div>
      </section>

      <!-- 첫 주 미리보기 (#878 B5): 대시보드가 짓는 플랜과 같은 생성기·같은 입력. 편집은 시작한 뒤에. -->
      <section v-else-if="step === 'preview'" class="onboarding-step">
        <h2>첫 주는 이렇게 시작해요</h2>
        <p class="onboarding-help">{{ previewSubtitle }}</p>
        <ul v-if="firstWeekRows.length" class="week-list">
          <li v-for="row in firstWeekRows" :key="row.date" class="week-row">
            <span class="week-day">
              <strong>{{ row.weekday }}</strong>
              <small>{{ row.monthDay }}</small>
            </span>
            <span class="week-body">
              <strong>{{ row.title }}</strong>
              <span>{{ row.detail }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="onboarding-help">이번 주에 잡힌 훈련이 없어요. 다음 주부터 시작해요.</p>
        <p class="onboarding-help">실제로 만들어질 플랜의 첫 주예요. 시작한 뒤에도 날짜를 옮기거나 다른 훈련으로 바꿀 수 있어요.</p>
        <p v-if="form.hasInjury" class="onboarding-help">부상이 있어서 세션마다 통증에 맞춰 강도를 낮춰 안내해요.</p>
      </section>

      <!-- reveal: 시작 배치 -->
      <section v-else class="onboarding-step onboarding-reveal">
        <p class="reveal-eyebrow">🎉 시작 위치</p>
        <div class="reveal-badge">{{ previewLabel }}</div>
        <!-- 가져온 기록이 클래스를 받쳐 주면 이미 GPS 로 확인된 것이다(#870) -->
        <p v-if="!importedSummary || answerBelowRecord(recordDistanceKey ?? 'pre', form.maxDistanceKey)" class="reveal-tentative">(잠정 · GPS 주행으로 완주하면 인증됩니다)</p>
        <p v-if="placementVdot" class="onboarding-help">VDOT {{ placementVdot }} 기준</p>
        <p v-else class="onboarding-help">기록/VO2max가 쌓이면 등급이 잡혀요.</p>
        <p v-if="previewNextClass" class="reveal-next">다음 목표: {{ previewNextClass.label }} 🔒</p>
        <p v-if="importedSummary" class="reveal-basis">
          가져온 기록 {{ importedSummary.count }}개 기준 ·
          <template v-if="importedSummary.daysSinceLast !== null && importedSummary.daysSinceLast > 28">마지막 러닝이 {{ importedSummary.daysSinceLast }}일 전이라 쉰 만큼 낮춰서 시작해요.</template>
          <template v-else>최근 4주 기록에 맞춰 첫 플랜을 짜요.</template>
        </p>
        <p v-else-if="recordsChoice === 'today'" class="reveal-basis">지금까지 기록은 가져오지 않고, 온보딩 답으로 첫 플랜을 짜요.</p>
      </section>

      <p v-if="error" class="onboarding-error">{{ error }}</p>

      <footer class="onboarding-foot">
        <button v-if="step !== 'basic'" class="ghost" type="button" :disabled="saving" @click="back">이전</button>
        <button
          v-if="step !== 'reveal' && (step !== 'records' || recordsView === 'found')"
          class="primary"
          type="button"
          :disabled="saving || (step === 'race' && raceIncomplete) || (step === 'routine' && injuryIncomplete)"
          @click="next"
        >
          다음
        </button>
        <button v-else-if="step === 'reveal'" class="primary" type="button" :disabled="saving" @click="persist(true)">
          {{ saving ? '저장 중…' : '시작하기' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--color-surface, #0c0d10);
  overflow-y: auto;
}

.onboarding-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.onboarding-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

.onboarding-dots {
  display: flex;
  gap: 6px;
}

.onboarding-dots span {
  width: 14px;
  height: 6px;
  border-radius: 999px;
  background: rgba(120, 120, 120, 0.3);
}

.onboarding-dots span.on {
  background: var(--color-primary);
}

.onboarding-skip {
  background: none;
  border: none;
  color: var(--color-muted);
  font-size: var(--text-caption-size);
  cursor: pointer;
}

.onboarding-step {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.onboarding-step h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.onboarding-help {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text);
}

.field-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.field input[type='number'],
.field input[type='text'],
.field input[type='date'],
.field select {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 16px;
}

.field-label {
  font-size: 14px;
  color: var(--color-text);
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}

.record-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.record-inputs input {
  width: 80px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
  color: var(--color-text);
  font-size: 16px;
  text-align: center;
}

.injury-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-card, 16px);
  border: 1px solid rgba(120, 120, 120, 0.3);
  background: var(--color-surface-card);
}

.onboarding-reveal {
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 24px 0;
}

.reveal-eyebrow {
  font-size: 14px;
  color: var(--color-muted);
  margin: 0;
}

.reveal-badge {
  font-size: 26px;
  font-weight: 800;
  color: var(--color-primary);
  padding: 14px 22px;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-card, 20px);
}

.reveal-tentative {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 0;
}

.reveal-next {
  font-size: 14px;
  color: var(--color-text);
  margin-top: 6px;
}

.records-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--color-surface-2);
  font-size: var(--text-info-size);
  color: var(--color-text);
}

.records-box-label {
  font-size: var(--text-caption-size);
  font-weight: 700;
  color: var(--color-muted);
}

.records-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.records-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.records-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface-2);
}

.records-stat span {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
}

.records-stat strong {
  font-size: var(--text-info-size);
  color: var(--color-text);
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 전역 button 기본(그라디언트·그림자·높이)을 지우고 카드형 선택지로 쓴다(ui-system-contract 커스텀 버튼 규칙). */
.choice-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 14px;
  border: 2px solid var(--color-border-strong);
  border-radius: 14px;
  background: var(--color-surface-2);
  box-shadow: none;
  text-shadow: none;
  color: var(--color-text);
  text-align: left;
}

.choice-card.on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.choice-card strong {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-info-size);
}

.choice-card span {
  font-size: var(--text-caption-size);
  font-weight: 400;
  color: var(--color-muted);
}

.choice-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-on-primary) !important;
  font-size: var(--text-micro-size) !important;
  font-weight: 700 !important;
}

.records-conflict {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-text);
}

.records-conflict span {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.records-conflict small {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.goal-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 14px;
  background: var(--color-surface-2);
  color: var(--color-text);
}

.goal-box-label {
  font-size: var(--text-caption-size);
  font-weight: 700;
  color: var(--color-muted);
}

.goal-box strong {
  font-size: var(--text-title-size);
  font-weight: 800;
}

.goal-box span:last-child {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
}

.week-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.week-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--color-surface-2);
}

.week-day {
  flex: 0 0 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.week-day strong {
  font-size: var(--text-info-size);
  font-weight: 800;
  color: var(--color-text);
}

.week-day small {
  font-size: var(--text-micro-size);
  color: var(--color-muted);
}

.week-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.week-body strong {
  font-size: var(--text-info-size);
  font-weight: 800;
  color: var(--color-text);
}

.week-body span {
  font-size: var(--text-caption-size);
  line-height: 1.5;
  color: var(--color-muted);
}

.reveal-basis {
  font-size: var(--text-caption-size);
  color: var(--color-muted);
  margin: 6px 0 0;
}

.onboarding-error {
  font-size: var(--text-caption-size);
  color: #d05050;
  margin: 0;
}

.onboarding-foot {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.onboarding-foot button {
  flex: 1;
  padding: 14px;
  border-radius: 14px;
  font-size: var(--text-info-size);
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.onboarding-foot .ghost {
  flex: 0 0 auto;
  padding: 14px 18px;
  background: transparent;
  border: 1px solid rgba(120, 120, 120, 0.3);
  color: var(--color-text);
}

.onboarding-foot .primary {
  background: var(--color-primary);
  color: #08130d;
}
</style>

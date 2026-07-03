<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useLevelStore } from '@/app/stores/levelStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useToastStore } from '@/app/stores/toastStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useGlossaryStore } from '@/app/stores/glossaryStore'
import { useInjuryFlowStore } from '@/app/stores/injuryFlowStore'
import type { TrainingPhaseName } from '@/entities/training-memory/model'
import { isActiveSession, type ScheduledSession } from '@/entities/training-schedule/model'
import { isSelfRaceRun } from '@/entities/competition/model'
import { computeIntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import { formatDateWithWeekday, formatDuration } from '@/shared/lib/format'
import { buildRestGuidance, evaluateExtraRun } from '@/shared/lib/coaching/restGuidance'
import { evaluateSteadyLong, STEADY_LONG_GRADE_LABEL, evaluateLsd, LSD_KIND_LABEL, evaluateEasyRecovery } from '@/shared/lib/coaching/sessionQuality'
import { gradeTempoRun, type TempoGrade } from '@/shared/lib/coaching/tempoAdaptation'
import { evaluateLapDrift } from '@/shared/lib/lapDrift'
import { trainingWeekRange } from '@/shared/lib/coaching/periodizedSchedule'
import { proposeAlternativeSession } from '@/shared/lib/coaching/alternativeSession'
import { proposeReschedule, proposeMoveToToday, proposeSwap } from '@/shared/lib/coaching/reschedule'
import { weeklyHardLoadGuard } from '@/shared/lib/coaching/weeklyTriage'
import { buildPmEasyDraft } from '@/shared/lib/coaching/doubleSession'
import { sessionTypeLabel } from '@/shared/lib/coaching/sessionBriefing'
import { buildSessionIntentDraft, easierAlternative } from '@/features/build-session-intent/buildSessionIntentDraft'
import { appendPhaseTransition } from '@/shared/api/adaptiveTrainingRepository'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionGroup from '@/shared/ui/SectionGroup.vue'
import CoachMomentCard from './CoachMomentCard.vue'
import WeekTrainingCarousel from './WeekTrainingCarousel.vue'
import SessionBriefingCard from './SessionBriefingCard.vue'
import SessionDebriefCard from './SessionDebriefCard.vue'
import SessionDoublePanel from './SessionDoublePanel.vue'
import LevelCard from './LevelCard.vue'
import TrainingPhaseCard from './TrainingPhaseCard.vue'
import PhaseTransitionModal from './PhaseTransitionModal.vue'
import PreRunIntentCard from './PreRunIntentCard.vue'
import QuestPanel from './QuestPanel.vue'
import RescheduleSheet from './RescheduleSheet.vue'
import WeekendTriageSheet from './WeekendTriageSheet.vue'
import DoublesAddSheet from './DoublesAddSheet.vue'
import RacePage from '@/pages/race/RacePage.vue'
import { useTrainingWeek, dateOnly, WEEKDAY_KO } from '@/pages/dashboard/useTrainingWeek'
import { useCoachMoments } from './useCoachMoments'

const memoryStore = useMemoryStore()
const levelStore = useLevelStore()
const scheduleStore = useTrainingScheduleStore()
const sessionIntentStore = useSessionIntentStore()
const toastStore = useToastStore()
const glossaryStore = useGlossaryStore()

const week = useTrainingWeek({ routePath: '/coach' })
const {
  today,
  todayDate,
  todayWeekdayIndex,
  weekMonday,
  runs,
  trainingRuns,
  activeGoal,
  activeInjury,
  heartRateModel,
  chronicLoad,
  restState,
  adaptiveProgress,
  weekOffset,
  weekLabel,
  navWeek,
  scheduleDays,
  hasSchedule,
  isPerformanceGoal,
  scheduleLoadingPlaceholder,
  activeDayIndex,
  activeSession,
  activeSessions,
  isActiveDayDouble,
  activeOpenSession,
  activeDoneRun,
  activeDoneSummary,
  activeBriefing,
  briefingCeilingText,
  activePlannedIntent,
  intentBusy,
  runScheduleOp,
  intentArgs
} = week

// 코치 모먼트·주변 신호(리디자인 ①b — useCoachMoments 로 추출, 요약 홈 CoachInsights 와 동일 소스).
const {
  runnerProgress,
  weekSummary,
  scheduleStartDate,
  weekendTriageData,
  doubleEligibility,
  doubleSuggestionData,
  topCoachMoment,
  dismissMoment,
  onMomentSelect
} = useCoachMoments(week)

const raceOpen = ref(false)

// 마지막 레이싱(self-race 태그) 기록 — 레이싱 카드 표시용. 없으면 null(독려 문구). 의도적으로 runs 사용.
const lastRace = computed(() => runs.value.find((run) => isSelfRaceRun(run)) ?? null)

// 세션 타입 → 용어집 슬러그(훈련법 해설 deep-link). 카드 제목 탭 시 그 항목으로 용어집을 연다.
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

// 디브리핑(완료 슬라이드, #378): 요약 + 의도 달성률(#310) + 세션 등급(#354) + 다음
const activeDoneIntent = computed(() =>
  activeDoneRun.value ? sessionIntentStore.intents.find((i) => i.runId === activeDoneRun.value!.id) ?? null : null
)
const activeFulfillment = computed(() => {
  const run = activeDoneRun.value
  const intent = activeDoneIntent.value
  return run && intent ? computeIntentFulfillment(intent, run) : null
})
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

function onMomentAction(moment: { key: string; action?: { kind: string } }) {
  if (moment.action?.kind === 'open-injury-screening') useInjuryFlowStore().requestScreening()
  else if (moment.action?.kind === 'open-weekend-triage') triageOpen.value = true
  else if (moment.action?.kind === 'open-doubles-add') openDoublesAdd(doubleSuggestionData.value?.amSession ?? null)
  dismissMoment(moment.key)
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

// === 주말 트리아지 (데이터는 useCoachMoments 소유 — 시트 실행만 여기) ===
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

// === 같은 날 더블(#455) — 적격/제안 데이터는 useCoachMoments 소유 ===
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

// 폴백(스케줄 없음) 옛 의도 카드 액션
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

// #339/#337: 훈련 단계 진행 평가 + 전환 제안
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
  <PageLayout variant="coach">
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

    <!-- 목표 기반 주간 캐러셀 (에픽 #362) -->
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
        <!-- 선언한 휴식(#473): 차분한 "쉬는 중 · 복귀 D-N" 안내. 복귀 컨트롤은 요약 홈 히어로가 담당(리디자인 ①b) -->
        <article v-else-if="day.state === 'rested'" class="carousel-card rest-declared-card">
          <strong class="carousel-card-title">💤 쉬는 중</strong>
          <p class="carousel-card-line">
            <template v-if="restState.daysUntilReturn !== null && restState.daysUntilReturn > 0">
              복귀까지 D-{{ restState.daysUntilReturn
              }}<template v-if="restState.returnDate"> · {{ formatDateWithWeekday(restState.returnDate) }}부터 가볍게 시작해요</template>.
            </template>
            <template v-else>돌아올 준비가 되면 언제든 가볍게 시작해요.</template>
          </p>
          <p class="open-card-help">충분히 쉬는 것도 훈련의 일부예요. 지금 복귀·복귀일 조정은 요약 탭에서 할 수 있어요.</p>
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

    <!-- 스케줄 로딩 중: 폴백 깜빡임 방지 플레이스홀더(#390) -->
    <div v-else-if="scheduleLoadingPlaceholder" class="schedule-loading">
      <p class="helper">이번 주 코칭 계획을 불러오는 중…</p>
    </div>

    <!-- 캐러셀 브리핑이 의도·성공기준·타겟을 흡수하므로, 폴백(스케줄 없음) 때만 옛 의도 카드 표시(중복 제거). -->
    <SectionGroup v-if="activePlannedIntent && !hasSchedule" title="훈련 의도" :surface="false">
      <PreRunIntentCard
        :intent="activePlannedIntent"
        :busy="intentBusy"
        @acknowledge="onAcknowledgeIntent"
        @request-alternative="onRequestAlternative"
      />
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

    <SectionGroup title="내 레벨" :surface="false">
      <LevelCard :progress="runnerProgress" :coins="levelStore.coins" hide-eyebrow />
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
</style>

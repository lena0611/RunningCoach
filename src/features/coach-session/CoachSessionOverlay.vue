<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCoachStore } from '@/app/stores/coachStore'
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useRunStore } from '@/app/stores/runStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { useCompetitionStore } from '@/app/stores/competitionStore'
import { useSessionIntentStore } from '@/app/stores/sessionIntentStore'
import { useWeatherStore } from '@/app/stores/weatherStore'
import { computeIntentFulfillment } from '@/entities/session-intent/computeIntentFulfillment'
import IntentFulfillmentCard from '@/shared/ui/IntentFulfillmentCard.vue'
import type { RunLog } from '@/entities/run/model'
import type { TrainingGoal, TrainingInjuryCheckIn, TrainingMemory } from '@/entities/training-memory/model'
import { detectGoalIntent, type GoalIntentProposal } from '@/features/detect-goal-intent/detectGoalIntent'
import { fetchCoachReports, requestCoachRunStream, type CoachInjuryUpdateProposal, type CoachReport } from '@/shared/api/coachRepository'
import { summarizeAchievementsForCoach } from '@/shared/lib/achievement/achievements'
import { coachModelLabel, COACH_MODELS, isCoachModelId } from '@/shared/lib/coaching/coachModels'
import { useSettingsStore } from '@/app/stores/settingsStore'
import BottomSheetSelect from '@/shared/ui/BottomSheetSelect.vue'
import { summarizeTempoCoaching } from '@/shared/lib/coaching/tempoAdaptation'
import { buildCoachAdaptiveProgress } from '@/shared/lib/coaching/coachAdaptiveProgress'
import { buildCoachSessionEvidence } from '@/shared/lib/coaching/sessionQuality'
import { buildInjuryCoachSignals } from '@/entities/training-memory/injurySignals'
import { getActiveGoal, getActiveInjuryItem, getRecentInjuryHistory, isFullMarathonGoal } from '@/entities/training-memory/model'
import { deriveRestState } from '@/entities/training-memory/restWindow'
import { getAgeLoadWeight } from '@/shared/lib/runStats'
import { deriveHeartRateModel, deriveObservedMaxHr } from '@/shared/lib/heartRateZones'
import { getRaceProjection, summarizeGoalProjectionForCoach } from '@/shared/lib/performanceProjection'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { resolveRunnerLevel } from '@/shared/lib/runnerLevel'
import { formatDateTimeWithWeekday, formatDateWithWeekday } from '@/shared/lib/format'
import { buildCoachStreamFailurePresentation } from './coachStreamFailure'
import { buildCoachStreamSuccessReport } from './coachStreamSuccess'
import CoachMessage from '@/shared/ui/CoachMessage.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import SchedulingHelpSheet from '@/shared/ui/SchedulingHelpSheet.vue'
import { useBottomSheetDrag } from '@/shared/lib/useBottomSheetDrag'

const coachStore = useCoachStore()
const runStore = useRunStore()
const competitionStore = useCompetitionStore()
const memoryStore = useMemoryStore()
const scheduleStore = useTrainingScheduleStore()
const weatherStore = useWeatherStore()
const sessionIntentStore = useSessionIntentStore()
const settingsStore = useSettingsStore()

// 코칭 대상 런은 스토어가 단일 소유한다(어느 탭에서든 open(run)으로 열림).
const coachRun = computed(() => coachStore.activeRun)
// 의도 달성률(#310): 코칭 중인 run 에 연결된(완료된) 의도를 찾아 결정론적으로 평가.
const coachIntent = computed(() =>
  coachRun.value ? sessionIntentStore.intents.find((intent) => intent.runId === coachRun.value!.id) ?? null : null
)
const coachIntentFulfillment = computed(() =>
  coachRun.value && coachIntent.value ? computeIntentFulfillment(coachIntent.value, coachRun.value) : null
)
// #312/#98: 대시보드와 동일한 6요소 전망을 coach-run 에 주입해 목표 가능성 불일치를 없앤다.
const coachGoalProjection = computed(() => {
  const runs = runStore.sortedRuns
  const memory = memoryStore.memory
  const now = new Date()
  const observedMaxHr = deriveObservedMaxHr(runs.map((run) => ({ maxHeartRate: run.maxHeartRate, date: run.date })), now)
  const hr = deriveHeartRateModel(memory.athleteProfile, now.getFullYear(), observedMaxHr)
  const projection = getRaceProjection(runs, getActiveGoal(memory), now, getActiveInjuryItem(memory), getAgeLoadWeight(memory.athleteProfile.birthYear, now), {
    easyCeilingBpm: hr.easyCeilingBpm,
    tempoCeilingBpm: hr.tempoCeilingBpm
  })
  return summarizeGoalProjectionForCoach(projection)
})
const coachNote = ref('')
// 전송 즉시 입력창을 비우고 질문을 사용자 말풍선으로 낙관적 표시하기 위한 상태(#238).
const pendingUserNote = ref('')
// 프리셋 커맨드(/세션분석 등)로 보낸 경우의 커맨드 id. 서버가 키워드 분류 대신 이 신호로 리포트 형식을 정한다(#237).
const selectedCommandId = ref('')
const coachNoteInput = ref<HTMLTextAreaElement | null>(null)
const coachScrollContainer = ref<HTMLElement | null>(null)
const coachAutoScroll = ref(true)
const showCoachScrollButton = ref(false)
const coachLoading = ref(false)
const coachError = ref('')
const coachCommandOpen = ref(false)
const streamingCoachText = ref('')
const streamingCoachMeta = ref('')
// 스트리밍 reveal 스무딩: 수신 버퍼를 rAF 루프로 grapheme 경계 단위로 표시한다.
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
const pendingGoalProposal = ref<GoalIntentProposal | null>(null)
const pendingGoalCoachNote = ref('')
const savingGoalProposal = ref(false)
const dismissedInjuryProposalIds = ref<string[]>([])
const savingInjuryProposalId = ref('')
const schedulingHelpOpen = ref(false)
const goalSheetDrag = useBottomSheetDrag(closeGoalProposal)

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

// 코치 오버레이 open/close 를 스토어의 activeRun 으로 구동한다.
// null→run: 기존 openCoach 부수효과(의도/리포트 로드, 입력창 포커스/리사이즈, 맨 아래 스크롤).
// run→null: 기존 closeCoach 정리(스트림 중단, 코치 상태 리셋).
watch(
  () => coachStore.activeRun,
  (run, previous) => {
    if (run && run.id !== previous?.id) {
      void onCoachOpened()
    } else if (!run && previous) {
      onCoachClosed()
    }
  }
)

// 편집 등으로 스토어의 런이 갱신되면 RunDetail 라벨/말풍선이 최신 데이터를 따라가도록 한다.
watch(
  () => runStore.runs,
  (runs) => {
    if (coachStore.activeRun) {
      const next = runs.find((run) => run.id === coachStore.activeRun?.id)
      if (next && next !== coachStore.activeRun) coachStore.activeRun = next
    }
  },
  { deep: true }
)

watch(coachNote, (value) => {
  // 프리셋 커맨드 텍스트를 사용자가 직접 수정하면 커맨드 신호를 해제한다(자유 입력으로 간주).
  if (selectedCommandId.value) {
    const matched = coachCommandItems.find((item) => item.id === selectedCommandId.value)
    if (!matched || value !== matched.prompt) selectedCommandId.value = ''
  }
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
  stopCoachThinkingTimer()
  coachAbortController.value?.abort()
  resetCoachReveal()
})

async function onCoachOpened() {
  coachError.value = ''
  coachAutoScroll.value = true
  showCoachScrollButton.value = false
  void nextTick(resizeCoachNoteInput)
  if (!sessionIntentStore.loaded) void sessionIntentStore.load()
  void competitionStore.ensureLoaded()
  if (!scheduleStore.loaded && !scheduleStore.loading) void scheduleStore.load()
  await ensureReportsLoaded()
  await nextTick()
  scrollCoachToBottom('auto')
}

function onCoachClosed() {
  stopCoachStream()
  coachNote.value = ''
  coachError.value = ''
  coachCommandOpen.value = false
  streamingCoachText.value = ''
  streamingCoachMeta.value = ''
  coachAutoScroll.value = true
  showCoachScrollButton.value = false
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

function closeCoach() {
  coachStore.close()
}

function clearCoachNote() {
  coachNote.value = ''
  coachCommandOpen.value = true
  void nextTick(resizeCoachNoteInput)
}

function selectCoachCommand(item: { id: string; prompt: string }) {
  coachNote.value = item.prompt
  selectedCommandId.value = item.id
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
  const targetRunId = coachRun.value.id
  const commandId = selectedCommandId.value || null
  coachLoading.value = true
  coachError.value = ''
  coachCommandOpen.value = false
  // 전송 즉시 입력창을 비우고 질문을 사용자 말풍선으로 올린다(#238).
  coachNote.value = ''
  pendingUserNote.value = note
  streamingCoachText.value = ''
  streamingCoachMeta.value = 'AI 코치가 답변 중'
  const controller = new AbortController()
  coachAbortController.value = controller
  resetCoachReveal()
  coachRevealStopped = false
  startCoachThinkingTimer()
  try {
    const report = await requestCoachRunStream(targetRunId, note, weatherStore.snapshot, {
      signal: controller.signal,
      onDelta: enqueueCoachReveal,
      runnerLevel: resolveRunnerLevel(memoryStore.memory.athleteProfile, runStore.sortedRuns).level,
      commandId,
      achievements: summarizeAchievementsForCoach(runStore.sortedRuns, competitionStore.results),
      tempoCoaching: summarizeTempoCoaching(runStore.sortedRuns, memoryStore.memory),
      goalProjection: coachGoalProjection.value,
      adaptiveProgress: buildCoachAdaptiveProgress(runStore.sortedRuns, memoryStore.memory),
      // 실제 주기화 스케줄의 다음 세션들 — 코치 "다음 훈련"이 weeklyPattern으로 엉뚱한 세션을 지어내지 않게(요약탭과 일치).
      upcomingSchedule: (() => {
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        return scheduleStore.upcoming(todayStr).slice(0, 3).map((s) => ({
          date: s.date,
          type: s.sessionType,
          distanceKm: s.prescription.distanceKm ?? null,
          keySession: s.keySession
        }))
      })(),
      // 활성 휴식(#502) — 휴식 중엔 코치가 "다음 훈련" 처방을 닦달하지 않게. 휴식과 무관하면 null.
      restState: (() => {
        const today = new Date()
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const rs = deriveRestState(memoryStore.memory.activeRest, todayStr)
        if (!rs.active && !rs.isReturnDay && !rs.isOver) return null
        return {
          active: rs.active,
          reason: rs.reason,
          daysUntilReturn: rs.daysUntilReturn,
          returnDate: rs.returnDate,
          isReturnDay: rs.isReturnDay,
          longLayoff: (rs.durationDays ?? 0) > 28
        }
      })(),
      // 최근 12개월 부상 이력(전역 재부상 위험창) — 채팅 코치가 이전 부상 보유자에게 보수화·"저볼륨=안전" 안심 금지. 이력 없으면 null.
      recentInjuryWindow: (() => {
        const h = getRecentInjuryHistory(memoryStore.memory, new Date())
        return h.hasRecentInjury ? { hasRecentInjury: true, mostRecentDaysAgo: h.mostRecentDaysAgo, areas: h.areas.slice(0, 4) } : null
      })(),
      // 풀마라톤 목표 위험 플래그(하프 제외) — 풀만 독립 위험↑.
      marathonFlag: isFullMarathonGoal(getActiveGoal(memoryStore.memory)),
      // 활성 부상 감별 신호(§5 부상 KB) — 통증 부위+데이터로 좁힌 상위 1~2 "가능성" 가설+레버+안전 redFlag.
      // 활성 부상/신호 없으면 null(게이팅은 buildInjuryCoachSignals 내부). 진단 아님 — 코치가 "가능성"으로만 전달.
      injurySignals: buildInjuryCoachSignals(memoryStore.memory, runStore.sortedRuns, new Date()),
      sessionEvidence: (() => {
        const now = new Date()
        const observed = deriveObservedMaxHr(runStore.sortedRuns.map((r) => ({ maxHeartRate: r.maxHeartRate, date: r.date })), now)
        const hr = deriveHeartRateModel(memoryStore.memory.athleteProfile, now.getFullYear(), observed)
        return buildCoachSessionEvidence(coachRun.value, { easyCeilingBpm: hr.easyCeilingBpm, recoveryCeilingBpm: hr.recoveryCeilingBpm })
      })()
    })
    await waitForCoachRevealDrain()
    const visibleReport = buildCoachStreamSuccessReport({
      report,
      targetRunId,
      displayedText: streamingCoachText.value,
      pendingText: coachRevealPending
    })
    reports.value = [visibleReport, ...reports.value.filter((item) => item.id !== visibleReport.id)]
    pendingUserNote.value = ''
    selectedCommandId.value = ''
    coachCommandOpen.value = false
    streamingCoachText.value = ''
    streamingCoachMeta.value = ''
    reportsLoaded.value = true
  } catch (err) {
    const failure = buildCoachStreamFailurePresentation({
      note,
      currentInput: coachNote.value,
      displayedText: streamingCoachText.value,
      pendingText: coachRevealPending,
      error: err,
      aborted: err instanceof Error && err.name === 'AbortError'
    })
    resetCoachReveal()
    // 실패/중단 시 질문을 입력창으로 복원한다. 이미 받은 답변 조각이 있으면 말풍선을 남겨 사라짐을 막는다.
    pendingUserNote.value = failure.pendingUserNote
    coachNote.value = failure.coachNote
    streamingCoachText.value = failure.streamingCoachText
    streamingCoachMeta.value = failure.streamingCoachMeta
    coachError.value = failure.coachError
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

/**
 * 이 리포트가 코칭받던 그 시점의 부상 컨텍스트 라벨(스냅샷 기준, 현재값 아님).
 * 과거 리포트를 다시 봐도 그때 부상 상태(상태·심각도)를 충실히 보여준다. 스냅샷이 없거나(구버전) 부상이 없으면 ''.
 */
function reportInjuryContextLabel(report: CoachReport): string {
  const snap = report.injuryContextSnapshot
  if (!snap || !snap.items.length) return ''
  const active =
    snap.items.find((it) => it.id === snap.activeInjuryItemId) ??
    snap.items.find((it) => it.status === 'active' || it.status === 'monitoring')
  if (!active) return ''
  const name = active.title || active.area || '부상'
  const sev = active.severity != null ? ` ${active.severity}/5` : ''
  const st = active.status === 'active' ? '관리 중' : active.status === 'monitoring' ? '관찰 중' : active.status === 'resolved' ? '해소' : ''
  return `🩹 당시 부상: ${name}${sev}${st ? ` · ${st}` : ''}`
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
</script>

<template>
  <Teleport to="body">
    <Transition name="stack-page">
      <div v-if="coachRun" class="memory-stack-layer coach-overlay-layer" data-no-swipe @pointerdown.capture="dismissCoachKeyboardOnOutsideTap">
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
        <div class="coach-model-bar">
          <span class="coach-model-bar-label">코칭 모델</span>
          <BottomSheetSelect
            compact
            label="코칭 모델"
            :model-value="settingsStore.coachingModel"
            :options="COACH_MODELS.map((m) => ({ value: m.id, label: m.full }))"
            @update:model-value="(v) => isCoachModelId(v) && settingsStore.setCoachingModel(v)"
          />
        </div>
        <main ref="coachScrollContainer" class="memory-stack-content coach-stack-content" @scroll="onCoachScroll">
          <CoachMessage role="user" :text="`${formatDateWithWeekday(coachRun.date)} ${coachRun.sessionTitle || coachRun.type}`" />
          <IntentFulfillmentCard v-if="coachIntent && coachIntentFulfillment" :intent="coachIntent" :fulfillment="coachIntentFulfillment" />
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
                <small v-if="coachModelLabel(report.model)" class="coach-model-tag">✨ {{ coachModelLabel(report.model) }} 제공</small>
                <small v-if="reportInjuryContextLabel(report)" class="coach-injury-snapshot">{{ reportInjuryContextLabel(report) }}</small>
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
            <CoachMessage v-if="pendingUserNote" role="user" :text="pendingUserNote" />
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
              @click="selectCoachCommand(item)"
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
  </Teleport>

  <Teleport to="body">
    <Transition name="bottom-sheet">
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
    </Transition>
    <SchedulingHelpSheet :open="schedulingHelpOpen" @close="schedulingHelpOpen = false" />
  </Teleport>
</template>

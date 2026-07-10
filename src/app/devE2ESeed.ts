/**
 * DEV 전용 E2E 시드(#473 복귀 램프 검증용). 프로덕션 번들엔 포함되지 않는다(main.ts 에서 import.meta.env.DEV 게이트 + 동적 import).
 *
 * 복귀 램프 화면은 "레이스 목표 + 7일+ 경과한(이미 끝난) 휴식"이 있어야 doEnsureSchedule 의 자연만료 분기가
 * 발동한다. 실제로 2주를 기다릴 수 없으므로, 테스트 계정에 그 상태를 결정론으로 깐다(과거 날짜 휴식).
 * 인증된 실 Supabase 세션에서만 동작한다(스토어 액션이 Supabase 에 쓴다).
 */
import { useMemoryStore } from '@/app/stores/memoryStore'
import { useSessionDetailStore } from '@/app/stores/sessionDetailStore'
import { useTrainingScheduleStore } from '@/app/stores/trainingScheduleStore'
import { buildPeriodizedSchedule } from '@/shared/lib/coaching/periodizedSchedule'
import type { RunLog, Lap, RunMetricSample } from '@/entities/run/model'
import type { TrainingGoal, TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import type { ScheduledSession } from '@/entities/training-schedule/model'

function isoOffset(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const RACE_GOAL_ID = 'e2e-race-10k'
/** 시드 직전의 실계정 활성 상태 스냅샷(클린업 복원용). 시드→클린업 한 사이클 동안만 존재. */
const PREV_STATE_KEY = 'e2e.returnRamp.prevState'

/**
 * 복귀 램프 시나리오를 깐다: 레이스 10K 목표 + 2주 전 시작해 이틀 전 끝난 휴식(durationDays≈13, returnRampApplied=false).
 * 이후 새로고침하면 doEnsureSchedule 자연만료 분기가 첫 세션을 Easy·캡으로 재정렬한다.
 */
export async function seedReturnRamp(): Promise<{ ok: true }> {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const start = isoOffset(-14)
  const until = isoOffset(-2)
  const target = isoOffset(120)

  const raceGoal: TrainingGoal = {
    id: RACE_GOAL_ID,
    title: '10K 레이스(E2E)',
    category: 'race',
    startDate: start,
    targetDate: target,
    distanceKm: 10,
    targetDurationSec: 3000,
    priority: 1,
    status: 'active',
    successCriteria: '',
    strategyNotes: '',
    notes: '',
    createdAt: `${start}T00:00:00.000Z`,
    updatedAt: new Date().toISOString()
  }

  // 0) 시드 직전 활성 상태 스냅샷 — cleanupReturnRamp 가 실계정 원상태로 복원한다
  //    (2026-07-03 사고: 클린업 없이 스펙이 끝나 실계정 활성 목표가 'E2E'로 남았다).
  try {
    localStorage.setItem(
      PREV_STATE_KEY,
      JSON.stringify({ activeGoalId: memory.memory.activeGoalId, goal: memory.memory.goal, activeRest: memory.memory.activeRest })
    )
  } catch {
    /* 스냅샷 실패 시에도 시드는 진행 — cleanup 은 e2e 목표 제거+첫 실 목표 활성화로 폴백 */
  }

  // 1) 레이스 목표를 활성화 + 기존 휴식 제거. 비파괴: 실 목표를 교체하지 않고 e2e 목표만 더한다(공유 실계정 보호).
  //    (이전엔 goals:[raceGoal] 로 실 목표를 통째로 덮어써, 인증된 실계정에서 돌면 사용자 목표가 사라졌다.)
  await memory.update({
    ...memory.memory,
    goal: raceGoal.title,
    activeGoalId: RACE_GOAL_ID,
    goals: [raceGoal, ...memory.memory.goals.filter((g) => g.id !== RACE_GOAL_ID)],
    activeRest: null
  })

  // 2) 2주 전부터의 주기화 스케줄을 깐다(현재 시점 기준 미래 세션 = 복귀 후 대상).
  await sched.load(RACE_GOAL_ID)
  const drafts = buildPeriodizedSchedule({
    goal: raceGoal,
    profile: memory.memory.athleteProfile,
    today: new Date(`${start}T00:00:00`),
    currentWeeklyKm: 25,
    observedEasyPace: null
  })
  await sched.realign(RACE_GOAL_ID, start, drafts)

  // 3) 과거 휴식(끝남) — 아직 램프 미적용.
  await sched.declareRest(RACE_GOAL_ID, start, until)
  await memory.setActiveRest({ startDate: start, untilDate: until, reason: 'personal', declaredAt: `${start}T00:00:00.000Z`, returnRampApplied: false })

  return { ok: true }
}

const WALK_RUN_INJURY_ID = 'e2e-acute-injury'

/**
 * walk-run 복귀 처방(#501) 렌더 검증 시나리오: 레이스 목표 + **오늘 Easy 세션** + 급성 통증성 부상(active·severity 3).
 * 이러면 대시보드 활성일(=오늘) 작전 카드의 "어떻게 뛰나"가 걷기-뛰기 5단계 사다리로 바뀐다(shouldPrescribeWalkRun).
 *
 * **비파괴·인증 비의존**: Supabase 에 쓰지 않고 Pinia 상태만 in-memory 로 오버레이한다(memory.update 대신 직접 변경).
 * 앱은 세션이 만료돼도 localStorage 메모리로 대시보드를 렌더하고, 렌더 경로(buildSessionBriefing→SessionBriefingCard)는
 * 순수 클라이언트 로직이라 이 오버레이만으로 walk-run 카드가 뜬다. persist 하지 않으므로 새로고침하면 실데이터가 그대로
 * 복귀한다(DB·localStorage 미기록 → 공유 실계정 무손상, 원복 불필요). 그래서 이 스펙은 reload 없이 즉시 단언한다.
 *  - injuryItems: 실 부상 보존 + e2e 급성 부상 추가, activeInjuryItemId 만 e2e 로(getActiveInjuryItem → e2e).
 *  - activeRest=null: 작전 카드 억제 해제(rest-return 과 반대 상태).
 *  - 활성 목표가 레이스가 아니면 e2e 레이스 목표를 더해 활성화(localStorage 에 실 레이스 목표가 있으면 그걸 쓴다).
 *  - 오늘 날짜에 Easy 활성 세션 주입(기존 오늘 세션은 superseded) — walk-run 은 저강도 연속 세션에만 얹힌다.
 */
export function seedWalkRunReturn(): { ok: true } {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const mem = memory.selectedUser.memory
  const todayIso = isoOffset(0)
  const now = new Date().toISOString()

  // 급성 통증성 부상(§3-B): status active + severity 3(painLevel 3 → deriveInjurySeverity 3, severity 는 폴백).
  const injury: TrainingInjuryItem = {
    id: WALK_RUN_INJURY_ID,
    title: '급성 좌측 햄스트링 통증(E2E)',
    area: '좌측 햄스트링',
    normalizedAreas: [{ areaId: 'left-hamstring', painLevel: 3 }],
    status: 'active',
    severity: 3,
    onsetDate: isoOffset(-3),
    lastFlareDate: isoOffset(-1),
    lastCheckedAt: now,
    resolvedAt: null,
    checkInHistory: [],
    notes: 'E2E 급성 통증성 부상 시드',
    managementPlan: '',
    triggers: [],
    restrictions: [],
    returnToRunCriteria: '',
    strengthPlan: [],
    strengthPlanDetails: [],
    createdAt: now,
    updatedAt: now
  }
  // 실 부상 보존 + e2e 급성 부상 추가/활성화(직접 상태 변경 — persist 안 함).
  mem.injuryItems = [...mem.injuryItems.filter((i) => i.id !== WALK_RUN_INJURY_ID), injury]
  mem.activeInjuryItemId = WALK_RUN_INJURY_ID
  mem.activeRest = null

  // 활성 목표 보장: 레이스 목표가 활성이면 그대로, 아니면 e2e 레이스 목표를 더해 활성화.
  let goalId = mem.activeGoalId
  const activeIsRace = mem.goals.some((g) => g.id === goalId && g.category === 'race')
  if (!activeIsRace) {
    const raceGoal: TrainingGoal = {
      id: RACE_GOAL_ID,
      title: '10K 레이스(E2E)',
      category: 'race',
      startDate: isoOffset(-7),
      targetDate: isoOffset(120),
      distanceKm: 10,
      targetDurationSec: 3000,
      priority: 1,
      status: 'active',
      successCriteria: '',
      strategyNotes: '',
      notes: '',
      createdAt: `${isoOffset(-7)}T00:00:00.000Z`,
      updatedAt: now
    }
    mem.goals = [raceGoal, ...mem.goals.filter((g) => g.id !== RACE_GOAL_ID)]
    mem.activeGoalId = RACE_GOAL_ID
    goalId = RACE_GOAL_ID
  }

  // 오늘 Easy 활성 세션 주입(기존 오늘 활성/휴식 세션은 비활성화). in-memory only.
  sched.sessions.forEach((s) => {
    if (s.date === todayIso && (s.status === 'planned' || s.status === 'missed' || s.status === 'rested')) {
      s.status = 'superseded'
    }
  })
  const easyToday: ScheduledSession = {
    id: 'e2e-walkrun-easy-today',
    userId: 'e2e',
    goalId,
    date: todayIso,
    phase: 'Base',
    sessionType: 'Easy',
    slot: null,
    keySession: false,
    prescription: { distanceKm: 5, durationMin: null, paceRange: '', note: '' },
    status: 'planned',
    source: 'manual',
    runId: null,
    createdAt: now,
    updatedAt: now
  }
  sched.sessions.push(easyToday)
  sched.loaded = true

  return { ok: true }
}

/** walk-run 시드 검증용 — 오늘 활성 세션 타입 + 급성 부상 인지 여부(렌더 전제조건 확인·디버깅). */
export function walkRunActiveState(): { todaySessionType: string | null; injuryStatus: string | null; injurySeverity: number | null } {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const todayIso = isoOffset(0)
  const session = sched.sessionOnDate(todayIso)
  const item = memory.memory.injuryItems.find((i) => i.id === WALK_RUN_INJURY_ID) ?? null
  return {
    todaySessionType: session?.sessionType ?? null,
    injuryStatus: item?.status ?? null,
    injurySeverity: item?.severity ?? null
  }
}

/** 현재 활성 목표의 가장 이른 미래(오늘 이후) planned 세션 정보 — 램프 적용 검증용. */
export function firstUpcomingSession(): { date: string; sessionType: string; distanceKm: number | null } | null {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const today = isoOffset(0)
  const upcoming = sched.sessions
    .filter((s) => s.goalId === memory.memory.activeGoalId && s.status === 'planned' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  return upcoming ? { date: upcoming.date, sessionType: upcoming.sessionType, distanceKm: upcoming.prescription.distanceKm } : null
}

/**
 * 복구 유틸: localStorage 의 원본 trainingMemory 스냅샷을 Supabase 로 되돌린다.
 * memoryStore.load() 는 localStorage 를 덮어쓰지 않으므로(update 만 기록), 파괴적 시드(목표 교체 등) 후
 * 원본이 localStorage 에 남아 있을 때 계정을 원복하는 데 쓴다.
 */
/** E2E 원복 가드: 활성 휴식 메타를 걷어내고 오늘 이후 rested 세션을 planned 로 되돌린다(멱등).
 * rest-return 스펙이 finally 에서 호출 — 2026-07-04 사고(테스트가 선언한 날씨 휴식이 원복 레이스로
 * 실계정에 잔존, 당일 LSD 가 rested 로 잠김) 재발 방지. */
export async function clearActiveRestForE2E(): Promise<{ ok: true; unrested: number }> {
  const memory = useMemoryStore()
  const sched = useTrainingScheduleStore()
  const goalId = memory.memory.activeGoalId ?? null
  await memory.setActiveRest(null)
  const unrested = await sched.unrestFrom(goalId, isoOffset(0))
  return { ok: true, unrested }
}

/** E2E 폴링용: 현재 activeRest 메타(영속 확인 — UI 로컬 상태가 아니라 스토어 값). */
export function activeRestState() {
  return useMemoryStore().memory.activeRest
}

/**
 * seedReturnRamp 잔재를 실계정에서 걷어낸다 — e2e 목표 제거 + 시드 직전 활성 목표/휴식 복원.
 * 스냅샷이 없으면(과거 시드 잔재) 첫 실 목표를 활성화하는 폴백. 멱등 — 잔재가 없으면 no-op.
 * ⚠ e2e 목표의 스케줄 행은 goalId 로만 접근되므로 목표 제거로 도달 불가(잔존해도 무해).
 */
export async function cleanupReturnRamp(): Promise<{ ok: boolean; restoredActiveGoalId: string | null }> {
  const memory = useMemoryStore()
  const mem = memory.memory
  const hasSeed = mem.goals.some((g) => g.id === RACE_GOAL_ID) || mem.activeGoalId === RACE_GOAL_ID
  let prev: { activeGoalId?: string | null; goal?: string; activeRest?: TrainingMemory['activeRest'] } | null = null
  try {
    const raw = localStorage.getItem(PREV_STATE_KEY)
    prev = raw ? JSON.parse(raw) : null
  } catch {
    prev = null
  }
  if (!hasSeed) {
    try {
      localStorage.removeItem(PREV_STATE_KEY)
    } catch { /* noop */ }
    return { ok: true, restoredActiveGoalId: null }
  }

  const realGoals = mem.goals.filter((g) => g.id !== RACE_GOAL_ID)
  const fallbackActive = realGoals.find((g) => g.status === 'active') ?? realGoals[0] ?? null
  const restoredActiveGoalId =
    prev?.activeGoalId && prev.activeGoalId !== RACE_GOAL_ID ? prev.activeGoalId : (fallbackActive?.id ?? null)
  const restoredGoalTitle =
    prev?.goal && prev.goal !== '10K 레이스(E2E)'
      ? prev.goal
      : (realGoals.find((g) => g.id === restoredActiveGoalId)?.title ?? '')

  await memory.update({
    ...mem,
    goals: realGoals,
    activeGoalId: restoredActiveGoalId ?? undefined,
    goal: restoredGoalTitle,
    activeRest: prev ? (prev.activeRest ?? null) : null
  })
  try {
    localStorage.removeItem(PREV_STATE_KEY)
  } catch { /* noop */ }
  return { ok: true, restoredActiveGoalId }
}

/**
 * 스플릿/랩 탭 렌더 프리뷰(2026-07-10): 실제 WorkOutDoors 인터벌 FIT('Repeating Schedule', 웜업+6×(가속20s+이지100s)+쿨다운)
 * 파싱값 그대로 비균등 랩 14개짜리 RunLog 를 만들어 세션상세를 in-memory 로 연다.
 * DB·localStorage 미기록(비파괴) — 닫으면 흔적 없음.
 */
const FIT_INTERVAL_LAPS: Array<{ m: number; sec: number; hr: number; cad: number }> = [
  { m: 1250, sec: 600, hr: 129, cad: 172 },
  { m: 55, sec: 20, hr: 143, cad: 162 },
  { m: 244, sec: 100, hr: 144, cad: 182 },
  { m: 45, sec: 20, hr: 145, cad: 182 },
  { m: 238, sec: 100, hr: 146, cad: 178 },
  { m: 55, sec: 20, hr: 143, cad: 188 },
  { m: 243, sec: 100, hr: 147, cad: 178 },
  { m: 57, sec: 20, hr: 148, cad: 186 },
  { m: 250, sec: 100, hr: 153, cad: 174 },
  { m: 51, sec: 20, hr: 153, cad: 210 },
  { m: 246, sec: 100, hr: 153, cad: 178 },
  { m: 73, sec: 20, hr: 151, cad: 188 },
  { m: 241, sec: 100, hr: 154, cad: 178 },
  { m: 783, sec: 300, hr: 154, cad: 180 }
]

export function openLapSplitPreview(): { ok: true; laps: number } {
  const now = new Date().toISOString()
  const today = isoOffset(0)
  const laps: Lap[] = []
  const metricSamples: RunMetricSample[] = []
  let offsetSec = 0
  let totalMeter = 0
  FIT_INTERVAL_LAPS.forEach((row, index) => {
    const distanceKm = Math.round((row.m / 1000) * 100) / 100
    laps.push({
      index: index + 1,
      distanceKm,
      paceSec: Math.round(row.sec / (row.m / 1000)),
      avgHeartRate: row.hr,
      cadence: row.cad
    })
    const paceSec = Math.round(row.sec / (row.m / 1000))
    for (let t = 10; t <= row.sec; t += 10) {
      metricSamples.push({ offsetSec: offsetSec + t, heartRate: row.hr, paceSec, cadence: row.cad })
    }
    offsetSec += row.sec
    totalMeter += row.m
  })
  const run: RunLog = {
    id: 'e2e-lap-split-preview',
    userId: 'e2e',
    externalId: null,
    sessionTitle: '인터벌 프리뷰(E2E) — Repeating Schedule',
    date: today,
    startAt: `${today}T09:00:00.000Z`,
    endAt: `${today}T09:27:00.000Z`,
    type: 'Easy + Strides',
    distanceKm: Math.round((totalMeter / 1000) * 100) / 100,
    durationSec: offsetSec,
    avgPaceSec: Math.round(offsetSec / (totalMeter / 1000)),
    avgHeartRate: 143,
    maxHeartRate: 158,
    cadence: 178,
    activeEnergyKcal: 304,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: 1,
    elevationLossM: 5,
    courseType: 'Flat',
    rpe: null,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: '스플릿/랩 탭 렌더 프리뷰 — 실제 FIT 파싱값',
    laps,
    fastSegments: [],
    metricSamples,
    routePoints: [],
    tags: ['type:auto'],
    source: 'file_import',
    createdAt: now,
    updatedAt: now
  }
  useSessionDetailStore().open(run)
  return { ok: true, laps: laps.length }
}

export async function restoreMemoryFromLocalSnapshot(): Promise<{ ok: boolean; goals?: string[]; activeGoalId?: string }> {
  const raw = localStorage.getItem('runcontext.trainingMemory')
  if (!raw) return { ok: false }
  const mem = JSON.parse(raw) as TrainingMemory
  await useMemoryStore().update(mem)
  return { ok: true, goals: (mem.goals || []).map((g) => g.title), activeGoalId: mem.activeGoalId }
}

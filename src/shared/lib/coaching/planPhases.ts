import type { TrainingPhaseName } from '@/entities/training-memory/model'
import type { ScheduledSession } from '@/entities/training-schedule/model'
import { isVolumeFirstWeek, trainingWeekRange, weekPhase } from './periodizedSchedule'
import { RETURN_LONG_LAYOFF_DAYS } from './returnRamp'

/**
 * 플랜의 단계 여정(#887) — 코치 탭 단계 카드·시트와 AI 코치가 보는 "지금 단계"의 정본.
 *
 * 단계는 **플랜 세션에 이미 붙어 있다**(allocatePhases 가 대회일에서 거꾸로 배분). 예전엔 기억에 따로 저장한
 * 단계(adaptiveTrainingProfile.trainingPhase)를 카드·코치에 보여줬는데, 사용자가 전환 버튼을 누를 때만 바뀌어
 * 플랜이 테이퍼인 주에도 "Base" 로 남았다(두 번째 진실). 여기선 저장하지 않고 세션에서 매번 계산한다.
 *
 * 점검 기준을 못 채워도 단계는 날짜대로 넘어간다(사용자 결정 2026-10-28) — 대회일이 고정이라 미루면 뒤 단계가
 * 줄어든다. 덜 된 부분은 그 단계 브리핑(sessionBriefing 의 수행 게이트)이 조절한다.
 */

export type PlanPhaseBlock = {
  phase: TrainingPhaseName
  /** 그 단계 첫 주 월요일. */
  start: string
  /** 그 단계 마지막 주 일요일. */
  end: string
  weeks: number
}

export type PlanPhaseJourney = {
  blocks: PlanPhaseBlock[]
  /** 오늘이 속한 단계(blocks 인덱스). */
  currentIndex: number
  /** 그 단계의 몇째 주인지(1부터). */
  weekInBlock: number
  /** 플랜의 몇째 주인지(1부터). */
  weekInPlan: number
  totalWeeks: number
  /** 이번 주가 주행량을 먼저 쌓는 주인지(#893, isVolumeFirstWeek) — 단계 설명 대신 VOLUME_FIRST_PURPOSE_KO. */
  volumeFirstWeek: boolean
}

/** 단계마다 이번 주에 하는 일 — 생성기 세션 구성(weeklySessionTypes)과 브리핑 템포 처방(tempoMinutesFor)에 맞춘 말. */
export const PHASE_PURPOSE_KO: Record<TrainingPhaseName, string> = {
  Base: '이지런과 롱런으로 오래 뛰는 몸을 만들어요.',
  Build: '템포를 시작해요. 롱런은 그대로 이어가요.',
  Threshold: '템포를 나눠 뛰며, 숨이 차도 페이스를 버티는 힘을 키워요.',
  'Race Specific': '템포를 길게 이어 뛰며 대회 강도를 몸에 익혀요.',
  Taper: '양을 줄이고 짧은 템포만 남겨, 대회 날 가벼운 다리로 서요.',
  Recovery: '회복을 먼저 챙겨요.'
}

/** 주행량을 먼저 쌓는 주(#893) — 단계 이름은 그대로지만 그 단계 훈련(롱런·템포)이 아직 없다. */
export const VOLUME_FIRST_PURPOSE_KO = '주행량이 아직 적어서 이번 주는 이지런으로만 쌓아요. 주행량이 늘면 이 단계 훈련이 더해져요.'

function weekStartOf(iso: string): string {
  return trainingWeekRange(new Date(`${iso}T12:00:00`)).start
}

function nextWeekStart(weekStart: string): string {
  const d = new Date(`${weekStart}T12:00:00`)
  d.setDate(d.getDate() + 7)
  return isoOf(d)
}

function weekEnd(weekStart: string): string {
  return trainingWeekRange(new Date(`${weekStart}T12:00:00`)).end
}

/**
 * 플랜 세션을 주(월~일)로 묶고, 같은 단계가 이어지는 주를 한 블록으로 합친다.
 * 오늘이 플랜 기간 밖이면(시작 전·대회 후) null — 카드를 띄우지 않는다.
 * 대체(superseded)된 세션만 뺀다: 쉬었거나 건너뛴 세션도 그 주가 어떤 단계였는지는 말해 준다.
 */
export function buildPlanPhaseJourney(sessions: ScheduledSession[], today: Date): PlanPhaseJourney | null {
  const live = sessions.filter((s) => s.status !== 'superseded')
  if (!live.length) return null

  const byWeek = new Map<string, ScheduledSession[]>()
  for (const s of live) {
    const key = weekStartOf(s.date)
    const list = byWeek.get(key)
    if (list) list.push(s)
    else byWeek.set(key, [s])
  }
  const sortedStarts = [...byWeek.keys()].sort()
  const todayIso = isoOf(today)

  // 빈 주(세션이 하나도 없는 주)는 앞 주 단계를 잇는다 — 막대가 끊기지 않게.
  const weeks: Array<{ start: string; phase: TrainingPhaseName }> = []
  const last = sortedStarts[sortedStarts.length - 1]
  for (let start = sortedStarts[0]; start <= last; start = nextWeekStart(start)) {
    const inWeek = byWeek.get(start)
    const phase = inWeek ? weekPhase(inWeek, todayIso) : weeks[weeks.length - 1].phase
    weeks.push({ start, phase })
  }

  const currentWeek = weeks.findIndex((w) => w.start === trainingWeekRange(today).start)
  if (currentWeek < 0) return null

  const blocks: PlanPhaseBlock[] = []
  let currentIndex = 0
  let weekInBlock = 1
  weeks.forEach((w, i) => {
    const prev = blocks[blocks.length - 1]
    if (prev && prev.phase === w.phase) {
      prev.end = weekEnd(w.start)
      prev.weeks += 1
    } else {
      blocks.push({ phase: w.phase, start: w.start, end: weekEnd(w.start), weeks: 1 })
    }
    if (i === currentWeek) {
      currentIndex = blocks.length - 1
      weekInBlock = blocks[currentIndex].weeks
    }
  })

  const thisWeek = (byWeek.get(weeks[currentWeek].start) ?? []).filter((s) => s.status !== 'skipped' && s.status !== 'rested')
  return {
    blocks,
    currentIndex,
    weekInBlock,
    weekInPlan: currentWeek + 1,
    totalWeeks: weeks.length,
    volumeFirstWeek: isVolumeFirstWeek(thisWeek, weeks[currentWeek].phase)
  }
}

/**
 * 단계 달력 시작일(#893) — 다시 지을 때 단계를 어디서부터 나눌지(`buildPeriodizedSchedule({ phaseStartDate })`).
 *
 * 그 목표의 **가장 이른 세션 날짜**다(상태 무관 — 정리(prune)도 이 행은 남긴다). 오늘부터 나누면 재정렬할 때마다 기초기
 * 1주차로 돌아갔다. 단 플랜 중 28일 넘게 안 뛰었으면 쌓은 체력이 사실상 사라진다(SSOT §휴식과 복귀 디트레이닝 4주
 * 경계) — 공백 뒤 첫 런(지금 쉬는 중이면 오늘)을 새 시작으로 본다. 복귀 램프는 처음 몇 세션만 낮추므로, 달력이 이걸
 * 맡지 않으면 5주 쉰 사람이 곧바로 템포를 받는다. 공백은 플랜 시작 전 마지막 런부터(없으면 플랜 시작일부터) 잰다.
 * 오늘부터 나눠야 하면(플랜 없음·오늘 시작) null.
 */
export function phaseCalendarStart(goalSessions: Array<Pick<ScheduledSession, 'date'>>, runDates: string[], todayIso: string): string | null {
  const planStart = goalSessions.reduce<string | null>((min, s) => (!min || s.date < min ? s.date : min), null)
  if (!planStart || planStart >= todayIso) return null
  const days = [...new Set(runDates.map((d) => d.slice(0, 10)))].filter((d) => d <= todayIso).sort()
  const restDays = (from: string, to: string) => diffDays(to, from) - 1
  let start = planStart
  let last = days.filter((d) => d <= planStart).at(-1) ?? planStart
  for (const day of days) {
    if (day <= planStart) continue
    if (restDays(last, day) >= RETURN_LONG_LAYOFF_DAYS) start = day
    last = day
  }
  if (restDays(last, todayIso) >= RETURN_LONG_LAYOFF_DAYS) start = todayIso
  return start
}

function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000)
}

/** 오늘이 속한 플랜 단계. 플랜이 없거나 기간 밖이면 null. */
export function currentPlanPhase(sessions: ScheduledSession[], today: Date): TrainingPhaseName | null {
  const journey = buildPlanPhaseJourney(sessions, today)
  return journey ? journey.blocks[journey.currentIndex].phase : null
}

function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

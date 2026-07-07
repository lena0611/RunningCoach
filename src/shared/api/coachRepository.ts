import { getSupabaseAnonKey, getSupabaseFunctionUrl, requireSupabase } from '@/shared/api/supabase'
import { getAppSessionToken } from '@/shared/api/appSecurity'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { DEFAULT_COACH_MODEL, isCoachModelId } from '@/shared/lib/coaching/coachModels'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import type { RunnerLevel } from '@/entities/training-memory/model'
import type { CoachAchievementSummary } from '@/shared/lib/achievement/achievements'
import type { TempoCoachingSummary } from '@/shared/lib/coaching/tempoAdaptation'
import type { CoachGoalProjectionSummary } from '@/shared/lib/performanceProjection'
import type { CoachAdaptiveProgressSummary } from '@/shared/lib/coaching/coachAdaptiveProgress'
import type { CoachSessionEvidence } from '@/shared/lib/coaching/sessionQuality'

export type CoachReport = {
  id: string
  selectedRunId: string | null
  userNote: string
  report: string
  createdAt: string
  updatedAt?: string
  trainingMemoryUpdated?: boolean
  injuryUpdateProposal?: CoachInjuryUpdateProposal | null
  /** 코칭 생성 시점의 부상 컨텍스트 스냅샷(그때 알던 부상 상태). 과거 리포트가 그때 상태를 충실히 표시·참조하게. */
  injuryContextSnapshot?: CoachInjuryContextSnapshot | null
  /** 이 리포트를 생성한 LLM 모델 id(coach_reports.model). 이 기능 이전 리포트는 null. */
  model?: string | null
  persistenceWarnings?: CoachPersistenceWarning[]
}

export type CoachPersistenceWarning = {
  stage: string
  message: string
}

/** 코칭 시점에 얼린 부상 컨텍스트(coach_reports.injury_context_snapshot). 없으면 null(이 기능 이전 리포트). */
export type CoachInjuryContextSnapshot = {
  /** 시점필터 기준이 된 선택 세션 날짜(YYYY-MM-DD). null이면 현재 흐름 코칭(특정 과거 런 아님). */
  capturedForRunDate: string | null
  activeInjuryItemId: string | null
  items: { id: string; title: string; area: string; status: string; severity: number | null; onsetDate: string | null }[]
}

export type CoachInjuryUpdateProposal = {
  injuryItemId: string
  proposalType: 'check_in_update' | 'resolve_candidate' | 'status_change_candidate'
  suggestedStatus?: 'active' | 'monitoring' | 'resolved'
  suggestedPainLevel?: number | null
  rationale: string
  userApprovalPrompt: string
  safetyNotes: string[]
}

type CoachReportRow = {
  id: string
  selected_run_id: string | null
  user_note: string
  report: string
  created_at: string
  updated_at?: string
  injury_context_snapshot?: CoachInjuryContextSnapshot | null
  model?: string | null
}

/** 현재 설정에서 코칭에 쓸 모델 id(검증). 서버는 allowlist로 재검증한다. */
function currentCoachingModel(): string {
  const stored = useSettingsStore().coachingModel
  return isCoachModelId(stored) ? stored : DEFAULT_COACH_MODEL
}

export async function requestCoachRun(selectedRunId: string | null, userNote: string, currentWeather: WeatherSnapshot | null = null, runnerLevel: RunnerLevel = 'beginner', achievements: CoachAchievementSummary | null = null, tempoCoaching: TempoCoachingSummary | null = null): Promise<CoachReport> {
  const appSessionToken = await getAppSessionToken()
  const { data, error } = await requireSupabase().functions.invoke('coach-run', {
    headers: {
      'x-pacelab-app-session': appSessionToken
    },
    body: {
      selectedRunId,
      userNote,
      model: currentCoachingModel(),
      currentWeather: summarizeWeatherForCoach(currentWeather),
      achievements,
      tempoCoaching,
      runnerLevel,
      responseStyle: {
        tone: 'conversational_coach',
        format: 'sectioned_markdown',
        avoid: ['report_style', 'medical_diagnosis', 'long_paragraphs'],
        emojiPolicy: 'contextual_0_to_3',
        firstSentence: 'reaction_before_analysis',
        maxParagraphSentences: 2,
        maxBulletsPerSection: 5
      }
    }
  })
  if (error) throw error
  if (!data?.report) throw new Error('AI 코칭 응답이 비어 있습니다.')
  return data.report as CoachReport
}

export async function requestCoachRunStream(
  selectedRunId: string | null,
  userNote: string,
  currentWeather: WeatherSnapshot | null,
  options: {
    signal?: AbortSignal
    onDelta: (delta: string) => void
    runnerLevel?: RunnerLevel
    commandId?: string | null
    achievements?: CoachAchievementSummary | null
    tempoCoaching?: TempoCoachingSummary | null
    goalProjection?: CoachGoalProjectionSummary | null
    adaptiveProgress?: CoachAdaptiveProgressSummary | null
    sessionEvidence?: CoachSessionEvidence | null
    /** 실제 주기화 스케줄의 다음 세션들(코치 "다음 훈련"이 weeklyPattern으로 지어내지 않게). */
    upcomingSchedule?: { date: string; type: string; distanceKm: number | null; keySession: boolean }[] | null
    /** 활성 휴식 요약(#502) — 휴식 중 코치가 "다음 훈련" 처방을 닦달하지 않고 휴식을 존중하게(currentWeather 패턴). */
    restState?: { active: boolean; reason: string | null; daysUntilReturn: number | null; returnDate: string | null; isReturnDay: boolean; longLayoff: boolean } | null
    /** 최근 12개월 부상 이력 요약(전역 재부상 위험창) — 채팅 코치가 이전 부상 보유자에게 보수화·"저볼륨=안전" 안심 금지(getRecentInjuryHistory). */
    recentInjuryWindow?: { hasRecentInjury: boolean; mostRecentDaysAgo: number | null; areas: string[] } | null
    /** 현재 목표가 풀마라톤인가(isFullMarathonGoal) — 풀마라톤 목표는 독립적으로 위험↑(하프 제외). */
    marathonFlag?: boolean | null
    /**
     * 활성 부상 감별 신호(§5 부상 KB) — 통증 부위 + 데이터로 좁힌 상위 1~2 "가능성" 가설 + 레버 + 안전 redFlag.
     * 의료 진단 아님("가능성"으로만). redFlag.tripped면 코치가 처방을 멈추고 의뢰를 우선한다. 활성 부상/신호 없으면 null.
     */
    injurySignals?: {
      areaLabel: string
      severity: number | null
      hypotheses: { possibility: string; levers: string[]; why: string }[]
      redFlag: { tripped: boolean; reasons: string[] }
    } | null
  }
): Promise<CoachReport> {
  const client = requireSupabase()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요합니다.')
  const appSessionToken = await getAppSessionToken()

  const response = await fetch(getSupabaseFunctionUrl('coach-run'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
      'Content-Type': 'application/json',
      'x-pacelab-app-session': appSessionToken
    },
    body: JSON.stringify({
      selectedRunId,
      userNote,
      model: currentCoachingModel(),
      currentWeather: summarizeWeatherForCoach(currentWeather),
      achievements: options.achievements ?? null,
      tempoCoaching: options.tempoCoaching ?? null,
      goalProjection: options.goalProjection ?? null,
      adaptiveProgress: options.adaptiveProgress ?? null,
      sessionEvidence: options.sessionEvidence ?? null,
      upcomingSchedule: options.upcomingSchedule ?? null,
      restState: options.restState ?? null,
      recentInjuryWindow: options.recentInjuryWindow ?? null,
      marathonFlag: options.marathonFlag ?? null,
      injurySignals: options.injurySignals ?? null,
      stream: true,
      commandId: options.commandId ?? null,
      runnerLevel: options.runnerLevel ?? 'beginner',
      responseStyle: {
        tone: 'conversational_coach',
        format: 'sectioned_markdown',
        avoid: ['report_style', 'medical_diagnosis', 'long_paragraphs'],
        emojiPolicy: 'contextual_0_to_3',
        firstSentence: 'reaction_before_analysis',
        maxParagraphSentences: 2,
        maxBulletsPerSection: 5
      }
    }),
    signal: options.signal
  })

  if (!response.ok) throw new Error(`AI 코칭 요청 실패: ${response.status}`)
  if (!response.body) throw new Error('AI 코칭 스트림을 열 수 없습니다.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = drainSseBuffer(buffer)
    buffer = parsed.rest

    const report = consumeCoachStreamEvents(parsed.events, options.onDelta)
    if (report) return report
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const parsed = drainSseBuffer(hasSseTerminator(buffer) ? buffer : `${buffer}\n\n`)
    const report = consumeCoachStreamEvents(parsed.events, options.onDelta)
    if (report) return report
  }

  throw new Error('AI 코칭 스트림이 완료되지 않았습니다.')
}

function summarizeWeatherForCoach(snapshot: WeatherSnapshot | null) {
  if (!snapshot) return null
  const upcomingHours = snapshot.hourly.slice(0, 12)
  const maxPrecipitationChance = Math.max(0, ...upcomingHours.map((hour) => hour.precipitationChance ?? 0))
  const precipitationAmountMm = Math.round(upcomingHours.reduce((sum, hour) => sum + (hour.precipitationAmountMm ?? 0), 0) * 10) / 10
  const rainHours = upcomingHours
    .filter((hour) => (hour.precipitationChance ?? 0) >= 0.35 || (hour.precipitationAmountMm ?? 0) >= 0.1)
    .map((hour) => hour.time)

  return {
    source: 'ios_weatherkit',
    observedAt: snapshot.observedAt,
    locationName: snapshot.locationName,
    current: {
      temperatureC: snapshot.current.temperatureC,
      apparentTemperatureC: snapshot.current.apparentTemperatureC,
      humidity: snapshot.current.humidity,
      windMps: snapshot.current.windMps,
      condition: snapshot.current.condition,
      symbolName: snapshot.current.symbolName
    },
    next12Hours: {
      maxPrecipitationChance,
      precipitationAmountMm,
      rainHours
    }
  }
}

export async function fetchCoachReports(): Promise<CoachReport[]> {
  const { data, error } = await requireSupabase().from('coach_reports').select('*').order('created_at', { ascending: false }).limit(80)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

export function drainSseBuffer(buffer: string) {
  const events: Array<{ event: string; data: unknown }> = []
  const chunks = buffer.split(/\r?\n\r?\n/)
  const rest = chunks.pop() ?? ''

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/).map((line) => line.trimStart())
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message'
    const dataText = chunk
      .split(/\r?\n/)
      .map((line) => line.trimStart())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!dataText) continue
    try {
      events.push({ event: eventName, data: JSON.parse(dataText) })
    } catch {
      events.push({ event: eventName, data: dataText })
    }
  }

  return { events, rest }
}

function hasSseTerminator(buffer: string) {
  return /\r?\n\r?\n$/.test(buffer)
}

export function consumeCoachStreamEvents(events: Array<{ event: string; data: unknown }>, onDelta: (delta: string) => void): CoachReport | null {
  for (const event of events) {
    if (event.event === 'delta') {
      const delta = getString(event.data, 'delta')
      if (delta) onDelta(delta)
      continue
    }
    if (event.event === 'done') {
      const report = parseCoachReport(event.data)
      if (report) return report
      throw new Error('AI 코칭 저장 응답이 비어 있습니다.')
    }
    if (event.event === 'error') {
      throw new Error(formatCoachStreamError(event.data))
    }
  }
  return null
}

function formatCoachStreamError(value: unknown) {
  const message = getString(value, 'error') || 'AI 코칭 스트리밍 실패'
  const stage = getString(value, 'stage')
  return stage ? `${message} [${stage}]` : message
}

function parseCoachReport(value: unknown): CoachReport | null {
  if (!value || typeof value !== 'object') return null
  const report = (value as { report?: unknown }).report
  if (!report || typeof report !== 'object') return null
  return report as CoachReport
}

function getString(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return ''
  const next = (value as Record<string, unknown>)[key]
  return typeof next === 'string' ? next : ''
}

function fromRow(row: CoachReportRow): CoachReport {
  return {
    id: row.id,
    selectedRunId: row.selected_run_id,
    userNote: row.user_note,
    report: row.report,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trainingMemoryUpdated: false,
    injuryContextSnapshot: normalizeInjurySnapshot(row.injury_context_snapshot),
    model: row.model ?? null
  }
}

/** DB jsonb → CoachInjuryContextSnapshot. 형태가 맞지 않으면 null. */
function normalizeInjurySnapshot(value: unknown): CoachInjuryContextSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.items)) return null
  const items = v.items
    .map((raw) => {
      const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      return {
        id: typeof it.id === 'string' ? it.id : '',
        title: typeof it.title === 'string' ? it.title : '',
        area: typeof it.area === 'string' ? it.area : '',
        status: typeof it.status === 'string' ? it.status : '',
        severity: typeof it.severity === 'number' ? it.severity : null,
        onsetDate: typeof it.onsetDate === 'string' ? it.onsetDate : null
      }
    })
    .filter((it) => it.id)
  return {
    capturedForRunDate: typeof v.capturedForRunDate === 'string' ? v.capturedForRunDate : null,
    activeInjuryItemId: typeof v.activeInjuryItemId === 'string' ? v.activeInjuryItemId : null,
    items
  }
}

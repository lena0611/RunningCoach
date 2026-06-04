import { getSupabaseAnonKey, getSupabaseFunctionUrl, requireSupabase } from '@/shared/api/supabase'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'
import type { RunnerLevel } from '@/entities/training-memory/model'

export type CoachReport = {
  id: string
  selectedRunId: string | null
  userNote: string
  report: string
  createdAt: string
  updatedAt?: string
  trainingMemoryUpdated?: boolean
  injuryUpdateProposal?: CoachInjuryUpdateProposal | null
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
}

export async function requestCoachRun(selectedRunId: string | null, userNote: string, currentWeather: WeatherSnapshot | null = null, runnerLevel: RunnerLevel = 'beginner'): Promise<CoachReport> {
  const { data, error } = await requireSupabase().functions.invoke('coach-run', {
    body: {
      selectedRunId,
      userNote,
      currentWeather: summarizeWeatherForCoach(currentWeather),
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
  }
): Promise<CoachReport> {
  const client = requireSupabase()
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요합니다.')

  const response = await fetch(getSupabaseFunctionUrl('coach-run'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      selectedRunId,
      userNote,
      currentWeather: summarizeWeatherForCoach(currentWeather),
      stream: true,
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

    for (const event of parsed.events) {
      if (event.event === 'delta') {
        const delta = getString(event.data, 'delta')
        if (delta) options.onDelta(delta)
        continue
      }
      if (event.event === 'done') {
        const report = parseCoachReport(event.data)
        if (report) return report
        throw new Error('AI 코칭 저장 응답이 비어 있습니다.')
      }
      if (event.event === 'error') {
        throw new Error(getString(event.data, 'error') || 'AI 코칭 스트리밍 실패')
      }
    }
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

function drainSseBuffer(buffer: string) {
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
    trainingMemoryUpdated: false
  }
}

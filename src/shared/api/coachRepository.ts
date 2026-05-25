import { requireSupabase } from '@/shared/api/supabase'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'

export type CoachReport = {
  id: string
  selectedRunId: string | null
  userNote: string
  report: string
  createdAt: string
  updatedAt?: string
  trainingMemoryUpdated?: boolean
}

type CoachReportRow = {
  id: string
  selected_run_id: string | null
  user_note: string
  report: string
  created_at: string
  updated_at?: string
}

export async function requestCoachRun(selectedRunId: string | null, userNote: string, currentWeather: WeatherSnapshot | null = null): Promise<CoachReport> {
  const { data, error } = await requireSupabase().functions.invoke('coach-run', {
    body: {
      selectedRunId,
      userNote,
      currentWeather: summarizeWeatherForCoach(currentWeather),
      responseStyle: {
        tone: 'conversational_coach',
        format: 'sectioned_markdown',
        avoid: ['report_style', 'medical_diagnosis', 'long_paragraphs'],
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

import { requireSupabase } from '@/shared/api/supabase'

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

export async function requestCoachRun(selectedRunId: string | null, userNote: string): Promise<CoachReport> {
  const { data, error } = await requireSupabase().functions.invoke('coach-run', {
    body: {
      selectedRunId,
      userNote,
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

export async function fetchCoachReports(): Promise<CoachReport[]> {
  const { data, error } = await requireSupabase().from('coach_reports').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(20)
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

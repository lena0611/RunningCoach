import { requireSupabase } from '@/shared/api/supabase'

export type CoachReport = {
  id: string
  selectedRunId: string | null
  userNote: string
  report: string
  createdAt: string
}

type CoachReportRow = {
  id: string
  selected_run_id: string | null
  user_note: string
  report: string
  created_at: string
}

export async function requestCoachRun(selectedRunId: string | null, userNote: string): Promise<CoachReport> {
  const { data, error } = await requireSupabase().functions.invoke('coach-run', {
    body: {
      selectedRunId,
      userNote
    }
  })
  if (error) throw error
  if (!data?.report) throw new Error('AI 코칭 응답이 비어 있습니다.')
  return data.report as CoachReport
}

export async function fetchCoachReports(): Promise<CoachReport[]> {
  const { data, error } = await requireSupabase().from('coach_reports').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data ?? []).map(fromRow)
}

function fromRow(row: CoachReportRow): CoachReport {
  return {
    id: row.id,
    selectedRunId: row.selected_run_id,
    userNote: row.user_note,
    report: row.report,
    createdAt: row.created_at
  }
}

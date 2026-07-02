import type { CoachReport } from '@/shared/api/coachRepository'

type CoachStreamSuccessInput = {
  report: CoachReport
  targetRunId: string
  displayedText: string
  pendingText: string
}

export function buildCoachStreamSuccessReport(input: CoachStreamSuccessInput): CoachReport {
  const streamedText = `${input.displayedText}${input.pendingText}`.trim()
  const reportText = input.report.report.trim() || streamedText

  return {
    ...input.report,
    selectedRunId: input.report.selectedRunId || input.targetRunId,
    report: reportText
  }
}

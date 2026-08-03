import type { CoachReport } from '@/shared/api/coachRepository'

type CoachStreamSuccessInput = {
  report: CoachReport
  /** 전역 대화(#616)는 대상 런이 없다 — null 이면 전역 스레드 리포트로 남는다. */
  targetRunId: string | null
  displayedText: string
  pendingText: string
}

export function buildCoachStreamSuccessReport(input: CoachStreamSuccessInput): CoachReport {
  const streamedText = `${input.displayedText}${input.pendingText}`.trim()
  const reportText = input.report.report.trim() || streamedText

  return {
    ...input.report,
    selectedRunId: input.report.selectedRunId || input.targetRunId || null,
    report: reportText
  }
}

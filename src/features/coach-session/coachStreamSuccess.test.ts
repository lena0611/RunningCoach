import { describe, expect, it } from 'vitest'
import { buildCoachStreamSuccessReport } from './coachStreamSuccess'
import type { CoachReport } from '@/shared/api/coachRepository'

const baseReport: CoachReport = {
  id: 'report-1',
  selectedRunId: 'run-1',
  userNote: 'Nsm훈련법이 뭐야',
  report: '저강도 기반에 짧은 자극을 얹는 흐름이야.',
  createdAt: '2026-07-02T10:00:00Z'
}

describe('buildCoachStreamSuccessReport', () => {
  it('keeps a complete persisted report unchanged', () => {
    const report = buildCoachStreamSuccessReport({
      report: baseReport,
      targetRunId: 'run-1',
      displayedText: '스트림 답변',
      pendingText: ''
    })

    expect(report.selectedRunId).toBe('run-1')
    expect(report.report).toBe('저강도 기반에 짧은 자극을 얹는 흐름이야.')
  })

  it('attaches the completed report to the run where the stream started', () => {
    const report = buildCoachStreamSuccessReport({
      report: { ...baseReport, selectedRunId: null },
      targetRunId: 'run-1',
      displayedText: '스트림 답변',
      pendingText: ''
    })

    expect(report.selectedRunId).toBe('run-1')
  })

  it('keeps the visible streamed answer when the done report has empty text', () => {
    const report = buildCoachStreamSuccessReport({
      report: { ...baseReport, report: '   ' },
      targetRunId: 'run-1',
      displayedText: 'NSM은 짧은 자극을 ',
      pendingText: '가볍게 넣는 흐름이야.'
    })

    expect(report.report).toBe('NSM은 짧은 자극을 가볍게 넣는 흐름이야.')
  })
})

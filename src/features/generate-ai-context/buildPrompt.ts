import type { RunLog } from '@/entities/run/model'
import type { TrainingMemory } from '@/entities/training-memory/model'
import { formatPace, formatDuration } from '@/shared/lib/format'
import { getLatestByTypes, getRunsWithinDays, sumDistance } from '@/shared/lib/runStats'

export function buildCoachContext(memory: TrainingMemory, runs: RunLog[], selectedRun: RunLog | null, question = ''): string {
  const recent14 = getRunsWithinDays(runs, 14)
  const recent30Distance = sumDistance(getRunsWithinDays(runs, 30))
  const latestLong = getLatestByTypes(runs, ['LSD', 'Steady Long'])
  const latestTempo = getLatestByTypes(runs, ['Tempo'])

  return [
    '# RunContext',
    '규칙 기반 코칭은 단일 기록만으로 판단하지 말고 아래 누적 맥락을 함께 본다.',
    '',
    '## TrainingMemory',
    JSON.stringify(memory, null, 2),
    '',
    `## 최근 14일 기록 (${recent14.length}건)`,
    ...recent14.map(formatRunLine),
    '',
    `## 최근 30일 누적 거리: ${recent30Distance}km`,
    `## 최근 LSD/Steady Long: ${latestLong ? formatRunLine(latestLong) : '없음'}`,
    `## 최근 Tempo: ${latestTempo ? formatRunLine(latestTempo) : '없음'}`,
    `## 오늘 선택된 RunLog: ${selectedRun ? formatRunLine(selectedRun) : '없음'}`,
    '',
    `## 사용자 질문: ${question || '(질문 없음)'}`
  ].join('\n')
}

function formatRunLine(run: RunLog): string {
  return `- ${run.date} ${run.type} ${run.distanceKm}km ${formatDuration(run.durationSec)} pace ${formatPace(run.avgPaceSec)} HR ${run.avgHeartRate ?? '-'} cadence ${run.cadence ?? '-'} memo ${run.memo || '-'}`
}

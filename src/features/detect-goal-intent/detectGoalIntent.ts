import type { TrainingMemory } from '@/entities/training-memory/model'

export type GoalIntentProposal = {
  title: string
  successCriteria: string
  strategyNotes: string
  notes: string
  sourceText: string
  duplicateGoalId: string | null
}

const goalIntentPattern = /(되고\s*싶|목표|달성|만들고\s*싶|가능하게|하고\s*싶|유지하고\s*싶|할\s*수\s*있게)/
const zone2Pattern = /(존\s*2|zone\s*2|z2|심박\s*존\s*2)/i

export function detectGoalIntent(text: string, memory?: TrainingMemory): GoalIntentProposal | null {
  const sourceText = text.trim()
  if (!sourceText || !goalIntentPattern.test(sourceText)) return null

  const pace = parsePace(sourceText)
  const hasZone2 = zone2Pattern.test(sourceText)
  if (!pace && !hasZone2) return null

  const titleParts = [
    pace ? `${pace.display}/km` : '',
    hasZone2 ? 'Zone 2 유지' : ''
  ].filter(Boolean)
  const title = titleParts.length ? titleParts.join('에서 ') : sourceText
  const activeGoalTitle = memory?.goals.find((goal) => goal.id === memory.activeGoalId)?.title ?? memory?.goal ?? '활성 목표'
  const successCriteria = [
    pace ? `평균 페이스 ${pace.display}/km 부근` : '',
    hasZone2 ? '심박 Zone 2 범위 유지' : ''
  ].filter(Boolean).join(' + ')
  const duplicateGoalId = memory?.goals.find((goal) => normalize(goal.title) === normalize(title))?.id ?? null

  return {
    title,
    successCriteria: successCriteria || sourceText,
    strategyNotes: `${activeGoalTitle}를 보조하는 개인화 하위 목표로 추적한다. Easy/회복 세션에서 페이스보다 심박 안정성과 호흡 여유를 우선 확인한다.`,
    notes: `AI 코칭 대화 입력에서 감지됨: "${sourceText}"`,
    sourceText,
    duplicateGoalId
  }
}

function parsePace(text: string): { sec: number; display: string } | null {
  const compact = text.match(/(?:^|[^\d])([3-9])\s*([0-5]\d)\s*(?:페이스|pace|\/?km)?/i)
  if (compact) {
    return formatPace(Number(compact[1]) * 60 + Number(compact[2]))
  }

  const colon = text.match(/([3-9])\s*[:'’]\s*([0-5]\d)/)
  if (colon) {
    return formatPace(Number(colon[1]) * 60 + Number(colon[2]))
  }

  const korean = text.match(/([3-9])\s*분(?:\s*([0-5]?\d)\s*초?)?/)
  if (korean) {
    return formatPace(Number(korean[1]) * 60 + Number(korean[2] ?? 0))
  }

  return null
}

function formatPace(sec: number) {
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return {
    sec,
    display: `${minutes}'${String(seconds).padStart(2, '0')}`
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '').replace(/’/g, "'")
}

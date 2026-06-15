import type { RunLog, RunType } from '@/entities/run/model'

/**
 * Phase B 적응 모델 공통 헬퍼 (#333~#335).
 * tempoAdaptation(#301)의 "추정→검증→채택" 철학을 Easy/Long Run/Recovery로 일반화할 때 쓰는
 * 공통 신호 계산만 모은다. 각 모델의 임계·등급은 모델 파일에서 정의한다.
 */

export type AdaptationStatus = 'estimated' | 'watch' | 'adopted'
export type AdaptationConfidence = 'low' | 'medium' | 'high'

export const MS_PER_DAY = 86400000
/** 다음 런을 회복 근거로 인정하는 최대 간격(일). 강세션은 휴식이 길어 5일까지 인정(tempo와 동일). */
export const RECOVERY_WINDOW_DAYS = 5

export function dayIndex(date: string): number | null {
  const t = Date.parse(`${(date ?? '').slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round(t / MS_PER_DAY) : null
}

/**
 * 해당 런 다음(최대 RECOVERY_WINDOW_DAYS 이내) 회복이 양호했는가.
 * 다음 기록이 없거나 회복 창을 벗어나면 null(미관측). 통증/높은 RPE/낮은 컨디션이면 false.
 */
export function nextRunRecoveryOk(run: RunLog, sortedAsc: RunLog[]): boolean | null {
  const next = sortedAsc.find((item) => item.date > run.date)
  if (!next) return null
  const gap = dayIndex(next.date)
  const here = dayIndex(run.date)
  if (gap !== null && here !== null && gap - here > RECOVERY_WINDOW_DAYS) return null
  if (next.painNote.trim()) return false
  if ((next.rpe ?? 0) >= 7) return false
  if ((next.conditionScore ?? 5) <= 2) return false
  return true
}

/** 고강도 세션(회복 주기 산정 대상): Tempo/Race. Steady Long/LSD는 장시간이지만 강도는 중간이라 제외. */
export const HARD_SESSION_TYPES: RunType[] = ['Tempo', 'Race']
export function isHardSession(run: RunLog): boolean {
  return HARD_SESSION_TYPES.includes(run.type)
}

/** 장거리 지속주(드리프트 평가 대상): LSD/Steady Long, 그리고 거리 ≥ 10km. */
export function isLongRun(run: RunLog): boolean {
  if (run.type === 'LSD' || run.type === 'Steady Long') return true
  return run.distanceKm >= 10
}

export function sortByDateAsc(runs: RunLog[]): RunLog[] {
  return [...runs].sort((a, b) => a.date.localeCompare(b.date))
}

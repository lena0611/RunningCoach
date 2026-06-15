/**
 * 런 저장 직후, 가장 가까운 미연결 세션 의도를 고르는 순수 매처 (#308).
 * Phase 2(의도 달성률)가 이 매칭 결과를 소비한다.
 *
 * 규칙:
 *   - 후보 = isPendingIntent (status 'planned' && runId 없음)
 *   - planned_date 와 run.date 의 일수 차가 윈도우(±1일) 이내만
 *   - 우선순위: 일수 차 작은 순 → planned_date 최근 → createdAt 최근
 *   - sessionType 일치는 강제하지 않는다(계획과 실제가 다를 수 있음).
 */

import { isPendingIntent, type SessionIntent } from '@/entities/session-intent/model'

export const SESSION_INTENT_MATCH_WINDOW_DAYS = 1

function diffDays(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY
  return Math.round((da - db) / 86_400_000)
}

export function selectIntentForRun(
  intents: SessionIntent[],
  run: { date: string }
): SessionIntent | null {
  const scored = intents
    .filter(isPendingIntent)
    .map((intent) => ({ intent, gap: Math.abs(diffDays(intent.plannedDate, run.date)) }))
    .filter((entry) => entry.gap <= SESSION_INTENT_MATCH_WINDOW_DAYS)

  if (!scored.length) return null

  scored.sort(
    (x, y) =>
      x.gap - y.gap ||
      y.intent.plannedDate.localeCompare(x.intent.plannedDate) ||
      y.intent.createdAt.localeCompare(x.intent.createdAt)
  )
  return scored[0].intent
}

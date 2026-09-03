/**
 * 런 저장 직후, 가장 가까운 미연결 세션 의도를 고르는 순수 매처 (#308).
 * Phase 2(의도 달성률)가 이 매칭 결과를 소비한다.
 *
 * 규칙:
 *   - 후보 = isPendingIntent (status 'planned' && runId 없음)
 *   - planned_date 가 run.date 와 같거나 **윈도우(1일) 안에서 더 이른** 것만 — 뒤로만(따라잡기).
 *     예정일 전날 런이 내일 의도를 소거하는 앞당김은 자동 매칭하지 않는다(스케줄 매처와 동일 정책, 2026-09-03).
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
    // gap = 예정일 − 런날짜: 0 같은 날, -1 하루 늦게(따라잡기). 양수(앞당김)는 제외.
    .map((intent) => ({ intent, gap: diffDays(intent.plannedDate, run.date) }))
    .filter((entry) => entry.gap <= 0 && entry.gap >= -SESSION_INTENT_MATCH_WINDOW_DAYS)
    .map((entry) => ({ intent: entry.intent, gap: Math.abs(entry.gap) }))

  if (!scored.length) return null

  scored.sort(
    (x, y) =>
      x.gap - y.gap ||
      y.intent.plannedDate.localeCompare(x.intent.plannedDate) ||
      y.intent.createdAt.localeCompare(x.intent.createdAt)
  )
  return scored[0].intent
}

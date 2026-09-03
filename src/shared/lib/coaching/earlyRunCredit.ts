/**
 * 앞당겨 뛴 런 → 오늘 세션 갈음 "제안" 후보(2026-09-03, SSOT §세션 변경 행동 모델).
 *
 * 매처는 앞당김을 자동 크레딧하지 않는다(뒤로만 따라잡기). 대신 다음 날 코치가 묻는다:
 * "어제 {타입} {km}km 를 이미 뛰었어요. 오늘 {세션}을 어제 런으로 갈음하고 쉴까요?" — 승인 시에만 연결.
 *
 * 후보 조건(전부 결정론):
 *  - 오늘 날짜에 planned 세션이 있다(rested/superseded/done 제외)
 *  - 어제 날짜에 **어느 세션·의도에도 귀속되지 않은** 런이 있다(attributedRunIds 밖)
 *  - 타입이 호환된다: 같은 타입, 또는 둘 다 저강도(Easy/Recovery). Tempo 런이 Easy 세션을 갈음하진 않는다(세션 목적 보호).
 * ⚠ shared 레이어 — entities 타입을 import 하지 않고 구조적 타입으로 받는다(#397 래칫).
 */

export type EarlyRunCreditCandidate = {
  sessionId: string
  sessionDate: string
  sessionType: string
  runId: string
  runDate: string
  runType: string
  runKm: number
}

type SessionLike = { id: string; date: string; sessionType: string; status: string }
type RunLike = { id: string; date: string; type: string; distanceKm: number }

const LOW_INTENSITY = new Set(['Easy', 'Recovery'])

function isCompatible(sessionType: string, runType: string): boolean {
  return sessionType === runType || (LOW_INTENSITY.has(sessionType) && LOW_INTENSITY.has(runType))
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function findEarlyRunCreditCandidate(input: {
  sessions: SessionLike[]
  runs: RunLike[]
  attributedRunIds: Set<string>
  today: string
}): EarlyRunCreditCandidate | null {
  const todaySessions = input.sessions.filter((s) => s.date === input.today && s.status === 'planned')
  if (!todaySessions.length) return null
  const yesterday = addDays(input.today, -1)
  const candidates = input.runs
    .filter((r) => r.date === yesterday && !input.attributedRunIds.has(r.id))
    .sort((a, b) => b.distanceKm - a.distanceKm)
  for (const session of todaySessions) {
    const run = candidates.find((r) => isCompatible(session.sessionType, r.type))
    if (!run) continue
    return {
      sessionId: session.id,
      sessionDate: session.date,
      sessionType: session.sessionType,
      runId: run.id,
      runDate: run.date,
      runType: run.type,
      runKm: run.distanceKm
    }
  }
  return null
}

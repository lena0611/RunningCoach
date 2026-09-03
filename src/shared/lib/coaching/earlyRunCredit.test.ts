import { describe, expect, it } from 'vitest'
import { findEarlyRunCreditCandidate } from '@/shared/lib/coaching/earlyRunCredit'

const today = '2026-09-03'
const thuEasy = { id: 'thu', date: today, sessionType: 'Easy', status: 'planned' }
const wedRun = { id: 'r1', date: '2026-09-02', type: 'Easy', distanceKm: 3.5 }

describe('findEarlyRunCreditCandidate (앞당긴 런 → 오늘 세션 갈음 제안 후보)', () => {
  it('오늘 Easy planned + 어제 미귀속 Easy 런 → 후보', () => {
    const c = findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [wedRun], attributedRunIds: new Set(), today })
    expect(c).toEqual({ sessionId: 'thu', sessionDate: today, sessionType: 'Easy', runId: 'r1', runDate: '2026-09-02', runType: 'Easy', runKm: 3.5 })
  })

  it('어제 런이 이미 어느 세션에 귀속됐으면 후보 아님', () => {
    expect(findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [wedRun], attributedRunIds: new Set(['r1']), today })).toBeNull()
  })

  it('오늘 세션이 planned 가 아니면(done/rested/superseded) 후보 아님', () => {
    for (const status of ['done', 'rested', 'superseded', 'skipped']) {
      expect(findEarlyRunCreditCandidate({ sessions: [{ ...thuEasy, status }], runs: [wedRun], attributedRunIds: new Set(), today })).toBeNull()
    }
  })

  it('타입 호환: Easy↔Recovery 는 갈음 가능, Tempo 런은 Easy 세션을 갈음하지 않는다(세션 목적 보호)', () => {
    const recovery = { ...wedRun, type: 'Recovery' }
    expect(findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [recovery], attributedRunIds: new Set(), today })?.runId).toBe('r1')
    const tempo = { ...wedRun, type: 'Tempo' }
    expect(findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [tempo], attributedRunIds: new Set(), today })).toBeNull()
    const lsdSession = { ...thuEasy, sessionType: 'LSD' }
    expect(findEarlyRunCreditCandidate({ sessions: [lsdSession], runs: [wedRun], attributedRunIds: new Set(), today })).toBeNull()
  })

  it('오늘 세션이 여럿이면 호환되는 첫 세션에 붙인다(가장 긴 런 우선)', () => {
    const short = { ...wedRun, id: 'short', distanceKm: 2 }
    const long = { ...wedRun, id: 'long', distanceKm: 5 }
    expect(findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [short, long], attributedRunIds: new Set(), today })?.runId).toBe('long')
  })

  it('그제 런은 후보 아님(하루 앞당김만)', () => {
    const older = { ...wedRun, date: '2026-09-01' }
    expect(findEarlyRunCreditCandidate({ sessions: [thuEasy], runs: [older], attributedRunIds: new Set(), today })).toBeNull()
  })
})

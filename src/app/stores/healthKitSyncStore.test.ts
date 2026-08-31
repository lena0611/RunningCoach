import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { HealthKitRunCandidate } from '@/features/import-healthkit-run/healthKitBridge'
import { isRouteAuthSuspectPair, isRouteBackfillTarget } from './healthKitSyncStore'

// (#620) 경로 백필 판정 — 첫 임포트 시점에 routePoints 가 비어 들어온 런(권한 결손·경로 늦은
// 도착 레이스)을 다음 sync 가 같은 워크아웃(externalId) 후보의 경로로 1회 보강하는 게이트.
// 순수 판정만 검증한다(병합·저장은 기존 repair 보존 병합을 재사용).

const point = { offsetSec: 0, latitude: 37.5, longitude: 127.0, altitude: 30 }

function makeRun(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'r1',
    source: 'healthkit',
    externalId: 'wk-1',
    routePoints: [],
    ...overrides
  } as RunLog
}

function makeCandidate(overrides: Partial<HealthKitRunCandidate> = {}): HealthKitRunCandidate {
  return {
    externalId: 'wk-1',
    routePoints: [point],
    ...overrides
  } as HealthKitRunCandidate
}

describe('isRouteBackfillTarget (#620)', () => {
  it('externalId 일치 + 저장 경로 빔 + 후보 경로 있음 → 백필 대상', () => {
    expect(isRouteBackfillTarget(makeRun(), makeCandidate())).toBe(true)
  })

  it('routePoints 가 undefined 인 저장 런도 빈 것으로 취급해 백필 대상', () => {
    expect(isRouteBackfillTarget(makeRun({ routePoints: undefined }), makeCandidate())).toBe(true)
  })

  it('저장 런에 이미 경로가 있으면 제외 — 백필 1회 후 재매칭되지 않는 멱등 가드', () => {
    expect(isRouteBackfillTarget(makeRun({ routePoints: [point] }), makeCandidate())).toBe(false)
  })

  it('후보 경로가 비어 있으면 제외(권한 결손 지속·HealthKit 미기록 — 덮어쓸 것이 없음)', () => {
    expect(isRouteBackfillTarget(makeRun(), makeCandidate({ routePoints: [] }))).toBe(false)
  })

  it('externalId 불일치·부재 시 제외(다른 워크아웃/레거시 런은 기존 repair 선별 소관)', () => {
    expect(isRouteBackfillTarget(makeRun({ externalId: 'wk-2' }), makeCandidate())).toBe(false)
    expect(isRouteBackfillTarget(makeRun({ externalId: null }), makeCandidate())).toBe(false)
    expect(isRouteBackfillTarget(makeRun(), makeCandidate({ externalId: undefined }))).toBe(false)
  })

  it('healthkit 외 소스는 제외(수동/FIT 런의 경로 부재는 사용자 의도일 수 있음)', () => {
    expect(isRouteBackfillTarget(makeRun({ source: 'manual' as RunLog['source'] }), makeCandidate())).toBe(false)
  })
})

// (#722) 경로 읽기 권한 차단 판정 — 백필의 거울상. 운동 읽기가 막히면 유입 0건으로 잡히지만,
// 경로만 막히면 러닝은 들어오고 지도만 조용히 사라진다(2026-07 실사고 #607·#619).
// 판정 근거는 추론이 아니라 대조다: 우리 DB 에 경로가 있는 그 워크아웃이 0점으로 돌아왔는가.
describe('isRouteAuthSuspectPair (#722)', () => {
  it('저장본엔 경로가 있는데 같은 워크아웃 재조회가 0점 → 권한 차단으로 판정', () => {
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: [point] }), makeCandidate({ routePoints: [] }))).toBe(true)
  })

  it('후보에 경로가 있으면 정상 — 판정 안 함', () => {
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: [point] }), makeCandidate())).toBe(false)
  })

  it('저장본에 경로가 없으면 비교 대상 아님 — 트레드밀·self-race 오탐 구조적 차단', () => {
    expect(isRouteAuthSuspectPair(makeRun(), makeCandidate({ routePoints: [] }))).toBe(false)
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: undefined }), makeCandidate({ routePoints: [] }))).toBe(false)
  })

  it('externalId 불일치·부재 시 제외(다른 워크아웃과 대조하면 안 된다)', () => {
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: [point], externalId: 'wk-2' }), makeCandidate({ routePoints: [] }))).toBe(false)
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: [point], externalId: null }), makeCandidate({ routePoints: [] }))).toBe(false)
  })

  it('healthkit 외 소스는 제외(FIT/수동 런의 경로는 HealthKit 권한과 무관)', () => {
    expect(isRouteAuthSuspectPair(makeRun({ routePoints: [point], source: 'manual' as RunLog['source'] }), makeCandidate({ routePoints: [] }))).toBe(false)
  })

  it('백필 대상과 상호배타 — 같은 짝이 둘 다 참일 수 없다', () => {
    const backfill = { run: makeRun(), candidate: makeCandidate() }
    const blocked = { run: makeRun({ routePoints: [point] }), candidate: makeCandidate({ routePoints: [] }) }
    expect(isRouteBackfillTarget(backfill.run, backfill.candidate)).toBe(true)
    expect(isRouteAuthSuspectPair(backfill.run, backfill.candidate)).toBe(false)
    expect(isRouteBackfillTarget(blocked.run, blocked.candidate)).toBe(false)
    expect(isRouteAuthSuspectPair(blocked.run, blocked.candidate)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { buildWatchTrainingPayload } from '@/features/watch-race/watchTrainingPayload'

const AT = '2026-08-28T09:00:00Z'

function session(over: Partial<NonNullable<ReturnType<typeof buildWatchTrainingPayload>['session']>> = {}) {
  return {
    date: '2026-08-28', type: 'Easy + Strides', label: 'Easy + Strides',
    distanceKm: 5, durationMin: 40, keySession: false, ...over
  }
}

describe('buildWatchTrainingPayload (#711)', () => {
  it('세션이 없으면 본훈련 모드를 비활성으로 내린다 — 없는 훈련을 지어내지 않는다', () => {
    const p = buildWatchTrainingPayload({ generatedAt: AT, session: null })
    expect(p.session).toBeNull()
    expect(p.timeline).toEqual([])
    expect(p.guards.easyCeilingBpm).toBeNull()
  })

  it('의도와 핵심을 실어 보낸다 — 초보는 뛰는 동안 처방을 잊는다', () => {
    const p = buildWatchTrainingPayload({
      generatedAt: AT, session: session(), why: '복귀 초반 기반 다지기', keyPoint: '끝까지 대화 가능한 강도'
    })
    expect(p.intent.why).toBe('복귀 초반 기반 다지기')
    expect(p.intent.keyPoint).toBe('끝까지 대화 가능한 강도')
  })

  it('보정이 있으면 "감안했다" + "그래도 문제없다"를 함께 말한다', () => {
    const p = buildWatchTrainingPayload({
      generatedAt: AT, session: session(), weatherNote: '체감 31도·습도 80% — 심박이 쉽게 오릅니다.'
    })
    expect(p.conditions.adjusted).toBe(true)
    expect(p.conditions.note).toMatch(/숨 편안함/)
    expect(p.conditions.note).toMatch(/프로그램상 문제없습니다/)
  })

  it('보정이 없으면 없다고 명시한다 — 침묵이 아니라 명시가 신뢰를 만든다', () => {
    const p = buildWatchTrainingPayload({ generatedAt: AT, session: session() })
    expect(p.conditions.adjusted).toBe(false)
    expect(p.conditions.note).toMatch(/평소와 비슷/)
  })

  it('스트라이드 회차가 타임라인으로 나간다 — "지금부터 N초, M회차"', () => {
    const p = buildWatchTrainingPayload({ generatedAt: AT, session: session(), strideReps: 4 })
    const intervals = p.timeline.filter((s) => s.phase === 'interval')
    expect(intervals).toHaveLength(4)
    expect(intervals[0].cue).toMatch(/지금부터 18초 스트라이드, 1회차/)
  })

  it('심박 상한은 그대로 내린다 — 더워도 올리지 않는다(SSOT §외부 조건)', () => {
    const p = buildWatchTrainingPayload({
      generatedAt: AT, session: session(), easyCeilingBpm: 138,
      weatherNote: '체감 31도 — 심박이 쉽게 오릅니다.'
    })
    expect(p.guards.easyCeilingBpm).toBe(138)
  })

  it('상한 초과는 지속됐을 때만 말한다 — 단발 스파이크에 말 걸지 않는다', () => {
    const p = buildWatchTrainingPayload({ generatedAt: AT, session: session(), easyCeilingBpm: 138 })
    expect(p.guards.hrOverSustainSec).toBe(180)
  })

  it('초반 오버페이스 판정은 저강도에서만 — Tempo 는 null', () => {
    const easy = buildWatchTrainingPayload({ generatedAt: AT, session: session({ type: 'Easy' }) })
    const tempo = buildWatchTrainingPayload({ generatedAt: AT, session: session({ type: 'Tempo' }) })
    expect(easy.guards.earlyFastPaceSec).toBe(30)
    expect(tempo.guards.earlyFastPaceSec).toBeNull()
  })

  it('처방 정보가 없으면 타임라인이 비고, 워치는 집행 모드로 들어가지 않는다', () => {
    const p = buildWatchTrainingPayload({
      generatedAt: AT, session: session({ distanceKm: null, durationMin: null })
    })
    expect(p.session).not.toBeNull()
    expect(p.timeline).toEqual([])
  })
})

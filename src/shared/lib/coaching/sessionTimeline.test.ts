import { describe, expect, it } from 'vitest'
import { buildSessionTimeline, timelineKnownDurationSec } from '@/shared/lib/coaching/sessionTimeline'

describe('buildSessionTimeline (#711 선행)', () => {
  it('처방 정보가 없으면 빈 배열 — 없는 구간을 지어내지 않는다', () => {
    expect(buildSessionTimeline({ sessionType: 'Easy', distanceKm: null, durationMin: null })).toEqual([])
  })

  it('Easy + Strides: 회차마다 스트라이드/회복이 번갈아 나오고, 마지막 뒤엔 회복이 없다', () => {
    const steps = buildSessionTimeline({
      sessionType: 'Easy + Strides', distanceKm: 5, durationMin: 40, strideReps: 3
    })
    const intervals = steps.filter((s) => s.phase === 'interval')
    const recovers = steps.filter((s) => s.phase === 'recover')
    expect(intervals).toHaveLength(3)
    expect(recovers).toHaveLength(2) // 마지막 회차 뒤는 쿨다운으로 간다
    expect(intervals[0].cue).toMatch(/지금부터 18초 스트라이드, 1회차/)
    expect(intervals[2].rep).toBe(3)
    expect(intervals[2].ofReps).toBe(3)
  })

  it('스트라이드 회수가 0이면 반복 구간을 만들지 않는다 (부상 게이트로 생략된 경우)', () => {
    const steps = buildSessionTimeline({
      sessionType: 'Easy + Strides', distanceKm: 5, durationMin: 40, strideReps: 0
    })
    expect(steps.some((s) => s.phase === 'interval')).toBe(false)
    expect(steps.map((s) => s.phase)).toEqual(['warmup', 'main', 'cooldown'])
  })

  it('저강도는 별도 웜업이 아니라 ease-in 이다 (SSOT §세션 실행 라이프사이클)', () => {
    const steps = buildSessionTimeline({ sessionType: 'Easy', distanceKm: 6, durationMin: 45 })
    expect(steps[0].phase).toBe('warmup')
    expect(steps[0].cue).toMatch(/처음 5분은 더 느리게/)
    expect(steps[0].durationSec).toBe(300)
  })

  it('Recovery 는 더 낮은 강도 문구를 쓴다', () => {
    const steps = buildSessionTimeline({ sessionType: 'Recovery', distanceKm: 4, durationMin: 30 })
    expect(steps[0].cue).toMatch(/걷듯이 아주 천천히/)
    expect(steps[1].cue).toMatch(/회복이 목적/)
  })

  it('Tempo 는 정식 웜업·드릴·쿨다운이 본세트에 더해진다', () => {
    const steps = buildSessionTimeline({ sessionType: 'Tempo', distanceKm: 8, durationMin: 45 })
    expect(steps.map((s) => s.phase)).toEqual(['warmup', 'warmup', 'main', 'cooldown'])
    expect(steps[1].cue).toMatch(/드릴/)
    expect(steps[0].durationSec).toBe(600)
    expect(steps[3].durationSec).toBe(600)
  })

  it('롱런은 롤링 워밍업 1km 로 시작한다', () => {
    const steps = buildSessionTimeline({ sessionType: 'LSD', distanceKm: 12, durationMin: 90 })
    expect(steps[0].distanceKm).toBe(1)
    expect(steps[0].cue).toMatch(/롤링 워밍업/)
    expect(steps[1].distanceKm).toBe(12)
  })

  it('거리가 없으면 본훈련을 시간으로 잡는다', () => {
    const steps = buildSessionTimeline({ sessionType: 'Easy', distanceKm: null, durationMin: 40 })
    const main = steps.find((s) => s.phase === 'main')
    expect(main?.durationSec).toBe(2400)
    expect(main?.distanceKm).toBeUndefined()
  })

  it('총 시간은 시간 기반 구간만 더한다 (거리 구간은 셀 수 없다)', () => {
    const steps = buildSessionTimeline({
      sessionType: 'Easy + Strides', distanceKm: 5, durationMin: 40, strideReps: 2
    })
    // ease-in 300 + 스트라이드 18*2 + 회복 75 + ease-out 180 = 591 (본런은 거리 기반이라 제외)
    expect(timelineKnownDurationSec(steps)).toBe(300 + 18 * 2 + 75 + 180)
  })
})

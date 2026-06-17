import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem } from '@/entities/training-memory/model'
import type { ChronicLoadTrend } from '@/shared/lib/runStats'
import { collectCoachMoments, type CoachMomentContext } from '@/shared/lib/coaching/coachMoments'

const today = new Date('2026-06-17T00:00:00')
const stable: ChronicLoadTrend = { status: 'stable', increasePct: 5, last30Km: 100, prev30Km: 95, spikeThreshold: 50, risingThreshold: 30 }
const spike: ChronicLoadTrend = { status: 'spike', increasePct: 55, last30Km: 150, prev30Km: 97, spikeThreshold: 50, risingThreshold: 30 }

function run(id: string, date: string, km: number): RunLog {
  return { id, date, distanceKm: km } as unknown as RunLog
}
function injury(o: Partial<TrainingInjuryItem>): TrainingInjuryItem {
  return { id: 'i', area: o.area ?? '무릎', status: o.status ?? 'active', severity: o.severity ?? 3 } as unknown as TrainingInjuryItem
}
function ctx(over: Partial<CoachMomentContext>): CoachMomentContext {
  return { runs: [], attributedRunIds: new Set(), chronic: stable, injury: null, today, scheduleExists: true, ...over }
}

const extraRuns = [run('e1', '2026-06-16', 6), run('e2', '2026-06-12', 7), run('e3', '2026-06-08', 6)]

describe('collectCoachMoments', () => {
  it('아무 신호 없으면 빈 배열', () => {
    expect(collectCoachMoments(ctx({}))).toEqual([])
  })

  it('추가런 패턴이면 extra-run 모먼트(의도 질문 포함)', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns }))
    const extra = moments.find((m) => m.kind === 'extra-run')
    expect(extra).toBeTruthy()
    expect(extra!.options?.length).toBeGreaterThan(0)
    expect(extra!.options!.some((o) => o.sentiment === 'positive')).toBe(true)
  })

  it('부상>부하>추가런 우선순위로 정렬', () => {
    const moments = collectCoachMoments(
      ctx({ runs: extraRuns, chronic: spike, injury: injury({ severity: 4 }) })
    )
    expect(moments.map((m) => m.kind)).toEqual(['injury', 'load-spike', 'extra-run'])
  })

  it('이탈(놓침)이면 deviation 모먼트', () => {
    const moments = collectCoachMoments(ctx({ deviation: { shouldRealign: true, reason: '핵심 세션 2개를 놓쳤어요.', missedCount: 2 } }))
    expect(moments.some((m) => m.kind === 'deviation')).toBe(true)
  })

  it('준비도 충분이면 긍정 격려(goal-progress)', () => {
    const moments = collectCoachMoments(ctx({ goalProgress: { readinessScore: 82, readinessLevel: '충분', dDayText: 'D-30' } }))
    const g = moments.find((m) => m.kind === 'goal-progress')
    expect(g).toBeTruthy()
    expect(g!.message).toContain('82%')
  })

  it('준비도 부족/보통이면 격려 안 함(부상·부하 감지기가 담당)', () => {
    expect(collectCoachMoments(ctx({ goalProgress: { readinessScore: 40, readinessLevel: '부족', dDayText: '' } }))).toEqual([])
  })

  it('스케줄이 없으면 추가런 분류 안 함(무계획이면 비교 대상 없음)', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, scheduleExists: false }))
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(false)
  })

  it('전체 우선순위: 부상>부하>이탈>추가런>목표진척', () => {
    const moments = collectCoachMoments(
      ctx({
        runs: extraRuns,
        chronic: spike,
        injury: injury({ severity: 4 }),
        deviation: { shouldRealign: true, reason: 'x', missedCount: 3 },
        goalProgress: { readinessScore: 80, readinessLevel: '충분', dDayText: '' }
      })
    )
    expect(moments.map((m) => m.kind)).toEqual(['injury', 'load-spike', 'deviation', 'extra-run', 'goal-progress'])
  })

  it('러닝부하 부위(발/다리) 통증이 최근 런에 있고 활성부상 없으면 부상 체크인 제안', () => {
    const runs = [{ id: 'p', date: '2026-06-16', distanceKm: 6, painNote: '통증 보통 · 다리' } as unknown as RunLog]
    const m = collectCoachMoments(ctx({ runs })).find((x) => x.kind === 'pain-followup')
    expect(m).toBeTruthy()
    expect(m!.action?.kind).toBe('open-injury-screening')
  })

  it('상체 통증은 러닝 플랜 비차단 — 부상 제안 안 함', () => {
    const runs = [{ id: 'u', date: '2026-06-16', distanceKm: 6, painNote: '통증 경미 · 상체' } as unknown as RunLog]
    expect(collectCoachMoments(ctx({ runs })).some((x) => x.kind === 'pain-followup')).toBe(false)
  })

  it('이미 활성 부상이 있으면 pain-followup 안 함(전용 체크인이 담당)', () => {
    const runs = [{ id: 'p', date: '2026-06-16', distanceKm: 6, painNote: '통증 보통 · 발' } as unknown as RunLog]
    expect(collectCoachMoments(ctx({ runs, injury: injury({ severity: 2 }) })).some((x) => x.kind === 'pain-followup')).toBe(false)
  })

  it('dismissed 키는 제외', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, chronic: spike }), new Set(['load-spike']))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(false)
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(true)
  })
})

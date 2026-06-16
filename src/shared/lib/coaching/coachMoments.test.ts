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
  return { runs: [], attributedRunIds: new Set(), chronic: stable, injury: null, today, ...over }
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

  it('dismissed 키는 제외', () => {
    const moments = collectCoachMoments(ctx({ runs: extraRuns, chronic: spike }), new Set(['load-spike']))
    expect(moments.some((m) => m.kind === 'load-spike')).toBe(false)
    expect(moments.some((m) => m.kind === 'extra-run')).toBe(true)
  })
})

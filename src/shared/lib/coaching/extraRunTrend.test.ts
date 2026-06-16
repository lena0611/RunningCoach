import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { analyzeExtraRunTrend, buildExtraRunInquiry } from '@/shared/lib/coaching/extraRunTrend'

const today = new Date('2026-06-17T00:00:00')

function run(id: string, date: string, distanceKm: number): RunLog {
  return { id, date, distanceKm } as unknown as RunLog
}

describe('analyzeExtraRunTrend', () => {
  it('단발성(1회)은 패턴 아님', () => {
    const runs = [run('a', '2026-06-16', 6), run('b', '2026-06-14', 8)]
    const attributed = new Set(['b'])
    const t = analyzeExtraRunTrend(runs, attributed, today)
    expect(t.count).toBe(1)
    expect(t.isPattern).toBe(false)
    expect(t.noteworthy).toBe(false)
  })

  it('미귀속 추가 런 3회+ & 볼륨 비중 높으면 noteworthy', () => {
    const runs = [
      run('e1', '2026-06-16', 6),
      run('e2', '2026-06-12', 7),
      run('e3', '2026-06-08', 6),
      run('s1', '2026-06-15', 5) // 귀속(지정)
    ]
    const attributed = new Set(['s1'])
    const t = analyzeExtraRunTrend(runs, attributed, today)
    expect(t.count).toBe(3)
    expect(t.isPattern).toBe(true)
    expect(t.isMeaningfulVolume).toBe(true)
    expect(t.noteworthy).toBe(true)
  })

  it('30일 밖 런은 제외', () => {
    const runs = [run('old', '2026-04-01', 10), run('e1', '2026-06-16', 6)]
    const t = analyzeExtraRunTrend(runs, new Set(), today)
    expect(t.count).toBe(1)
  })
})

describe('buildExtraRunInquiry', () => {
  it('noteworthy 일 때만 관심+의도 질문 생성', () => {
    const runs = [run('e1', '2026-06-16', 6), run('e2', '2026-06-12', 7), run('e3', '2026-06-08', 6)]
    const t = analyzeExtraRunTrend(runs, new Set(), today)
    const q = buildExtraRunInquiry(t)
    expect(q).not.toBeNull()
    expect(q!.message).toContain('인상적')
    expect(q!.options.length).toBeGreaterThan(0)
  })

  it('단발성이면 질문 없음(null)', () => {
    const runs = [run('e1', '2026-06-16', 6)]
    const t = analyzeExtraRunTrend(runs, new Set(), today)
    expect(buildExtraRunInquiry(t)).toBeNull()
  })
})

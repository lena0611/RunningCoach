import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { deriveObservedEasyPace } from '@/shared/lib/coaching/observedEasyPace'

const today = new Date('2026-06-18T00:00:00')

function run(date: string, distanceKm: number, durationSec: number, avgHeartRate: number | null): RunLog {
  return { id: date, date, distanceKm, durationSec, avgHeartRate, type: 'Easy' } as unknown as RunLog
}

describe('deriveObservedEasyPace (#405)', () => {
  it('Easy 심박 이하 런 ≥3건이면 페이스 중앙값 산출', () => {
    const runs = [
      run('2026-06-10', 5, 2100, 130), // 420 s/km
      run('2026-06-12', 6, 2520, 135), // 420 s/km
      run('2026-06-14', 5, 2250, 138) // 450 s/km
    ]
    const r = deriveObservedEasyPace(runs, 139, today)
    expect(r).not.toBeNull()
    expect(r!.easyPaceSec).toBe(420) // 중앙값
    expect(r!.sampleCount).toBe(3)
    // 규약: [느린, 빠른]
    expect(r!.easyPaceRangeSec[0]).toBeGreaterThan(r!.easyPaceRangeSec[1])
  })

  it('심박 상한 초과 런은 제외', () => {
    const runs = [
      run('2026-06-10', 5, 2100, 130),
      run('2026-06-12', 6, 2520, 135),
      run('2026-06-14', 5, 1500, 165) // 빠르지만 심박 165 > 139 → 제외
    ]
    // 남은 표본 2건 < 최소 3 → null
    expect(deriveObservedEasyPace(runs, 139, today)).toBeNull()
  })

  it('표본 < 3이면 null(추정 폴백)', () => {
    expect(deriveObservedEasyPace([run('2026-06-10', 5, 2100, 130)], 139, today)).toBeNull()
  })

  it('심박 상한 없으면 null', () => {
    const runs = [run('2026-06-10', 5, 2100, 130), run('2026-06-12', 6, 2520, 135), run('2026-06-14', 5, 2250, 138)]
    expect(deriveObservedEasyPace(runs, null, today)).toBeNull()
  })

  it('윈도우(90일) 밖 런은 제외', () => {
    const runs = [
      run('2026-01-01', 5, 2100, 130), // 90일 밖
      run('2026-06-12', 6, 2520, 135),
      run('2026-06-14', 5, 2250, 138)
    ]
    expect(deriveObservedEasyPace(runs, 139, today)).toBeNull() // 윈도우 내 2건 < 3
  })
})

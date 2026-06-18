import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { deriveObservedEasyPace } from '@/shared/lib/coaching/observedEasyPace'

const today = new Date('2026-06-18T00:00:00')

function run(date: string, distanceKm: number, durationSec: number, avgHeartRate: number | null): RunLog {
  return { id: date, date, distanceKm, durationSec, avgHeartRate, type: 'Easy' } as unknown as RunLog
}

// pace 헬퍼: km당 초 → 5km 런의 durationSec
const at = (date: string, paceSecPerKm: number, hr: number) => run(date, 5, paceSecPerKm * 5, hr)

describe('deriveObservedEasyPace (#405)', () => {
  it('Easy 심박 이하 런 ≥3건이면 페이스 산출(전부 동일 페이스면 그 값)', () => {
    const runs = [at('2026-06-09', 420, 135), at('2026-06-11', 420, 137), at('2026-06-13', 420, 138)]
    const r = deriveObservedEasyPace(runs, 139, today, 130)
    expect(r).not.toBeNull()
    expect(r!.easyPaceSec).toBe(420) // 동일 페이스 → 가중 무관 420
    expect(r!.sampleCount).toBe(3)
    expect(r!.easyPaceRangeSec[0]).toBeGreaterThan(r!.easyPaceRangeSec[1]) // [느린, 빠른]
  })

  it('최근 가중(EWMA식): 최근이 빠르면 추천도 단순평균보다 빨라짐', () => {
    const oldSlow = [at('2026-04-20', 540, 135), at('2026-04-25', 540, 135), at('2026-04-30', 540, 135)]
    const recentFast = [at('2026-06-13', 420, 135), at('2026-06-15', 420, 135), at('2026-06-17', 420, 135)]
    const r = deriveObservedEasyPace([...oldSlow, ...recentFast], 139, today, 130)
    expect(r!.sampleCount).toBe(6)
    expect(r!.easyPaceSec).toBeLessThan(480) // 단순평균(480=8:00)보다 빠름 — 최근 7:00 쪽으로 당겨짐
    expect(r!.easyPaceSec).toBeGreaterThan(420)
  })

  it('Z2 밴드(회복 상한 초과)만 써서 회복 런 제외 → 더 빠름', () => {
    const runs = [
      at('2026-06-05', 540, 120), // 회복존(≤130) 제외 대상
      at('2026-06-07', 540, 122),
      at('2026-06-09', 420, 135),
      at('2026-06-11', 420, 137),
      at('2026-06-13', 450, 138)
    ]
    const z2 = deriveObservedEasyPace(runs, 139, today, 130)
    const all = deriveObservedEasyPace(runs, 139, today) // 회복 상한 미지정 → 회복 포함
    expect(z2!.sampleCount).toBe(3) // 회복 2건 제외
    expect(z2!.easyPaceSec).toBeLessThan(all!.easyPaceSec) // 회복(느림) 빠지면 빨라짐
  })

  it('Z2 표본 < 3이면 이지 상한 이하 전체로 폴백(추정으로 안 감)', () => {
    const runs = [at('2026-06-05', 540, 120), at('2026-06-07', 540, 122), at('2026-06-09', 540, 124), at('2026-06-11', 420, 137)]
    const r = deriveObservedEasyPace(runs, 139, today, 130)
    expect(r!.sampleCount).toBe(4) // 폴백
  })

  it('표본 < 3이면 null(추정 폴백)', () => {
    expect(deriveObservedEasyPace([at('2026-06-10', 420, 130)], 139, today)).toBeNull()
  })

  it('심박 상한 없으면 null', () => {
    const runs = [at('2026-06-09', 420, 135), at('2026-06-11', 420, 137), at('2026-06-13', 420, 138)]
    expect(deriveObservedEasyPace(runs, null, today)).toBeNull()
  })

  it('윈도우(90일) 밖 런은 제외', () => {
    const runs = [at('2026-01-01', 420, 135), at('2026-06-12', 420, 137), at('2026-06-14', 420, 138)]
    expect(deriveObservedEasyPace(runs, 139, today, 130)).toBeNull() // 윈도우 내 2건 < 3
  })
})

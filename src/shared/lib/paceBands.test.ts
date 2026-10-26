import { describe, expect, it } from 'vitest'
import { easyPaceReference, habitualPaceSec, paceBandsFor } from './paceBands'

const today = new Date('2026-10-26T09:00:00')

describe('paceBandsFor (#878 A5)', () => {
  it('기준 Easy 페이스에 비례한다 — 빠른 러너와 느린 러너의 경계가 다르다', () => {
    expect(paceBandsFor(432)).toMatchObject({ easyFloorSec: 389, recoveryFloorSec: 484, strideCeilingSec: 346 })
    expect(paceBandsFor(290)).toMatchObject({ easyFloorSec: 261, recoveryFloorSec: 325 })
  })

  it('기준이 없으면 null', () => {
    expect(paceBandsFor(null)).toBeNull()
    expect(paceBandsFor(0)).toBeNull()
  })
})

describe('easyPaceReference / habitualPaceSec (#878 A5)', () => {
  const run = (date: string, distanceKm: number, avgPaceSec: number | null, durationSec: number | null = null) => ({ date, distanceKm, avgPaceSec, durationSec })

  it('처방 모델의 Easy 가 있으면 그걸 쓴다', () => {
    expect(easyPaceReference(450, [run('2026-10-20', 5, 300)], today)).toBe(450)
  })

  it('없으면 최근 90일 평소 페이스(중앙값)', () => {
    const runs = [run('2026-10-20', 5, 500), run('2026-10-18', 4, 520), run('2026-10-15', 3, 480)]
    expect(easyPaceReference(null, runs, today)).toBe(500)
  })

  it('90일 밖·1km 미만·비현실 페이스는 빼고, 페이스가 없으면 시간/거리로 계산한다', () => {
    const runs = [run('2026-06-01', 5, 300), run('2026-10-20', 0.5, 300), run('2026-10-20', 5, 60), run('2026-10-21', 5, null, 2500)]
    expect(habitualPaceSec(runs, today)).toBe(500)
  })

  it('런이 하나도 없으면 null', () => {
    expect(easyPaceReference(null, [], today)).toBeNull()
  })
})

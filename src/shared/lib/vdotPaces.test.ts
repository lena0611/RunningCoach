import { describe, it, expect } from 'vitest'
import type { AthleteProfile } from '@/entities/training-memory/model'
import {
  vdotFromPerformance,
  vdotFromPersonalBests,
  vdotFromVo2Max,
  pacesFromVdot,
  racePredictionSec,
  resolvePaceModel,
  formatPaceSec,
  formatClock
} from './vdotPaces'

function baseProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    birthYear: null,
    sex: 'unknown',
    runningExperienceMonths: null,
    weeklyRunDaysTarget: 4,
    preferredLongRunDay: '토요일',
    personalBests: [],
    runnerLevel: 'auto',
    maxHeartRate: null,
    restingHeartRate: null,
    lactateThresholdHr: null,
    heartRateMode: 'auto',
    vo2Max: null,
    vo2MaxSampleDate: null,
    vo2MaxSource: null,
    ...overrides
  }
}

describe('vdotFromPerformance (Daniels 기준값)', () => {
  // Daniels VDOT 표 기준: 5k 21:25 ≈ VDOT 44, 10k 50:00 ≈ VDOT 38.
  // Daniels-Gilbert 원공식은 표와 ±2 VDOT 정도 차이가 날 수 있어 밴드로 검증한다.
  it('5km 21:25 ≈ VDOT 44 (±2)', () => {
    const vdot = vdotFromPerformance(5, 21 * 60 + 25)
    expect(vdot).not.toBeNull()
    expect(vdot!).toBeGreaterThanOrEqual(44)
    expect(vdot!).toBeLessThanOrEqual(48)
  })

  it('10km 50:00 ≈ VDOT 38~40', () => {
    const vdot = vdotFromPerformance(10, 50 * 60)
    expect(vdot!).toBeGreaterThanOrEqual(38)
    expect(vdot!).toBeLessThanOrEqual(42)
  })

  it('잘못된 입력은 null', () => {
    expect(vdotFromPerformance(0, 1000)).toBeNull()
    expect(vdotFromPerformance(5, 0)).toBeNull()
    expect(vdotFromPerformance(NaN, 100)).toBeNull()
  })
})

describe('vdotFromVo2Max', () => {
  it('현실 범위는 1:1 근사', () => {
    expect(vdotFromVo2Max(48.5)).toBe(48.5)
    expect(vdotFromVo2Max(35)).toBe(35)
  })
  it('범위 밖/비정상은 null', () => {
    expect(vdotFromVo2Max(10)).toBeNull()
    expect(vdotFromVo2Max(120)).toBeNull()
    expect(vdotFromVo2Max(null)).toBeNull()
    expect(vdotFromVo2Max(undefined)).toBeNull()
  })
})

describe('pacesFromVdot', () => {
  it('강도 순서: 인터벌(빠름) < 템포 < 마라톤 < 이지(느림)', () => {
    const p = pacesFromVdot(50)
    expect(p.intervalPaceSec).toBeLessThan(p.thresholdPaceSec)
    expect(p.thresholdPaceSec).toBeLessThan(p.marathonPaceSec)
    expect(p.marathonPaceSec).toBeLessThan(p.easyPaceSec)
  })

  it('VDOT 50 템포 페이스 ≈ 4:15/km (250~262초)', () => {
    const p = pacesFromVdot(50)
    expect(p.thresholdPaceSec).toBeGreaterThanOrEqual(250)
    expect(p.thresholdPaceSec).toBeLessThanOrEqual(262)
  })

  it('이지 범위는 [느림, 빠름] 순서이며 대표 이지값을 감싼다', () => {
    const p = pacesFromVdot(50)
    const [slow, fast] = p.easyPaceRangeSec
    expect(slow).toBeGreaterThan(fast)
    expect(p.easyPaceSec).toBeLessThanOrEqual(slow)
    expect(p.easyPaceSec).toBeGreaterThanOrEqual(fast)
  })
})

describe('racePredictionSec (round-trip)', () => {
  it('VDOT 50 → 5km은 18~21분 사이이고 환산이 일관된다', () => {
    const sec = racePredictionSec(50, 5)
    expect(sec).not.toBeNull()
    expect(sec!).toBeGreaterThanOrEqual(18 * 60)
    expect(sec!).toBeLessThanOrEqual(21 * 60)
    // 예측 시간을 다시 VDOT로 환산하면 입력값과 거의 같다(내부 일관성).
    expect(Math.abs(vdotFromPerformance(5, sec!)! - 50)).toBeLessThanOrEqual(0.5)
  })

  it('예측 시간을 다시 VDOT로 환산하면 입력 VDOT와 거의 같다', () => {
    const sec = racePredictionSec(45, 10)!
    const back = vdotFromPerformance(10, sec)!
    expect(Math.abs(back - 45)).toBeLessThanOrEqual(0.5)
  })
})

describe('resolvePaceModel 우선순위', () => {
  it('PB가 있으면 pb_measured', () => {
    const m = resolvePaceModel(
      baseProfile({
        personalBests: [{ distanceKm: 5, durationSec: 1285, date: '2026-05-01', source: 'race' }],
        vo2Max: 48
      })
    )
    expect(m.source).toBe('pb_measured')
    expect(m.confidence).toBe('measured')
    expect(m.thresholdPaceSec).not.toBeNull()
    expect(m.basis).toContain('PB')
  })

  it('PB 없고 VO2max만 있으면 vo2max_estimate', () => {
    const m = resolvePaceModel(baseProfile({ vo2Max: 48.5 }))
    expect(m.source).toBe('vo2max_estimate')
    expect(m.confidence).toBe('estimate')
    expect(m.vdot).toBe(48.5)
    expect(m.basis).toContain('VO2max')
  })

  it('둘 다 없으면 insufficient (페이스 null)', () => {
    const m = resolvePaceModel(baseProfile())
    expect(m.source).toBe('insufficient')
    expect(m.confidence).toBe('none')
    expect(m.thresholdPaceSec).toBeNull()
    expect(m.easyPaceRangeSec).toBeNull()
  })

  it('3km 미만 PB는 VDOT 근거로 쓰지 않는다', () => {
    const r = vdotFromPersonalBests([{ distanceKm: 1, durationSec: 200, date: '2026-05-01', source: 'race' }])
    expect(r).toBeNull()
  })
})

describe('포맷 헬퍼', () => {
  it('formatPaceSec', () => {
    expect(formatPaceSec(255)).toBe('4분15초/km')
    expect(formatPaceSec(null)).toBe('-')
    expect(formatPaceSec(0)).toBe('-')
  })
  it('formatClock', () => {
    expect(formatClock(1285)).toBe('21:25')
    expect(formatClock(3661)).toBe('1:01:01')
  })
})

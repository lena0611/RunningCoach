import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { assessWeatherStress, HEAT_CONFOUND_FELT_C } from '@/shared/lib/coaching/weatherStress'
import { evaluateEasyRecovery, evaluateLsd } from '@/shared/lib/coaching/sessionQuality'

function run(over: Partial<RunLog> = {}): RunLog {
  return {
    id: 'r1', date: '2026-08-22', type: 'Easy', title: '', distanceKm: 6, durationSec: 2400,
    avgPaceSec: 400, avgHeartRate: 150, maxHeartRate: 165, cadence: null, activeEnergyKcal: null,
    temperature: null, humidity: null, windMps: null, elevationGainM: null, elevationLossM: null,
    courseType: 'Unknown', rpe: null, sleepQuality: null, conditionScore: null, stressLevel: null,
    companion: null, notes: '', laps: [], metricSamples: [], routePoints: [], fastSegments: [],
    ...over
  } as RunLog
}

/** 전/후반 심박 드리프트를 만드는 랩 세트. */
function lapsWithDrift(firstHr: number, secondHr: number, firstPace: number, secondPace: number) {
  return [
    { index: 1, distanceKm: 1, paceSec: firstPace, avgHeartRate: firstHr },
    { index: 2, distanceKm: 1, paceSec: firstPace, avgHeartRate: firstHr },
    { index: 3, distanceKm: 1, paceSec: secondPace, avgHeartRate: secondHr },
    { index: 4, distanceKm: 1, paceSec: secondPace, avgHeartRate: secondHr }
  ] as RunLog['laps']
}

describe('assessWeatherStress (#713)', () => {
  it('고온다습이면 열교란으로 본다 — 습도를 기온과 결합해서만 본다', () => {
    // 2026-08-22 실사용 조건대(우중런, 고온다습).
    const s = assessWeatherStress({ temperature: 29, humidity: 85, windMps: 1 })
    expect(s.heatConfounded).toBe(true)
    expect(s.feltC).not.toBeNull()
    expect(s.note).toMatch(/심박이 쉽게 오르고/)
  })

  it('서늘하면 교란이 아니다', () => {
    expect(assessWeatherStress({ temperature: 12, humidity: 50, windMps: 2 }).heatConfounded).toBe(false)
  })

  it('기온이 없으면 판정하지 않는다 — 임의 보정 대신 무판정', () => {
    const s = assessWeatherStress({ temperature: null, humidity: 90, windMps: 1 })
    expect(s.heatConfounded).toBe(false)
    expect(s.feltC).toBeNull()
  })

  it('임계는 날씨 카드 "더위 주의"와 같은 값이다 (브리핑↔채점 정합)', () => {
    // 사전 안내가 더위라고 말한 조건은 사후 채점도 더위로 봐야 한다(SSOT).
    expect(HEAT_CONFOUND_FELT_C).toBe(28)
  })
})

describe('LSD 드리프트 — 더운 날 단독 실패 근거로 쓰지 않는다 (#713)', () => {
  const hotLaps = lapsWithDrift(140, 156, 400, 405) // 드리프트 +16, 페이스는 소폭만 저하

  it('고온 + 드리프트 초과 + RPE 낮음 → 실패로 보지 않고 맥락을 붙인다', () => {
    const e = evaluateLsd(run({ type: 'LSD', temperature: 30, humidity: 80, windMps: 1, rpe: 3, laps: hotLaps }))
    expect(e.hrDriftBpm).toBe(16) // 숫자는 정직하게 남긴다
    expect(e.weatherConfounded).toBe(true)
    expect(e.stable).toBe(true)
    expect(e.reasons.join(' ')).toMatch(/체력 저하로 보지 않는다/)
  })

  it('⚠ 날씨는 면죄부가 아니다 — RPE 가 높으면 실패 유지', () => {
    const e = evaluateLsd(run({ type: 'LSD', temperature: 30, humidity: 80, windMps: 1, rpe: 6, laps: hotLaps }))
    expect(e.weatherConfounded).toBe(false)
    expect(e.stable).toBe(false)
  })

  it('⚠ 후반 페이스가 무너졌으면 더워도 실패 유지 — 열이든 아니든 지속이 안 된 것', () => {
    const collapsed = lapsWithDrift(140, 156, 400, 430) // 후반 +30s/km
    const e = evaluateLsd(run({ type: 'LSD', temperature: 30, humidity: 80, windMps: 1, rpe: 3, laps: collapsed }))
    expect(e.weatherConfounded).toBe(false)
    expect(e.stable).toBe(false)
  })

  it('서늘한 날 같은 드리프트는 그대로 잡힌다 (반대 방향 회귀)', () => {
    const e = evaluateLsd(run({ type: 'LSD', temperature: 12, humidity: 50, windMps: 2, rpe: 3, laps: hotLaps }))
    expect(e.weatherConfounded).toBe(false)
    expect(e.stable).toBe(false)
    expect(e.reasons.join(' ')).toMatch(/초반을 더 눌러도/)
  })
})

describe('Easy 심박 상한 — 더운 날 초과만으로 실패시키지 않는다 (#713)', () => {
  it('고온 + 상한 크게 초과(기존 RPE override 밖) + RPE 낮음 → 유지로 본다', () => {
    // 초과 22bpm 은 RPE_OVERRIDE_CAP_BPM(15) 밖이라 기존 override 로는 구제되지 않는다.
    // 즉 이 케이스가 날씨 분기를 실제로 타는 경로다.
    const e = evaluateEasyRecovery(
      run({ temperature: 31, humidity: 80, windMps: 1, avgHeartRate: 160, rpe: 4 }),
      { ceilingBpm: 138, isRecovery: false }
    )
    expect(e.intentHeld).toBe(true)
    expect(e.weatherConfounded).toBe(true)
    expect(e.reasons.join(' ')).toMatch(/강도 실패로 보지 않는다/)
  })

  it('RPE 미입력이어도 교란으로 넘기되 판정 보류임을 밝힌다', () => {
    const e = evaluateEasyRecovery(
      run({ temperature: 31, humidity: 80, windMps: 1, avgHeartRate: 160, rpe: null }),
      { ceilingBpm: 138, isRecovery: false }
    )
    expect(e.weatherConfounded).toBe(true)
    expect(e.reasons.join(' ')).toMatch(/판정은 보류/)
  })

  it('⚠ 날씨는 면죄부가 아니다 — RPE 가 높으면 실패 유지', () => {
    const e = evaluateEasyRecovery(
      run({ temperature: 31, humidity: 80, windMps: 1, avgHeartRate: 160, rpe: 7 }),
      { ceilingBpm: 138, isRecovery: false }
    )
    expect(e.intentHeld).toBe(false)
    expect(e.weatherConfounded).toBe(false)
  })

  it('서늘한 날 같은 초과는 그대로 잡힌다 (반대 방향 회귀)', () => {
    const e = evaluateEasyRecovery(
      run({ temperature: 12, humidity: 50, windMps: 2, avgHeartRate: 160, rpe: null }),
      { ceilingBpm: 138, isRecovery: false }
    )
    expect(e.intentHeld).toBe(false)
    expect(e.weatherConfounded).toBe(false)
  })
})

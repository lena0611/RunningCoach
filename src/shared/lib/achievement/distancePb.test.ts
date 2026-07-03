import { describe, expect, it } from 'vitest'
import type { RunLog, RunMetricSample } from '@/entities/run/model'
import { computeDistancePbs } from './distancePb'

function makeRun(overrides: Partial<RunLog> & { id: string; distanceKm: number }): RunLog {
  return {
    userId: 'u', externalId: null, sessionTitle: '', date: '2026-01-01', startAt: null, endAt: null,
    type: 'Easy', durationSec: null, avgPaceSec: null, avgHeartRate: null, maxHeartRate: null,
    cadence: null, activeEnergyKcal: null, temperature: null, humidity: null, windMps: null,
    elevationGainM: null, elevationLossM: null, courseType: 'Unknown', rpe: null, workoutFeeling: '',
    painNote: '', sleepQuality: null, conditionScore: null, stressLevel: null, companion: '', memo: '',
    laps: [], fastSegments: [], metricSamples: [], routePoints: [], tags: [], source: 'healthkit',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

/** offsetSec/paceSec 쌍 배열로 metricSamples 를 만든다 (heartRate/cadence 는 PB 산출과 무관). */
function samples(pairs: Array<[offsetSec: number, paceSec: number | null]>): RunMetricSample[] {
  return pairs.map(([offsetSec, paceSec]) => ({ offsetSec, heartRate: null, paceSec, cadence: null }))
}

function pb(pbs: ReturnType<typeof computeDistancePbs>, context: 'training' | 'race', distanceM: number) {
  return pbs.find((p) => p.context === context && p.distanceM === distanceM)
}

describe('computeDistancePbs', () => {
  it('returns nothing for empty input', () => {
    expect(computeDistancePbs([])).toEqual([])
  })

  it('uses uniform (constant-speed) fallback when there are no metricSamples', () => {
    const run = makeRun({ id: 'r-uniform', distanceKm: 10, durationSec: 3000 })
    const pbs = computeDistancePbs([run])
    expect(pb(pbs, 'training', 5000)).toMatchObject({ elapsedSec: 1500, runId: 'r-uniform', distanceM: 5000 })
    expect(pb(pbs, 'training', 10000)).toMatchObject({ elapsedSec: 3000, distanceM: 10000 })
    expect(pbs.filter((p) => p.context === 'training')).toHaveLength(2)
  })

  it('integrates even-paced metricSamples and anchors the curve to total distance', () => {
    // 5:00/km(=300s/km, 3.333m/s) 등속, 10km, 3000s. 샘플 적분 결과가 총거리와 정확히 일치.
    const even = samples([0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000].map((t) => [t, 300]))
    const run = makeRun({ id: 'r-even', distanceKm: 10, durationSec: 3000, metricSamples: even })
    const pbs = computeDistancePbs([run])
    expect(pb(pbs, 'training', 5000)!.elapsedSec).toBeCloseTo(1500, 1)
    expect(pb(pbs, 'training', 10000)!.elapsedSec).toBeCloseTo(3000, 1)
  })

  it('reflects a negative split (slow first half) via integration', () => {
    // 0~2000s: 400s/km(2.5m/s) → 5000m, 2000~3000s: 200s/km(5m/s) → 5000m. 적분 5km 도달은 절반시각보다 늦음.
    const split = samples([
      [0, 400], [500, 400], [1000, 400], [1500, 400], [2000, 400],
      [2500, 200], [3000, 200]
    ])
    const run = makeRun({ id: 'r-split', distanceKm: 10, durationSec: 3000, metricSamples: split })
    const pbs = computeDistancePbs([run])
    const fiveK = pb(pbs, 'training', 5000)!
    expect(fiveK.elapsedSec).toBeGreaterThan(1500)
    expect(fiveK.elapsedSec).toBeCloseTo(1875, 0)
    expect(pb(pbs, 'training', 10000)!.elapsedSec).toBeCloseTo(3000, 1)
  })

  it('ignores runs shorter than one bucket (거리미달)', () => {
    const short = makeRun({ id: 'r-3k', distanceKm: 3, durationSec: 900 })
    expect(computeDistancePbs([short])).toEqual([])

    const sixK = makeRun({ id: 'r-6k', distanceKm: 6, durationSec: 1800 })
    const pbs = computeDistancePbs([sixK])
    expect(pbs.map((p) => p.distanceM)).toEqual([5000]) // 6km → 5000 버킷만, 10000 없음
  })

  it('still integrates a sparse 2-sample run', () => {
    // 유효 샘플 2개(시작/끝)만 있어도 fallback 이 아니라 적분 경로를 탄다.
    const sparse = samples([[0, 300], [1800, 300]]) // 6km @ 3.333m/s
    const run = makeRun({ id: 'r-sparse', distanceKm: 6, durationSec: 1800, metricSamples: sparse })
    const fiveK = pb(computeDistancePbs([run]), 'training', 5000)!
    expect(fiveK.elapsedSec).toBeCloseTo(1500, 1)
  })

  it('picks the fastest run for each bucket', () => {
    const slow = makeRun({ id: 'r-slow', distanceKm: 5, durationSec: 1600 })
    const fast = makeRun({ id: 'r-fast', distanceKm: 5, durationSec: 1400 })
    const fiveK = pb(computeDistancePbs([slow, fast]), 'training', 5000)!
    expect(fiveK).toMatchObject({ runId: 'r-fast', elapsedSec: 1400 })
  })

  it('breaks ties by earlier achievedAt, then by runId', () => {
    const later = makeRun({ id: 'r-later', distanceKm: 5, durationSec: 1500, date: '2026-02-01' })
    const earlier = makeRun({ id: 'r-earlier', distanceKm: 5, durationSec: 1500, date: '2026-01-01' })
    expect(pb(computeDistancePbs([later, earlier]), 'training', 5000)!.runId).toBe('r-earlier')

    // 동일 시각이면 runId 사전순으로 결정적 선택
    const z = makeRun({ id: 'z-run', distanceKm: 5, durationSec: 1500, date: '2026-03-01' })
    const a = makeRun({ id: 'a-run', distanceKm: 5, durationSec: 1500, date: '2026-03-01' })
    expect(pb(computeDistancePbs([z, a]), 'training', 5000)!.runId).toBe('a-run')
  })

  it('prefers startAt over date for achievedAt', () => {
    const run = makeRun({ id: 'r-at', distanceKm: 5, durationSec: 1500, date: '2026-01-01', startAt: '2026-01-01T06:30:00.000Z' })
    expect(pb(computeDistancePbs([run]), 'training', 5000)!.achievedAt).toBe('2026-01-01T06:30:00.000Z')
  })

  it('separates training and race ladders so neither pollutes the other', () => {
    const trainingFast = makeRun({ id: 't-fast', distanceKm: 5, durationSec: 1400 })
    const raceSlow = makeRun({ id: 'race-slow', distanceKm: 5, durationSec: 1600, tags: ['self-race'] })
    const raceFast = makeRun({ id: 'race-fast', distanceKm: 5, durationSec: 1300, tags: ['self-race', 'pr'] })

    const pbs = computeDistancePbs([trainingFast, raceSlow, raceFast])

    // 훈련 PB 는 더 빠른 레이싱 기록에 오염되지 않는다.
    expect(pb(pbs, 'training', 5000)).toMatchObject({ runId: 't-fast', elapsedSec: 1400 })
    // 레이싱 PB 는 레이싱 사다리 안에서만 경쟁한다(raceFast < raceSlow).
    expect(pb(pbs, 'race', 5000)).toMatchObject({ runId: 'race-fast', elapsedSec: 1300 })
    // 훈련 사다리에 레이싱 런이 끼어들지 않는다.
    expect(pbs.filter((p) => p.context === 'training').every((p) => p.runId === 't-fast')).toBe(true)
  })

  it('starts the race ladder empty when no run is tagged self-race', () => {
    const onlyTraining = makeRun({ id: 'only-t', distanceKm: 10, durationSec: 3000 })
    const pbs = computeDistancePbs([onlyTraining])
    expect(pbs.some((p) => p.context === 'race')).toBe(false)
  })

  it('filters null paceSec and falls back to uniform when fewer than 2 valid samples remain', () => {
    const allNull = makeRun({ id: 'r-null', distanceKm: 5, durationSec: 1500, metricSamples: samples([[0, null], [600, null], [1200, null]]) })
    // pace 가 모두 null → 적분 불가 → durationSec 균등 fallback
    expect(pb(computeDistancePbs([allNull]), 'training', 5000)!.elapsedSec).toBe(1500)

    const oneValid = makeRun({ id: 'r-one', distanceKm: 5, durationSec: 1500, metricSamples: samples([[0, 300], [600, null]]) })
    expect(pb(computeDistancePbs([oneValid]), 'training', 5000)!.elapsedSec).toBe(1500)
  })

  it('returns nothing usable when neither samples nor durationSec are available', () => {
    const noTime = makeRun({ id: 'r-notime', distanceKm: 10, durationSec: null })
    expect(computeDistancePbs([noTime])).toEqual([])
  })

  it('supports a custom bucket step', () => {
    const run = makeRun({ id: 'r-1k', distanceKm: 3, durationSec: 900 })
    const pbs = computeDistancePbs([run], 1000)
    expect(pbs.map((p) => p.distanceM)).toEqual([1000, 2000, 3000])
    expect(pb(pbs, 'training', 1000)!.elapsedSec).toBeCloseTo(300, 5)
  })

  it('extraDistancesM 로 버킷 배수가 아닌 캐노니컬 거리(하프)를 함께 산출한다', () => {
    const run = makeRun({ id: 'r-22k', distanceKm: 22, durationSec: 7920 })
    const pbs = computeDistancePbs([run], 5000, [21097.5, 42195])
    expect(pbs.map((p) => p.distanceM)).toEqual([5000, 10000, 15000, 20000, 21097.5])
    // 등속: 7920 × (21097.5 / 22000)
    expect(pb(pbs, 'training', 21097.5)!.elapsedSec).toBeCloseTo((7920 * 21097.5) / 22000, 5)
  })

  it('extraDistancesM 중 stepM 배수·총거리 초과분은 무시한다', () => {
    const run = makeRun({ id: 'r-12k', distanceKm: 12, durationSec: 3600 })
    const pbs = computeDistancePbs([run], 5000, [5000, 10000, 21097.5])
    expect(pbs.map((p) => p.distanceM)).toEqual([5000, 10000])
  })
})

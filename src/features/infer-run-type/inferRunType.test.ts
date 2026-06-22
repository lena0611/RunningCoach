import { describe, expect, it } from 'vitest'
import { inferRunType } from './inferRunType'
import { deriveHeartRateModel } from '@/shared/lib/heartRateZones'
import type { Lap, RunMetricSample } from '@/entities/run/model'

// anchor=165 모델(easy 145 / recovery 130 / Z4 156~165) — 기존 판정 기준과 동일한 개인 심박 모델로 테스트한다.
const hrModel = deriveHeartRateModel({ heartRateMode: 'manual', lactateThresholdHr: 165 }, 2026)

describe('inferRunType', () => {
  it('infers Easy + Strides from easy heart rate and repeated pace/cadence spikes', () => {
    const metricSamples = buildStrideSamples()

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.37,
      avgPaceSec: 460,
      avgHeartRate: 135,
      laps: [],
      fastSegments: [],
      metricSamples,
      weeklyPattern: ['화요일: Easy + Strides'],
      heartRateModel: hrModel
    })).toBe('Easy + Strides')
  })

  it('keeps a steady easy run as Easy when there are no repeated spikes', () => {
    const metricSamples = Array.from({ length: 45 }, (_, index) => ({
      offsetSec: index * 60,
      paceSec: 455 + (index % 4) * 5,
      heartRate: 128 + Math.min(index, 12),
      cadence: 164 + (index % 3)
    }))

    expect(inferRunType({
      date: '2026-05-26',
      distanceKm: 5.2,
      avgPaceSec: 462,
      avgHeartRate: 134,
      laps: [],
      fastSegments: [],
      metricSamples,
      weeklyPattern: ['화요일: Easy + Strides'],
      heartRateModel: hrModel
    })).toBe('Easy')
  })

  it('does not infer Easy + Strides from cadence spikes alone when pace stays easy', () => {
    const metricSamples = Array.from({ length: 50 }, (_, index) => {
      const spike = [12, 16, 20, 24, 28, 32].includes(index)
      return {
        offsetSec: index * 45,
        paceSec: spike ? 435 : 460 + (index % 5) * 6,
        heartRate: Math.min(142, 112 + Math.floor(index / 2)),
        cadence: spike ? 184 + (index % 4) : 164 + (index % 4)
      }
    })

    expect(inferRunType({
      date: '2026-05-25',
      distanceKm: 6.05,
      avgPaceSec: 468,
      avgHeartRate: 139,
      laps: [],
      fastSegments: [],
      metricSamples,
      weeklyPattern: ['화요일: Easy + Strides'],
      heartRateModel: hrModel
    })).toBe('Easy')
  })

  it('does not infer Easy + Strides from cadence spikes when pace samples are missing', () => {
    const metricSamples = Array.from({ length: 50 }, (_, index) => {
      const spike = [12, 16, 20, 24, 28, 32].includes(index)
      return {
        offsetSec: index * 45,
        paceSec: null,
        heartRate: Math.min(142, 112 + Math.floor(index / 2)),
        cadence: spike ? 188 + (index % 4) : 165 + (index % 3)
      }
    })

    expect(inferRunType({
      date: '2026-05-25',
      distanceKm: 6.05,
      avgPaceSec: 468,
      avgHeartRate: 139,
      laps: [],
      fastSegments: [],
      metricSamples,
      weeklyPattern: ['화요일: Easy + Strides'],
      heartRateModel: hrModel
    })).toBe('Easy')
  })

  it('keeps an easy-heart-rate Saturday long run as LSD even with a natural negative split', () => {
    expect(inferRunType({
      date: '2026-05-02',
      distanceKm: 13.06,
      avgPaceSec: 452,
      avgHeartRate: 139,
      laps: buildLongRunLaps([
        [500, 132],
        [480, 136],
        [465, 138],
        [455, 140],
        [445, 142],
        [438, 143],
        [432, 143],
        [428, 144],
        [425, 144],
        [422, 145],
        [420, 144],
        [418, 145],
        [416, 145]
      ]),
      fastSegments: [],
      metricSamples: [],
      weeklyPattern: ['토요일: LSD 또는 Steady Long'],
      heartRateModel: hrModel
    })).toBe('LSD')
  })

  it('infers Steady Long when a long run spends meaningful distance in Z3 with a faster second half', () => {
    expect(inferRunType({
      date: '2026-05-09',
      distanceKm: 12.5,
      avgPaceSec: 418,
      avgHeartRate: 149,
      laps: buildLongRunLaps([
        [445, 140],
        [435, 143],
        [425, 146],
        [418, 148],
        [410, 150],
        [405, 151],
        [398, 152],
        [392, 153],
        [388, 154],
        [385, 154],
        [382, 155],
        [380, 155]
      ]),
      fastSegments: [],
      metricSamples: [],
      weeklyPattern: ['토요일: LSD 또는 Steady Long'],
      heartRateModel: hrModel
    })).toBe('Steady Long')
  })

  it('infers LSD for a long easy run moved off Saturday when time-on-feet is long (>=80min), even under 12km', () => {
    // 11.4km / 1:31:33(≈8:02/km=482s) — 토요일 LSD를 일요일로 옮겨 뛴 케이스. 거리는 12km 미만이지만
    // 발 위 시간이 ~91분이라 명백한 롱런. 요일·12km에 걸려 Easy로 떨어지면 안 된다(running-coaching-standards.md:91).
    expect(inferRunType({
      date: '2026-05-03', // 일요일(2026-05-02 토요일의 다음 날)
      distanceKm: 11.4,
      avgPaceSec: 482,
      avgHeartRate: 138,
      laps: buildLongRunLaps([
        [485, 136],
        [483, 137],
        [482, 137],
        [481, 138],
        [480, 138],
        [482, 138],
        [481, 139],
        [480, 139],
        [482, 138],
        [481, 139],
        [480, 139]
      ]),
      fastSegments: [],
      metricSamples: [],
      weeklyPattern: ['일요일: LSD'],
      heartRateModel: hrModel
    })).toBe('LSD')
  })

  it('keeps a mid-length easy run as Easy off Saturday when time-on-feet is under the long-run threshold', () => {
    // 10.5km / 73.5분(420s/km) — 12km 미만 + 80분 미만 + 비토요일이면 롱런 신호가 없으므로 Easy 유지(과분류 가드).
    expect(inferRunType({
      date: '2026-05-04', // 월요일
      distanceKm: 10.5,
      avgPaceSec: 420,
      avgHeartRate: 138,
      laps: [],
      fastSegments: [],
      metricSamples: [],
      weeklyPattern: ['월요일: Easy'],
      heartRateModel: hrModel
    })).toBe('Easy')
  })
})

function buildStrideSamples(): RunMetricSample[] {
  const samples: RunMetricSample[] = []
  for (let offsetSec = 0; offsetSec <= 2460; offsetSec += 30) {
    const strideIndex = [660, 780, 900, 1020, 1140, 1260, 1380, 1500].findIndex((start) => Math.abs(offsetSec - start) <= 15)
    const fast = strideIndex >= 0
    samples.push({
      offsetSec,
      paceSec: fast ? 325 + (strideIndex % 3) * 8 : 465 + (offsetSec % 90),
      heartRate: fast ? 138 + strideIndex : Math.min(142, 110 + Math.floor(offsetSec / 80)),
      cadence: fast ? 188 + strideIndex : 166 + (offsetSec % 4)
    })
  }
  return samples
}

function buildLongRunLaps(values: Array<[paceSec: number, avgHeartRate: number]>): Lap[] {
  return values.map(([paceSec, avgHeartRate], index) => ({
    index: index + 1,
    distanceKm: 1,
    paceSec,
    avgHeartRate,
    cadence: 166
  }))
}

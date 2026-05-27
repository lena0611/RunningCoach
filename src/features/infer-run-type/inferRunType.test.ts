import { describe, expect, it } from 'vitest'
import { inferRunType } from './inferRunType'
import type { Lap, RunMetricSample } from '@/entities/run/model'

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
      weeklyPattern: ['화요일: Easy + Strides']
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
      weeklyPattern: ['화요일: Easy + Strides']
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
      weeklyPattern: ['화요일: Easy + Strides']
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
      weeklyPattern: ['화요일: Easy + Strides']
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
      weeklyPattern: ['토요일: LSD 또는 Steady Long']
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
      weeklyPattern: ['토요일: LSD 또는 Steady Long']
    })).toBe('Steady Long')
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

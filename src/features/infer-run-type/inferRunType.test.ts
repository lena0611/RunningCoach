import { describe, expect, it } from 'vitest'
import { inferRunType } from './inferRunType'
import type { RunMetricSample } from '@/entities/run/model'

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

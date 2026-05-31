import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { getRunFilterTags, getRunMetaChips, hasRunFilterTag } from './runMetaChips'

describe('getRunMetaChips', () => {
  it('adds schedule, period, and weather value chips when matched', () => {
    const run = createRun({
      date: '2026-05-26',
      sessionTitle: '화요일 밤 러닝',
      type: 'Easy + Strides',
      temperature: 23
    })

    expect(getRunMetaChips(run, ['화요일: Easy + Strides'])).toEqual([
      { label: '스케줄', tone: 'schedule' },
      { label: '밤', tone: 'period' },
      { label: '기온 23°', tone: 'weather' }
    ])
  })

  it('uses humidity or wind when temperature is not available', () => {
    expect(getRunMetaChips(createRun({ humidity: 71 })).at(-1)).toEqual({ label: '습도 71%', tone: 'weather' })
    expect(getRunMetaChips(createRun({ windMps: 2.4 })).at(-1)).toEqual({ label: '바람 2.4m/s', tone: 'weather' })
  })

  it('marks non-routine runs as extra', () => {
    const run = createRun({
      date: '2026-05-25',
      sessionTitle: '월요일 아침 러닝',
      type: 'Easy'
    })

    expect(getRunMetaChips(run, ['화요일: Easy + Strides'])).toEqual([
      { label: '추가', tone: 'extra' },
      { label: '아침', tone: 'period' }
    ])
  })
})

describe('getRunFilterTags', () => {
  it('builds filterable tags for statistics and personal awards', () => {
    const run = createRun({
      date: '2026-05-26',
      sessionTitle: '화요일 밤 러닝',
      type: 'Easy + Strides',
      source: 'file_import',
      temperature: 23,
      courseType: 'Flat',
      laps: [{ index: 1, distanceKm: 1, paceSec: 420, avgHeartRate: 130, cadence: 165 }],
      metricSamples: [{ offsetSec: 0, heartRate: 120, paceSec: 420, cadence: 165 }],
      routePoints: [{ offsetSec: 0, latitude: 37.1, longitude: 127.1, altitude: 20 }],
      tags: ['와이프 동반주']
    })

    expect(getRunFilterTags(run, ['화요일: Easy + Strides']).map((tag) => tag.value)).toEqual([
      'schedule:scheduled',
      'period:밤',
      'weather:present',
      'source:file_import',
      'data:laps',
      'data:metrics',
      'data:route',
      'course:Flat',
      'tag:와이프 동반주'
    ])
  })

  it('checks whether a run belongs to a computed filter tag', () => {
    const run = createRun({
      date: '2026-05-25',
      sessionTitle: '월요일 아침 러닝',
      type: 'Easy',
      source: 'healthkit'
    })

    expect(hasRunFilterTag(run, 'schedule:extra', ['화요일: Easy + Strides'])).toBe(true)
    expect(hasRunFilterTag(run, 'source:healthkit')).toBe(true)
    expect(hasRunFilterTag(run, 'weather:present')).toBe(false)
  })
})

function createRun(input: Partial<RunLog>): RunLog {
  return {
    id: 'run-1',
    userId: 'user-1',
    externalId: null,
    sessionTitle: '',
    date: '2026-05-26',
    startAt: null,
    endAt: null,
    type: 'Easy',
    distanceKm: 5,
    durationSec: 1800,
    avgPaceSec: 360,
    avgHeartRate: null,
    maxHeartRate: null,
    cadence: null,
    activeEnergyKcal: null,
    temperature: null,
    humidity: null,
    windMps: null,
    elevationGainM: null,
    elevationLossM: null,
    courseType: 'Unknown',
    rpe: null,
    workoutFeeling: '',
    painNote: '',
    sleepQuality: null,
    conditionScore: null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: [],
    source: 'healthkit',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...input
  }
}

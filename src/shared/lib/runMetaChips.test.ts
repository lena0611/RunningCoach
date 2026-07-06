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

  it('replaces the schedule/extra chip with a race chip for self-race runs', () => {
    const run = createRun({
      date: '2026-05-26',
      sessionTitle: '화요일 오후 러닝',
      type: 'Easy + Strides',
      tags: ['healthkit', 'type:auto', 'self-race']
    })

    // 스케줄 매칭이 되는 날이어도 레이스는 훈련 플랜 문맥이 아니다 — 레이스 칩이 대체한다.
    expect(getRunMetaChips(run, ['화요일: Easy + Strides'])).toEqual([
      { label: '🏁 레이스', tone: 'race' },
      { label: '오후', tone: 'period' }
    ])

    // 필터 파셋은 칩과 달리 '대체'가 아니라 추가형이다(의도): 스케줄 파셋은 유지되고
    // 레이스는 tag:self-race 로 별도 필터 가능. 이 비대칭이 회귀로 뒤집히지 않게 고정한다.
    const filterValues = getRunFilterTags(run, ['화요일: Easy + Strides']).map((tag) => tag.value)
    expect(filterValues).toContain('schedule:scheduled')
    expect(filterValues).toContain('tag:self-race')
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

import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import { initialTrainingMemory } from '@/entities/training-memory/model'
import { buildTrendAnalysis, buildTrendLensResult, buildTrendOverallSummary } from '@/shared/lib/trendInsights'

function run(input: Partial<RunLog>): RunLog {
  return {
    id: input.id ?? crypto.randomUUID(),
    userId: 'user-1',
    externalId: null,
    sessionTitle: input.sessionTitle ?? input.type ?? '러닝',
    date: input.date ?? '2026-01-01',
    startAt: null,
    endAt: null,
    type: input.type ?? 'Easy',
    distanceKm: input.distanceKm ?? 5,
    durationSec: input.durationSec ?? 1800,
    avgPaceSec: input.avgPaceSec ?? 360,
    avgHeartRate: input.avgHeartRate ?? 140,
    maxHeartRate: input.maxHeartRate ?? 148,
    cadence: input.cadence ?? 170,
    activeEnergyKcal: null,
    temperature: input.temperature ?? null,
    humidity: null,
    windMps: null,
    elevationGainM: input.elevationGainM ?? null,
    elevationLossM: null,
    courseType: input.courseType ?? 'Flat',
    rpe: input.rpe ?? null,
    workoutFeeling: '',
    painNote: input.painNote ?? '',
    sleepQuality: input.sleepQuality ?? null,
    conditionScore: input.conditionScore ?? null,
    stressLevel: null,
    companion: '',
    memo: '',
    laps: input.laps ?? [],
    fastSegments: [],
    metricSamples: [],
    routePoints: [],
    tags: input.tags ?? [],
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

describe('buildTrendLensResult', () => {
  it('returns neutral empty state when runs are missing', () => {
    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs: [],
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('neutral')
    expect(result.prescriptionImpact.status).toBe('not-enough-data')
  })

  it('detects same heart-rate band pace improvement in efficiency lens', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410 }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400 }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405 }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378 }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382 })
    ]

    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('good')
    expect(result.hero.value).toContain('+')
    expect(result.prescriptionImpact.status).toBe('raise-candidate')
  })

  it('flags hard-session density in intensity lens without treating load jump as injury prediction', () => {
    const runs = [
      run({ id: 'easy-1', date: '2026-05-26', type: 'Easy', distanceKm: 5, avgPaceSec: 420 }),
      run({ id: 'tempo-1', date: '2026-05-27', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'long-1', date: '2026-05-29', type: 'LSD', distanceKm: 12, avgHeartRate: 151, avgPaceSec: 430, rpe: 7 }),
      run({ id: 'race-1', date: '2026-05-31', type: 'Race', distanceKm: 5, avgPaceSec: 330 })
    ]

    const result = buildTrendLensResult({
      lens: 'intensity',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('warning')
    expect(result.explanations.join(' ')).toContain('스케줄 보수성')
    expect(result.prescriptionImpact.status).toBe('reduce-or-recover')
  })

  it('does not count low heart-rate low-rpe LSD as hard load', () => {
    const runs = [
      run({ id: 'easy-1', date: '2026-05-26', type: 'Easy', distanceKm: 5, avgPaceSec: 420 }),
      run({ id: 'tempo-1', date: '2026-05-27', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'long-1', date: '2026-05-29', type: 'LSD', distanceKm: 12, avgHeartRate: 142, avgPaceSec: 430, rpe: 4 }),
      run({ id: 'race-1', date: '2026-05-31', type: 'Race', distanceKm: 5, avgPaceSec: 330 })
    ]

    const result = buildTrendLensResult({
      lens: 'intensity',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).not.toBe('warning')
    expect(result.hero.detail).toContain('부하 주의 2회')
  })

  it('downgrades efficiency improvement to watch when samples are sparse', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 420 }),
      run({ id: 'new-1', date: '2026-05-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 })
    ]

    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.value).toContain('+')
    expect(result.hero.tone).toBe('watch')
    expect(result.hero.confidence).toBe('low')
    expect(result.prescriptionImpact.status).toBe('maintain')
  })

  it('downgrades efficiency improvement to watch when course context differs', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410, courseType: 'Flat' }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400, courseType: 'Flat' }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405, courseType: 'Flat' }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380, courseType: 'Track' }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378, courseType: 'Track' }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382, courseType: 'Track' })
    ]

    const result = buildTrendLensResult({
      lens: 'efficiency',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('watch')
    expect(result.hero.detail).toContain('코스 차이 큼')
  })

  it('uses pain note after a quality session as recovery cost signal', () => {
    const runs = [
      run({ id: 'tempo-1', date: '2026-05-20', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'easy-after', date: '2026-05-22', type: 'Easy', distanceKm: 4, avgPaceSec: 430, painNote: '햄스트링 뻣뻣함', rpe: 7 })
    ]

    const result = buildTrendLensResult({
      lens: 'recovery',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('warning')
    expect(result.cards.find((item) => item.id === 'pain')?.value).toBe('1')
  })

  it('does not turn a gap-only recovery response into warning', () => {
    const runs = [
      run({ id: 'long-1', date: '2026-05-20', type: 'LSD', distanceKm: 12, avgHeartRate: 142, avgPaceSec: 430, rpe: 4 }),
      run({ id: 'easy-after', date: '2026-05-25', type: 'Easy', distanceKm: 4, avgPaceSec: 430 })
    ]

    const result = buildTrendLensResult({
      lens: 'recovery',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.hero.tone).toBe('good')
    expect(result.chart[0].value).toBe(0)
    expect(result.chart[0].detail).toContain('공백 단독 관찰')
  })

  it('uses first-half versus second-half averages for quality drift', () => {
    const runs = [
      run({
        id: 'tempo-1',
        date: '2026-05-20',
        type: 'Tempo',
        distanceKm: 6,
        avgPaceSec: 400,
        maxHeartRate: 160,
        laps: [
          { index: 1, distanceKm: 1, paceSec: 420, avgHeartRate: 130, cadence: 170 },
          { index: 2, distanceKm: 1, paceSec: 400, avgHeartRate: 136, cadence: 172 },
          { index: 3, distanceKm: 1, paceSec: 398, avgHeartRate: 137, cadence: 172 },
          { index: 4, distanceKm: 1, paceSec: 405, avgHeartRate: 139, cadence: 171 }
        ]
      })
    ]

    const result = buildTrendLensResult({
      lens: 'quality',
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.chart[0].detail).toContain('안정')
    expect(result.cards.find((item) => item.id === 'drift')?.value).toBe('0')
  })
})

describe('buildTrendOverallSummary', () => {
  it('summarizes missing data without inventing a signal', () => {
    const result = buildTrendOverallSummary({
      period: '90d',
      baseline: 'previous-period',
      runs: [],
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.tone).toBe('neutral')
    expect(result.confidence).toBe('low')
    expect(result.bestSignal.title).toBe('아직 없음')
    expect(result.prescriptionDirection.title).toBe('기록 확보 우선')
  })

  it('prioritizes recovery caution over an efficiency raise candidate', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410 }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400 }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405 }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378 }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382 }),
      run({ id: 'tempo-1', date: '2026-05-20', type: 'Tempo', distanceKm: 6, avgPaceSec: 350, maxHeartRate: 170 }),
      run({ id: 'easy-after', date: '2026-05-22', type: 'Easy', distanceKm: 4, avgPaceSec: 430, painNote: '햄스트링 뻣뻣함', rpe: 7 })
    ]

    const result = buildTrendOverallSummary({
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(result.bestSignal.title).toContain('같은 심박에서')
    expect(result.cautionSignal.title).toContain('회복됐나')
    expect(result.prescriptionDirection.title).toBe('강도 상향 보류')
    expect(result.prescriptionDirection.tone).toBe('warning')
  })
})

describe('buildTrendAnalysis', () => {
  it('gates an efficiency raise candidate when recovery is warning', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410 }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400 }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405 }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378 }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382 }),
      run({ id: 'tempo-1', date: '2026-05-20', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'easy-after', date: '2026-05-22', type: 'Easy', distanceKm: 4, avgPaceSec: 430, painNote: '햄스트링 뻣뻣함', rpe: 7 })
    ]

    const analysis = buildTrendAnalysis({
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(analysis.lensResults.efficiency.hero.tone).toBe('good')
    expect(analysis.lensResults.efficiency.prescriptionImpact.status).toBe('maintain')
    expect(analysis.lensResults.efficiency.prescriptionImpact.title).toBe('현재 처방 유지 후 1회 더 확인')
    expect(analysis.lensResults.efficiency.prescriptionImpact.reasons.join(' ')).toContain('회복됐나')
    expect(analysis.overallSummary.prescriptionDirection.title).toBe('강도 상향 보류')
  })

  it('gates a quality raise candidate when intensity is warning', () => {
    const runs = [
      run({ id: 'tempo-1', date: '2026-05-27', type: 'Tempo', distanceKm: 6, avgPaceSec: 350 }),
      run({ id: 'long-1', date: '2026-05-29', type: 'LSD', distanceKm: 12, avgHeartRate: 151, avgPaceSec: 430, rpe: 7 }),
      run({ id: 'race-1', date: '2026-05-31', type: 'Race', distanceKm: 5, avgPaceSec: 330 })
    ]

    const analysis = buildTrendAnalysis({
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(analysis.lensResults.quality.hero.tone).toBe('good')
    expect(analysis.lensResults.intensity.hero.tone).toBe('warning')
    expect(analysis.lensResults.quality.prescriptionImpact.status).toBe('maintain')
    expect(analysis.lensResults.quality.prescriptionImpact.reasons.join(' ')).toContain('무리했나')
  })

  it('keeps a raise candidate when recovery and intensity gates are clear', () => {
    const runs = [
      run({ id: 'old-1', date: '2026-01-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 410 }),
      run({ id: 'old-2', date: '2026-01-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 400 }),
      run({ id: 'old-3', date: '2026-02-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 405 }),
      run({ id: 'new-1', date: '2026-04-10', type: 'Easy', avgHeartRate: 140, avgPaceSec: 380 }),
      run({ id: 'new-2', date: '2026-04-20', type: 'Easy', avgHeartRate: 142, avgPaceSec: 378 }),
      run({ id: 'new-3', date: '2026-05-10', type: 'Easy', avgHeartRate: 141, avgPaceSec: 382 })
    ]

    const analysis = buildTrendAnalysis({
      period: '90d',
      baseline: 'previous-period',
      runs,
      memory: initialTrainingMemory,
      today: new Date('2026-06-01T00:00:00')
    })

    expect(analysis.lensResults.efficiency.prescriptionImpact.status).toBe('raise-candidate')
    expect(analysis.overallSummary.prescriptionDirection.title).toBe('Easy 또는 Tempo 처방 소폭 상향 후보')
  })
})

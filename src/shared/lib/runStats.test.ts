import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingInjuryItem, TrainingMemory } from '@/entities/training-memory/model'
import { normalizeTrainingMemory } from '@/entities/training-memory/model'
import { getNextSessionRecommendation } from './runStats'

const today = new Date('2026-06-02T00:00:00')
const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const todayDayName = dayNames[today.getDay()]
const longRunDay = todayDayName === '토요일' ? '일요일' : '토요일'

function buildMemory(injury?: Partial<TrainingInjuryItem>): TrainingMemory {
  return normalizeTrainingMemory({
    weeklyPattern: [`${todayDayName}: Tempo`],
    athleteProfile: { preferredLongRunDay: longRunDay } as TrainingMemory['athleteProfile'],
    injuryItems: injury ? [{ title: '테스트 부상', status: 'active', normalizedAreas: [], ...injury } as TrainingInjuryItem] : []
  })
}

const runs: RunLog[] = []

describe('getNextSessionRecommendation injury gate', () => {
  it('keeps the quality session when there is no injury', () => {
    const rec = getNextSessionRecommendation(buildMemory(), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })

  it('keeps the recommendation for severity 0-1', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 1 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })

  it('adds a checkpoint note but keeps the session for severity 2', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 2 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(true)
    expect(rec.injuryNote).toContain('체크포인트')
  })

  it('downgrades a quality session to Easy/Recovery for severity 3', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 3 }), runs, today)
    expect(rec.title).toBe('Easy 또는 Recovery')
    expect(rec.injuryAdjusted).toBe(true)
  })

  it('prioritizes recovery or rest for severity 4-5', () => {
    const rec = getNextSessionRecommendation(buildMemory({ severity: 5 }), runs, today)
    expect(rec.title).toBe('Recovery 또는 휴식')
    expect(rec.injuryAdjusted).toBe(true)
    expect(rec.injuryNote).toContain('휴식')
  })

  it('does not gate when the injury is resolved', () => {
    const rec = getNextSessionRecommendation(buildMemory({ status: 'resolved', severity: 5 }), runs, today)
    expect(rec.title).toBe('Tempo')
    expect(rec.injuryAdjusted).toBe(false)
  })
})

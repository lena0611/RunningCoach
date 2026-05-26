import { describe, expect, it } from 'vitest'
import type { RunLog } from '@/entities/run/model'
import type { TrainingGoal } from '@/entities/training-memory/model'
import { getRaceProjection } from '@/shared/lib/performanceProjection'
import { makeRun } from './factories'

const goal: TrainingGoal = {
  id: 'goal-10k',
  title: '10km 60분',
  category: 'race',
  startDate: null,
  targetDate: '2026-11-25',
  distanceKm: 10,
  targetDurationSec: 3600,
  priority: 1,
  status: 'active',
  successCriteria: '10km 60분 이내',
  strategyNotes: '',
  notes: '',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
}

describe('getRaceProjection', () => {
  it('uses recent eligible quality sessions for goal projection trend', () => {
    const runs: RunLog[] = [
      makeRun({ id: 'easy', date: '2026-05-24', type: 'Easy', distanceKm: 5, durationSec: 2400 }),
      makeRun({ id: 'tempo-old', date: '2026-05-21', type: 'Tempo', distanceKm: 5, durationSec: 2100 }),
      makeRun({ id: 'tempo-new', date: '2026-05-25', type: 'Tempo', distanceKm: 6, durationSec: 2400 })
    ]

    const projection = getRaceProjection(runs, goal)

    expect(projection?.current.runId).toBe('tempo-new')
    expect(projection?.previous?.runId).toBe('tempo-old')
    expect(projection?.deltaSec).toBeLessThan(0)
  })

  it('returns null when there is no reliable signal', () => {
    const runs: RunLog[] = [
      makeRun({ id: 'easy', date: '2026-05-24', type: 'Easy', distanceKm: 5, durationSec: 2400 })
    ]

    expect(getRaceProjection(runs, goal)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { createInjuryCheckInDismissKey } from '@/features/injury-check-in/injuryCheckInPrompt'

describe('createInjuryCheckInDismissKey', () => {
  it('keeps the same key across app restarts for the same daily prompt condition', () => {
    const state = {
      userId: 'runner-1',
      itemId: 'injury-left-hamstring',
      todayKey: '2026-05-30',
      latestQualityRunDate: '2026-05-29',
      lastCheckedAt: '2026-05-27T12:00:00.000Z'
    }

    expect(createInjuryCheckInDismissKey(state)).toBe(createInjuryCheckInDismissKey({ ...state }))
  })

  it('changes the key when a later quality run creates a new prompt condition', () => {
    const base = {
      userId: 'runner-1',
      itemId: 'injury-left-hamstring',
      todayKey: '2026-05-30',
      latestQualityRunDate: '2026-05-29',
      lastCheckedAt: '2026-05-27T12:00:00.000Z'
    }

    expect(createInjuryCheckInDismissKey(base)).not.toBe(createInjuryCheckInDismissKey({
      ...base,
      latestQualityRunDate: '2026-05-30'
    }))
  })
})

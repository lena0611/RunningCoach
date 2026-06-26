import { describe, expect, it } from 'vitest'
import { getDisabledNotificationItems, type NotificationSettings } from './settingsStore'

const enabledSettings: NotificationSettings = {
  allEnabled: true,
  scheduledWorkout: true,
  workoutMorning: true,
  healthKitNewRun: true
}

describe('getDisabledNotificationItems', () => {
  it('returns no items when every notification setting is enabled', () => {
    expect(getDisabledNotificationItems(enabledSettings)).toEqual([])
  })

  it('treats every notification row as off when the master toggle is disabled', () => {
    expect(getDisabledNotificationItems({ ...enabledSettings, allEnabled: false }).map((item) => item.key)).toEqual([
      'allEnabled',
      'workoutMorning',
      'scheduledWorkout',
      'healthKitNewRun'
    ])
  })

  it('returns only disabled detail rows when the master toggle is enabled', () => {
    expect(getDisabledNotificationItems({ ...enabledSettings, scheduledWorkout: false }).map((item) => item.key)).toEqual([
      'scheduledWorkout'
    ])
  })
})

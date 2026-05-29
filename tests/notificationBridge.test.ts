import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyHealthKitNewRuns } from '@/features/sync-native-notifications/notificationBridge'
import type { NotificationSettings } from '@/app/stores/settingsStore'

const enabledSettings: NotificationSettings = {
  allEnabled: true,
  scheduledWorkout: true,
  workoutMorning: true,
  healthKitNewRun: true
}

afterEach(() => {
  vi.restoreAllMocks()
  delete window.webkit
  setVisibilityState('visible')
})

describe('notifyHealthKitNewRuns', () => {
  it('does not request a native banner while the app is visible', () => {
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { runContextNotifications: { postMessage } } }
    setVisibilityState('visible')

    const result = notifyHealthKitNewRuns(enabledSettings, 1)

    expect(result).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('requests a native banner when the document is hidden', () => {
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { runContextNotifications: { postMessage } } }
    setVisibilityState('hidden')

    const result = notifyHealthKitNewRuns(enabledSettings, 2)

    expect(result).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'showNotification',
      title: '새 러닝 기록을 가져왔습니다',
      body: 'HealthKit에서 새 러닝 2개를 저장했습니다.'
    }))
  })
})

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value
  })
}

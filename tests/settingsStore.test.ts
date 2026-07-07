import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/app/stores/settingsStore'
import { DEFAULT_COACH_MODEL } from '@/shared/lib/coaching/coachModels'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('persists notification settings and ignores legacy theme keys', () => {
    // 과거 저장된 테마 설정이 남아 있어도(다크 단일화 이전 사용자) 로드가 깨지지 않는다
    localStorage.setItem('runcontext.settings', JSON.stringify({
      themePreference: 'light',
      notificationSettings: { allEnabled: true, healthKitNewRun: false }
    }))
    setActivePinia(createPinia())
    const store = useSettingsStore()

    expect(store.notificationSettings).toMatchObject({
      allEnabled: true,
      healthKitNewRun: false,
      scheduledWorkout: true,
      workoutMorning: true
    })

    store.setNotificationSetting('scheduledWorkout', false)

    expect(JSON.parse(localStorage.getItem('runcontext.settings') || '{}')).toEqual({
      notificationSettings: {
        allEnabled: true,
        healthKitNewRun: false,
        scheduledWorkout: false,
        workoutMorning: true
      },
      coachingModel: DEFAULT_COACH_MODEL
    })
  })

  it('persists coaching model and falls back to default for invalid stored value', () => {
    localStorage.setItem('runcontext.settings', JSON.stringify({ coachingModel: 'bogus/model' }))
    setActivePinia(createPinia())
    const store = useSettingsStore()
    expect(store.coachingModel).toBe(DEFAULT_COACH_MODEL)

    store.setCoachingModel('z-ai/glm-5.2')
    expect(store.coachingModel).toBe('z-ai/glm-5.2')
    expect(JSON.parse(localStorage.getItem('runcontext.settings') || '{}').coachingModel).toBe('z-ai/glm-5.2')
  })
})

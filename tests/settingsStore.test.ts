import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/app/stores/settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-preference')
    setActivePinia(createPinia())
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn()
    }))
  })

  it('starts in dark mode by default and can follow iOS theme', () => {
    const store = useSettingsStore()

    store.initTheme()
    expect(store.themePreference).toBe('dark')
    expect(store.effectiveTheme).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)

    store.setFollowSystem(true)

    expect(store.themePreference).toBe('system')
    expect(store.effectiveTheme).toBe('light')
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)

    store.setFollowSystem(false)
    expect(store.themePreference).toBe('light')

    store.setManualTheme('dark')

    expect(store.themePreference).toBe('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(document.documentElement.dataset.themePreference).toBe('dark')
    expect(JSON.parse(localStorage.getItem('runcontext.settings') || '{}')).toMatchObject({
      themePreference: 'dark',
      notificationSettings: {
        allEnabled: false,
        healthKitNewRun: true,
        scheduledWorkout: true,
        workoutMorning: true
      }
    })
  })
})

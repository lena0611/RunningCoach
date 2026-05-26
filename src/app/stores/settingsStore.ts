import { defineStore } from 'pinia'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ManualThemeMode = 'light' | 'dark'

const storageKey = 'runcontext.settings'
let mediaListenerAttached = false

export const useSettingsStore = defineStore('settingsStore', {
  state: () => ({
    themePreference: loadSettings().themePreference,
    systemTheme: getSystemTheme()
  }),
  getters: {
    followsSystem: (state) => state.themePreference === 'system',
    manualTheme: (state): ManualThemeMode => (state.themePreference === 'dark' ? 'dark' : 'light'),
    effectiveTheme: (state): ManualThemeMode => (state.themePreference === 'system' ? state.systemTheme : state.themePreference)
  },
  actions: {
    initTheme() {
      attachSystemThemeListener((theme) => {
        this.systemTheme = theme
        this.applyTheme()
      })
      this.applyTheme()
    },
    setFollowSystem(enabled: boolean) {
      if (enabled) {
        this.themePreference = 'system'
      } else if (this.themePreference === 'system') {
        this.themePreference = this.systemTheme
      }
      this.persist()
      this.applyTheme()
    },
    setManualTheme(mode: ManualThemeMode) {
      this.themePreference = mode
      this.persist()
      this.applyTheme()
    },
    applyTheme() {
      if (typeof document === 'undefined') return
      const root = document.documentElement
      root.classList.toggle('theme-light', this.effectiveTheme === 'light')
      root.classList.toggle('theme-dark', this.effectiveTheme === 'dark')
      root.dataset.themePreference = this.themePreference
      root.dataset.theme = this.effectiveTheme
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify({ themePreference: this.themePreference }))
    }
  }
})

function loadSettings(): { themePreference: ThemePreference } {
  if (typeof localStorage === 'undefined') return { themePreference: 'dark' }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}') as { themePreference?: string }
    return { themePreference: normalizeThemePreference(parsed.themePreference) }
  } catch {
    return { themePreference: 'dark' }
  }
}

function normalizeThemePreference(value: string | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark'
}

function getSystemTheme(): ManualThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function attachSystemThemeListener(onChange: (theme: ManualThemeMode) => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function' || mediaListenerAttached) return
  const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
  mediaQuery.addEventListener('change', (event) => onChange(event.matches ? 'light' : 'dark'))
  mediaListenerAttached = true
}

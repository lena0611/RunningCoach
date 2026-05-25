import { defineStore } from 'pinia'
import { useToastStore } from '@/app/stores/toastStore'
import {
  hasWeatherKitBridge,
  registerWeatherKitBridge,
  requestWeatherForecast,
  unregisterWeatherKitBridge,
  type WeatherSnapshot
} from '@/features/import-weatherkit/weatherKitBridge'

const minRefreshIntervalMs = 15 * 60 * 1000
let listenersAttached = false

export const useWeatherStore = defineStore('weatherStore', {
  state: () => ({
    initialized: false,
    loading: false,
    error: '',
    snapshot: null as WeatherSnapshot | null,
    lastRequestedAt: 0,
    lastReceivedAt: 0
  }),
  getters: {
    hasBridge: () => hasWeatherKitBridge(),
    current: (state) => state.snapshot?.current ?? null,
    hourly: (state) => state.snapshot?.hourly ?? [],
    daily: (state) => state.snapshot?.daily ?? []
  },
  actions: {
    init() {
      if (this.initialized) return
      registerWeatherKitBridge({
        onForecast: (snapshot) => this.handleForecast(snapshot),
        onError: (message) => this.handleError(message)
      })
      this.initialized = true
    },
    dispose() {
      unregisterWeatherKitBridge()
      this.initialized = false
    },
    attachActivationListeners() {
      if (listenersAttached) return
      listenersAttached = true
      window.addEventListener('focus', () => void this.refreshAfterActivation())
      window.addEventListener('pageshow', () => void this.refreshAfterActivation())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.refreshAfterActivation()
      })
    },
    async refreshAfterActivation() {
      this.init()
      if (!hasWeatherKitBridge()) return
      const now = Date.now()
      if (this.loading || (this.snapshot && now - this.lastReceivedAt < minRefreshIntervalMs)) return
      this.requestForecast()
    },
    requestForecast() {
      this.init()
      if (!hasWeatherKitBridge()) return
      this.loading = true
      this.error = ''
      this.lastRequestedAt = Date.now()
      try {
        requestWeatherForecast()
      } catch (err) {
        this.loading = false
        this.error = err instanceof Error ? err.message : '기상정보 요청 실패'
      }
    },
    handleForecast(snapshot: WeatherSnapshot) {
      this.snapshot = snapshot
      this.loading = false
      this.error = ''
      this.lastReceivedAt = Date.now()
    },
    handleError(message: string) {
      this.loading = false
      this.error = message || '기상정보 가져오기 실패'
      useToastStore().error(this.error, {
        placement: 'top',
        delayMs: 280,
        durationMs: 3600
      })
    }
  }
})

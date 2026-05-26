import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useToastStore } from '@/app/stores/toastStore'
import { requestOpenMeteoForecast } from '@/features/import-open-meteo/openMeteoWeather'
import {
  hasWeatherKitBridge,
  registerWeatherKitBridge,
  requestWeatherForecast,
  unregisterWeatherKitBridge,
  type WeatherSnapshot
} from '@/features/import-weatherkit/weatherKitBridge'

const minRefreshIntervalMs = 15 * 60 * 1000
let listenersAttached = false
type ForecastRequestOptions = {
  silent?: boolean
}

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
      const authStore = useAuthStore()
      if (!authStore.isAuthenticated) return
      const now = Date.now()
      if (this.loading || (this.snapshot && now - this.lastReceivedAt < minRefreshIntervalMs)) return
      await this.requestForecast({ silent: true })
    },
    async requestForecast(options: ForecastRequestOptions = {}) {
      this.init()
      this.loading = true
      this.error = ''
      this.lastRequestedAt = Date.now()
      try {
        if (hasWeatherKitBridge()) {
          requestWeatherForecast()
          return
        }

        const snapshot = await requestOpenMeteoForecast()
        this.handleForecast(snapshot)
      } catch (err) {
        this.loading = false
        this.error = formatWeatherError(err)
        if (!options.silent) {
          useToastStore().error(this.error, {
            placement: 'top',
            delayMs: 280,
            durationMs: 3600
          })
        }
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
      this.error = message || '날씨 가져오기 실패'
      useToastStore().error(this.error, {
        placement: 'top',
        delayMs: 280,
        durationMs: 3600
      })
    }
  }
})

function formatWeatherError(err: unknown) {
  if (isGeolocationError(err)) {
    if (err.code === 1) return '위치 권한이 거부되어 날씨를 가져오지 못했습니다.'
    if (err.code === 2) return '현재 위치를 확인하지 못했습니다.'
    if (err.code === 3) return '위치 확인이 지연되고 있습니다. 잠시 후 다시 눌러 주세요.'
  }
  return err instanceof Error ? err.message : '날씨 요청 실패'
}

function isGeolocationError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code?: unknown }).code === 'number'
}

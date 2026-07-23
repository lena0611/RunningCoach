import { defineStore } from 'pinia'
import { useAuthStore } from '@/app/stores/authStore'
import { useRunStore } from '@/app/stores/runStore'
import { useToastStore } from '@/app/stores/toastStore'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { getCurrentCoords, requestKmaForecast, type Coords } from '@/features/import-kma/kmaWeather'
import { friendlyErrorMessage } from '@/shared/lib/friendlyError'
import { requestOpenMeteoForecast } from '@/features/import-open-meteo/openMeteoWeather'
import { hasNativeLocationBridge, requestNativeCoords } from '@/features/native-location/nativeLocationBridge'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'

const minRefreshIntervalMs = 15 * 60 * 1000
// 실패 토스트 스로틀 — 제공자(기상청 포털) 장애 중 화면 전환마다 토스트가 반복되지 않게(10분 1회).
// 카드의 에러 상태 표시는 그대로 유지된다.
const errorToastThrottleMs = 10 * 60 * 1000
let lastErrorToastAt = 0
let listenersAttached = false

export type WeatherLocationSource = 'current' | 'last-run'

type ForecastRequestOptions = {
  silent?: boolean
}

export const useWeatherStore = defineStore('weatherStore', {
  state: () => ({
    initialized: false,
    loading: false,
    error: '',
    snapshot: null as WeatherSnapshot | null,
    locationSource: 'current' as WeatherLocationSource,
    coords: null as Coords | null,
    lastRequestedAt: 0,
    /** 마지막 요청이 무음(silent) 배경 갱신이었는가 — 네이티브 콜백 에러 토스트 억제용. */
    lastRequestSilent: false,
    lastReceivedAt: 0
  }),
  getters: {
    current: (state) => state.snapshot?.current ?? null,
    hourly: (state) => state.snapshot?.hourly ?? [],
    daily: (state) => state.snapshot?.daily ?? [],
    locationName: (state) => state.snapshot?.locationName ?? null,
    // 마지막 러닝 위치를 쓸 수 있는지(GPS 러닝이 하나라도 있는지)
    hasLastRunLocation: () => Boolean(getLastRunCoords())
  },
  actions: {
    init() {
      if (this.initialized) return
      this.initialized = true
    },
    dispose() {
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
    async setLocationSource(source: WeatherLocationSource) {
      if (this.locationSource === source) return
      this.locationSource = source
      await this.requestForecast()
    },
    async resolveCoords(): Promise<Coords> {
      if (this.locationSource === 'last-run') {
        const lastRun = getLastRunCoords()
        if (lastRun) return lastRun
        // GPS 러닝이 없으면 현위치로 자연 강등한다.
        this.locationSource = 'current'
      }
      // iOS WKWebView는 navigator.geolocation이 막혀 있어 네이티브(CLLocation) 위치를 우선한다.
      if (hasNativeLocationBridge()) return requestNativeCoords()
      return getCurrentCoords()
    },
    async requestForecast(options: ForecastRequestOptions = {}) {
      this.init()
      this.loading = true
      this.error = ''
      this.lastRequestedAt = Date.now()
      this.lastRequestSilent = Boolean(options.silent)
      try {
        const coords = await this.resolveCoords()
        this.coords = coords

        const authStore = useAuthStore()
        if (isSupabaseConfigured && authStore.isAuthenticated) {
          const result = await requestKmaForecast(coords, null)
          if (result.kind === 'out-of-range') {
            // 현재 시점 조회는 보통 범위 안이다. 방어적으로 안내만 남긴다.
            this.loading = false
            this.error = '선택한 시점은 기상청 예보 범위(약 3일)를 벗어났습니다.'
            return
          }
          this.handleForecast(result.snapshot)
          return
        }

        // Supabase 미설정/비로그인 개발 환경 fallback. 운영 기본은 기상청(Edge) 경유다.
        const snapshot = await requestOpenMeteoForecast()
        this.handleForecast(snapshot)
      } catch (err) {
        this.loading = false
        // 위치 권한 계열은 구체 한국어 안내 유지, 그 외(시스템 원문 "The request timed out." 등)는 친화 문구로.
        this.error = friendlyErrorMessage(err, '날씨를 가져오지 못했어요. 잠시 후 자동으로 다시 시도해요.')
        if (isGeolocationError(err)) this.error = formatWeatherError(err)
        if (!options.silent && Date.now() - lastErrorToastAt > errorToastThrottleMs) {
          lastErrorToastAt = Date.now()
          useToastStore().error(this.error, { placement: 'top', delayMs: 280, durationMs: 3600 })
        }
      }
    },
    handleForecast(snapshot: WeatherSnapshot) {
      this.snapshot = snapshot
      this.loading = false
      this.error = ''
      this.lastReceivedAt = Date.now()
    }
  }
})

// 가장 최근 GPS 러닝의 시작점(routePoints[0])을 마지막 러닝 위치로 본다.
function getLastRunCoords(): Coords | null {
  try {
    const runStore = useRunStore()
    for (const run of runStore.sortedRuns) {
      const start = run.routePoints?.[0]
      if (start && Number.isFinite(start.latitude) && Number.isFinite(start.longitude)) {
        return { lat: start.latitude, lon: start.longitude }
      }
    }
  } catch {
    // 러닝 스토어 미초기화 등은 현위치 fallback으로 넘긴다.
  }
  return null
}

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

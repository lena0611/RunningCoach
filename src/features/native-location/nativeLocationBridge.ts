// iOS 네이티브(CLLocation)에서 현위치 좌표만 받아오는 브리지.
// 과거에는 네이티브가 Open-Meteo 날씨까지 실어보냈으나(runContextWeatherKit),
// 이제 날씨는 웹의 KMA(weather-run) 경로로 통일한다 — 네이티브는 위치만 제공한다.
// WKWebView는 navigator.geolocation이 막혀 있어 위치를 네이티브에서 받아야 한다.
import type { Coords } from '@/features/import-kma/kmaWeather'

const requestTimeoutMs = 20_000

declare global {
  interface Window {
    RunContextLocation?: {
      receiveLocation: (coords: { lat: number; lon: number }) => void
      receiveError: (message: string) => void
    }
  }
}

type Pending = {
  resolve: (coords: Coords) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let pending: Pending | null = null

export function hasNativeLocationBridge(): boolean {
  return Boolean(window.webkit?.messageHandlers?.runContextLocation)
}

function settle(fn: (p: Pending) => void) {
  const current = pending
  if (!current) return
  pending = null
  clearTimeout(current.timer)
  fn(current)
}

function installCallbacks() {
  if (window.RunContextLocation) return
  window.RunContextLocation = {
    receiveLocation(coords) {
      settle((p) => {
        if (
          coords &&
          typeof coords.lat === 'number' &&
          typeof coords.lon === 'number' &&
          Number.isFinite(coords.lat) &&
          Number.isFinite(coords.lon)
        ) {
          p.resolve({ lat: coords.lat, lon: coords.lon })
        } else {
          p.reject(new Error('위치 응답이 올바르지 않습니다.'))
        }
      })
    },
    receiveError(message) {
      settle((p) => p.reject(new Error(message || '현재 위치를 가져오지 못했습니다.')))
    }
  }
}

export function requestNativeCoords(): Promise<Coords> {
  const handler = window.webkit?.messageHandlers?.runContextLocation
  if (!handler) {
    return Promise.reject(new Error('iOS 위치 브리지가 연결되어 있지 않습니다.'))
  }
  installCallbacks()
  // 직전 요청이 아직 살아 있으면 취소한다(마지막 요청 우선).
  settle((p) => p.reject(new Error('중복 위치 요청으로 취소되었습니다.')))
  return new Promise<Coords>((resolve, reject) => {
    const timer = setTimeout(() => {
      settle((p) => p.reject(new Error('현재 위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')))
    }, requestTimeoutMs)
    pending = { resolve, reject, timer }
    handler.postMessage({ type: 'requestLocation' })
  })
}

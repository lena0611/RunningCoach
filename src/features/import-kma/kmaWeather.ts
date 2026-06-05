// 기상청 단기예보를 Supabase Edge Function(weather-run) 경유로 받는다.
// serviceKey는 서버 secret이며 프론트는 위경도+시점만 보낸다. 설계: Issue #219.
import { getAppSessionToken } from '@/shared/api/appSecurity'
import { requireSupabase } from '@/shared/api/supabase'
import type { WeatherSnapshot } from '@/features/import-weatherkit/weatherKitBridge'

export type Coords = { lat: number; lon: number }

export type KmaForecastResult =
  | { kind: 'ok'; snapshot: WeatherSnapshot }
  | { kind: 'out-of-range'; reason: string; locationName: string | null; maxForecastAt: string | null }

const positionCacheKey = 'runcontext.weather.position.v1'
const freshPositionMaxAgeMs = 30 * 60 * 1000
const fallbackPositionMaxAgeMs = 7 * 24 * 60 * 60 * 1000
const positionLookupTimeoutMs = 10_000

export async function requestKmaForecast(coords: Coords, when: Date | null): Promise<KmaForecastResult> {
  const appSessionToken = await getAppSessionToken()
  const { data, error } = await requireSupabase().functions.invoke('weather-run', {
    headers: { 'x-pacelab-app-session': appSessionToken },
    body: {
      lat: coords.lat,
      lon: coords.lon,
      when: when ? when.toISOString() : undefined
    }
  })
  if (error) throw new Error(extractEdgeError(error) || '날씨 요청에 실패했습니다.')
  if (data?.outOfRange) {
    return {
      kind: 'out-of-range',
      reason: typeof data.reason === 'string' ? data.reason : 'beyond-forecast',
      locationName: typeof data.locationName === 'string' ? data.locationName : null,
      maxForecastAt: typeof data.maxForecastAt === 'string' ? data.maxForecastAt : null
    }
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.snapshot) throw new Error('날씨 응답이 비어 있습니다.')
  return { kind: 'ok', snapshot: data.snapshot as WeatherSnapshot }
}

function extractEdgeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

// 현위치 GPS 좌표. 캐시 우선, 실패 시 fallback 캐시.
export async function getCurrentCoords(): Promise<Coords> {
  const fresh = getCachedPosition(freshPositionMaxAgeMs)
  if (fresh) return fresh

  if (!navigator.geolocation) {
    const cached = getCachedPosition(fallbackPositionMaxAgeMs)
    if (cached) return cached
    throw new Error('이 환경에서 위치 권한을 사용할 수 없습니다.')
  }

  return new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lon: position.coords.longitude }
        saveCachedPosition(coords)
        resolve(coords)
      },
      (geoError) => {
        const cached = getCachedPosition(fallbackPositionMaxAgeMs)
        if (cached && (geoError.code === 2 || geoError.code === 3)) {
          resolve(cached)
          return
        }
        reject(geoError)
      },
      { enableHighAccuracy: false, maximumAge: freshPositionMaxAgeMs, timeout: positionLookupTimeoutMs }
    )
  })
}

function getCachedPosition(maxAgeMs: number): Coords | null {
  try {
    const raw = localStorage.getItem(positionCacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { latitude: number; longitude: number; savedAt: number }
    if (!Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude) || !Number.isFinite(parsed.savedAt)) return null
    if (Date.now() - parsed.savedAt > maxAgeMs) return null
    return { lat: parsed.latitude, lon: parsed.longitude }
  } catch {
    return null
  }
}

function saveCachedPosition(coords: Coords) {
  try {
    localStorage.setItem(positionCacheKey, JSON.stringify({ latitude: coords.lat, longitude: coords.lon, savedAt: Date.now() }))
  } catch {
    // 위치 캐시는 편의 기능이다. 저장 실패가 날씨 조회를 막으면 안 된다.
  }
}

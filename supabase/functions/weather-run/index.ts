// weather-run: 기상청 단기예보(VilageFcstInfoService_2.0) 프록시.
// serviceKey는 서버 secret(KMA_SERVICE_KEY_DEC / KMA_SERVICE_KEY_ENC)으로만 보관하고 프론트에 노출하지 않는다.
// 위경도 -> 격자(nx/ny) 룩업(grid.json 최근접) -> 초단기실황 + 단기예보 호출 -> WeatherSnapshot 정규화.
// 설계 합의: .claude memory weather-runner-domain.md, Issue #219.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  consumeRateLimit,
  corsHeaders,
  json,
  positiveIntegerEnv,
  requireAppSession,
  requiredEnv
} from '../_shared/appSession.ts'
import gridData from './grid.json' with { type: 'json' }

// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any

type GridRow = [number, number, number, number, string, string, string] // nx, ny, lat, lon, sido, sigungu, dong
const GRID = gridData as GridRow[]

const KMA_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0'
const VILAGE_BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]
const KOREA_BOUNDS = { latMin: 33, latMax: 43, lonMin: 124, lonMax: 132 }

// 발표시각별 응답을 warm 인스턴스에서 재사용해 data.go.kr 호출/지연을 흡수한다.
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Missing bearer token' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id

    const access = await requireAppSession(admin, req, userId)
    if (!access.ok) return json({ error: access.error }, access.status)

    const limit = positiveIntegerEnv('WEATHER_RUN_RATE_LIMIT_PER_HOUR', 60)
    const rateLimit = await consumeRateLimit(admin, userId, 'weather-run', limit)
    if (!rateLimit.ok) return json({ error: rateLimit.error, retryAfterSec: rateLimit.retryAfterSec }, 429)

    const body = await req.json().catch(() => ({}))
    const lat = Number(body.lat)
    const lon = Number(body.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: 'lat/lon required' }, 400)
    if (lat < KOREA_BOUNDS.latMin || lat > KOREA_BOUNDS.latMax || lon < KOREA_BOUNDS.lonMin || lon > KOREA_BOUNDS.lonMax) {
      return json({ ok: false, outOfRange: true, reason: 'outside-korea' })
    }

    const target = typeof body.when === 'string' && body.when ? new Date(body.when) : new Date()
    if (!Number.isFinite(target.getTime())) return json({ error: 'invalid when' }, 400)

    const grid = findNearestGrid(lat, lon)
    const targetIsNow = Math.abs(target.getTime() - Date.now()) < 60 * 60 * 1000
    try {
      const result = await buildWeather(grid, target)
      // 현재 시점 성공 응답은 격자별로 보관 — 포털 장애 시 stale 로라도 응답한다(빈 화면·에러 토스트보다 낫다).
      if (targetIsNow && (result as { ok?: boolean }).ok) lastGood.set(`${grid[0]},${grid[1]}`, result)
      return json(result)
    } catch (error) {
      // 공공데이터포털 과부하(간헐 502·타임아웃, 2026-07-23 관측) 폴백: 같은 격자의 마지막 성공 응답이
      // 있으면 그걸 준다(웜 격리 한정). 데이터는 최대 수시간 전 예보지만 러닝 준비 용도로 유효하다.
      const stale = targetIsNow ? lastGood.get(`${grid[0]},${grid[1]}`) : undefined
      if (stale) return json({ ...stale, stale: true })
      return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// 격자별 마지막 성공 응답(현재 시점 요청 한정) — 포털 장애 시 stale 폴백용. 격리 수명 한정(콜드스타트엔 없음).
const lastGood = new Map<string, unknown>()

function findNearestGrid(lat: number, lon: number): GridRow {
  let best = GRID[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const row of GRID) {
    const dLat = row[2] - lat
    const dLon = (row[3] - lon) * Math.cos((lat * Math.PI) / 180)
    const dist = dLat * dLat + dLon * dLon
    if (dist < bestDist) {
      bestDist = dist
      best = row
    }
  }
  return best
}

function locationLabel(grid: GridRow): string {
  return [grid[6], grid[5], grid[4]].find((part) => part && part.trim()) ?? '현재 위치'
}

async function buildWeather(grid: GridRow, target: Date) {
  const [nx, ny] = grid
  const kst = toKst(new Date())
  const vilage = getVilageBase(kst)
  const targetIsNow = Math.abs(target.getTime() - Date.now()) < 60 * 60 * 1000

  // 오늘 지나간 시간(자정~현재 발표 예보 시작 전)을 채우기 위해 지난밤(전일 2300) 발표 예보를 병합한다.
  // 기상청은 과거 실측을 기본 제공하지 않아, 지난밤 예보로 오전 구간을 채워 차트가 자정부터 연속된다.
  // 두 호출은 병렬 — KMA가 느려 직렬 2회(각 10s 타임아웃)는 콜드스타트에서 전체 실패를 만든다.
  // buildHourly는 시간 키로 카테고리를 덮어쓰므로 backfill을 앞에 둬 겹치는 시간은 최신(현재 base)이 이긴다.
  const backfill = getBackfillBase(kst)
  const wantBackfill = backfill.baseDate !== vilage.baseDate || backfill.baseTime !== vilage.baseTime
  const [vilageResult, backfillResult] = await Promise.allSettled([
    fetchKmaCached('getVilageFcst', nx, ny, vilage.baseDate, vilage.baseTime, 1000),
    wantBackfill ? fetchKmaCached('getVilageFcst', nx, ny, backfill.baseDate, backfill.baseTime, 1000) : Promise.resolve([] as KmaItem[])
  ])
  if (vilageResult.status === 'rejected') throw vilageResult.reason
  // 백필 실패는 무시한다 — 현재 예보만으로도 동작한다(오전이 빌 뿐).
  const backfillItems = backfillResult.status === 'fulfilled' ? backfillResult.value : []
  const hourly = buildHourly([...backfillItems, ...vilageResult.value])
  if (!hourly.length) throw new Error('기상청 예보 데이터를 받지 못했습니다.')

  const lastFcst = Date.parse(hourly[hourly.length - 1].time)
  if (target.getTime() > lastFcst + 60 * 60 * 1000) {
    return { ok: false, outOfRange: true, reason: 'beyond-forecast', locationName: locationLabel(grid), maxForecastAt: hourly[hourly.length - 1].time }
  }

  const daily = buildDaily(vilageResult.value)
  let current = nearestHourly(hourly, target)

  if (targetIsNow) {
    const ncst = getNcstBase(kst)
    try {
      const ncstItems = await fetchKmaCached('getUltraSrtNcst', nx, ny, ncst.baseDate, ncst.baseTime, 60)
      current = mergeObserved(current, ncstItems)
    } catch {
      // 실황 실패는 단기예보 nearest로 대체한다. 빈 화면보다 예보값이 낫다.
    }
  }

  return {
    ok: true,
    snapshot: {
      locationName: locationLabel(grid),
      observedAt: (targetIsNow ? new Date() : target).toISOString(),
      grid: { nx, ny },
      current,
      hourly,
      daily
    }
  }
}

// ---- 기상청 호출 ----

async function fetchKmaCached(endpoint: string, nx: number, ny: number, baseDate: string, baseTime: string, numOfRows: number) {
  const key = `${endpoint}:${nx},${ny}:${baseDate}${baseTime}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as KmaItem[]
  // 공공데이터포털은 과부하 시 간헐 502/타임아웃을 뱉는다(2026-07-23 관측) — 1회 재시도로 스파이크를 흡수한다.
  let items: KmaItem[]
  try {
    items = await fetchKma(endpoint, nx, ny, baseDate, baseTime, numOfRows)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 800))
    items = await fetchKma(endpoint, nx, ny, baseDate, baseTime, numOfRows)
  }
  cache.set(key, { value: items, expiresAt: Date.now() + CACHE_TTL_MS })
  return items
}

type KmaItem = { category: string; fcstDate?: string; fcstTime?: string; fcstValue?: string; obsrValue?: string; baseDate?: string; baseTime?: string }

async function fetchKma(endpoint: string, nx: number, ny: number, baseDate: string, baseTime: string, numOfRows: number): Promise<KmaItem[]> {
  const params = new URLSearchParams({
    pageNo: '1',
    numOfRows: String(numOfRows),
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny)
  })
  const decKey = Deno.env.get('KMA_SERVICE_KEY_DEC')
  const encKey = Deno.env.get('KMA_SERVICE_KEY_ENC')
  let url: string
  if (decKey) {
    params.set('serviceKey', decKey) // URLSearchParams가 1회 인코딩
    url = `${KMA_BASE}/${endpoint}?${params.toString()}`
  } else if (encKey) {
    url = `${KMA_BASE}/${endpoint}?serviceKey=${encKey}&${params.toString()}` // 이미 인코딩된 키는 그대로
  } else {
    throw new Error('KMA_SERVICE_KEY_DEC 또는 KMA_SERVICE_KEY_ENC가 설정되지 않았습니다.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  let text: string
  try {
    const res = await fetch(url, { signal: controller.signal })
    text = await res.text()
    if (!res.ok) throw new Error(`기상청 응답 오류 (${res.status})`)
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // 인증 실패 등은 XML 에러 봉투로 온다.
    const msg = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1] || text.match(/<errMsg>(.*?)<\/errMsg>/)?.[1]
    throw new Error(`기상청 응답 파싱 실패${msg ? `: ${msg}` : ''}`)
  }
  const header = (parsed as any)?.response?.header
  const code = header?.resultCode
  if (code !== '00' && code !== '0') throw new Error(`기상청 오류: ${header?.resultMsg ?? code ?? 'unknown'}`)
  const items = (parsed as any)?.response?.body?.items?.item
  return Array.isArray(items) ? items : items ? [items] : []
}

// ---- base time (KST) ----

function toKst(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
}
function ymdUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`
}
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function getVilageBase(kst: Date): { baseDate: string; baseTime: string } {
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  let chosen = -1
  for (const h of VILAGE_BASE_HOURS) {
    if (h * 60 + 10 <= minutes) chosen = h
  }
  if (chosen === -1) {
    const prev = new Date(kst.getTime() - 24 * 60 * 60 * 1000)
    return { baseDate: ymdUtc(prev), baseTime: '2300' }
  }
  return { baseDate: ymdUtc(kst), baseTime: `${pad2(chosen)}00` }
}

// 오늘 자정(00:00)부터를 커버하는 발표 시각 — 전일 2300 base가 당일 0000~를 예보한다.
function getBackfillBase(kst: Date): { baseDate: string; baseTime: string } {
  const prev = new Date(kst.getTime() - 24 * 60 * 60 * 1000)
  return { baseDate: ymdUtc(prev), baseTime: '2300' }
}

function getNcstBase(kst: Date): { baseDate: string; baseTime: string } {
  let date = kst
  let hour = kst.getUTCHours()
  if (kst.getUTCMinutes() < 40) {
    hour -= 1
    if (hour < 0) {
      date = new Date(kst.getTime() - 24 * 60 * 60 * 1000)
      hour = 23
    }
  }
  return { baseDate: ymdUtc(date), baseTime: `${pad2(hour)}00` }
}

function fcstToIso(fcstDate: string, fcstTime: string): string {
  const y = Number(fcstDate.slice(0, 4))
  const mo = Number(fcstDate.slice(4, 6))
  const d = Number(fcstDate.slice(6, 8))
  const hh = Number(fcstTime.slice(0, 2))
  const mm = Number(fcstTime.slice(2, 4))
  // KST 벽시계 -> UTC instant
  return new Date(Date.UTC(y, mo - 1, d, hh, mm) - 9 * 60 * 60 * 1000).toISOString()
}

// ---- 디코딩 ----

type HourlyPoint = {
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  humidity: number | null
  windMps: number | null
  precipitationChance: number | null
  precipitationAmountMm: number | null
  precipitationIntensityMmPerHour: number | null
  precipitationType: number | null
  condition: string
  symbolName: string
  isDaylight: boolean
}

function buildHourly(items: KmaItem[]): HourlyPoint[] {
  const byTime = new Map<string, Record<string, string>>()
  for (const it of items) {
    if (!it.fcstDate || !it.fcstTime) continue
    const k = `${it.fcstDate}${it.fcstTime}`
    const slot = byTime.get(k) ?? {}
    slot[it.category] = it.fcstValue ?? ''
    byTime.set(k, slot)
  }
  const points: HourlyPoint[] = []
  for (const [k, v] of [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const fcstDate = k.slice(0, 8)
    const fcstTime = k.slice(8, 12)
    const time = fcstToIso(fcstDate, fcstTime)
    const temp = numOrNull(v.TMP ?? v.T1H)
    const humidity = pctFrac(v.REH)
    const wind = numOrNull(v.WSD)
    const pty = numOrNull(v.PTY)
    const sky = numOrNull(v.SKY)
    const pop = pctFrac(v.POP)
    const pcp = parsePrecip(v.PCP ?? v.RN1)
    const hour = Number(fcstTime.slice(0, 2))
    const isDay = hour >= 6 && hour < 19
    points.push({
      time,
      temperatureC: temp,
      apparentTemperatureC: feltTemperatureC(temp, v.REH, wind),
      humidity,
      windMps: wind,
      precipitationChance: pop,
      precipitationAmountMm: pcp,
      precipitationIntensityMmPerHour: pcp,
      precipitationType: pty,
      condition: conditionText(sky, pty),
      symbolName: symbolName(sky, pty, isDay),
      isDaylight: isDay
    })
  }
  return points
}

type DailyPoint = {
  date: string
  minTemperatureC: number | null
  maxTemperatureC: number | null
  precipitationChance: number | null
  precipitationAmountMm: number | null
  symbolName: string
  condition: string
}

function buildDaily(items: KmaItem[]): DailyPoint[] {
  const byDate = new Map<string, { tmn: number | null; tmx: number | null; popMax: number; pcpSum: number; sky: number | null; pty: number | null }>()
  for (const it of items) {
    if (!it.fcstDate) continue
    const slot = byDate.get(it.fcstDate) ?? { tmn: null, tmx: null, popMax: 0, pcpSum: 0, sky: null, pty: null }
    const val = it.fcstValue ?? ''
    if (it.category === 'TMN') slot.tmn = numOrNull(val)
    else if (it.category === 'TMX') slot.tmx = numOrNull(val)
    else if (it.category === 'POP') slot.popMax = Math.max(slot.popMax, numOrNull(val) ?? 0)
    else if (it.category === 'PCP') slot.pcpSum += parsePrecip(val) ?? 0
    else if (it.category === 'SKY' && slot.sky === null && it.fcstTime === '1200') slot.sky = numOrNull(val)
    else if (it.category === 'PTY' && it.fcstTime === '1200') slot.pty = numOrNull(val)
    byDate.set(it.fcstDate, slot)
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, s]) => ({
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    minTemperatureC: s.tmn,
    maxTemperatureC: s.tmx,
    precipitationChance: s.popMax > 1 ? s.popMax / 100 : s.popMax,
    precipitationAmountMm: Math.round(s.pcpSum * 10) / 10,
    symbolName: symbolName(s.sky, s.pty, true),
    condition: conditionText(s.sky, s.pty)
  }))
}

function nearestHourly(hourly: HourlyPoint[], target: Date): HourlyPoint {
  let best = hourly[0]
  let bestDiff = Number.POSITIVE_INFINITY
  for (const p of hourly) {
    const diff = Math.abs(Date.parse(p.time) - target.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return best
}

function mergeObserved(point: HourlyPoint, ncstItems: KmaItem[]): HourlyPoint {
  const v: Record<string, string> = {}
  for (const it of ncstItems) v[it.category] = it.obsrValue ?? ''
  const temp = numOrNull(v.T1H) ?? point.temperatureC
  const wind = numOrNull(v.WSD) ?? point.windMps
  const rehRaw = v.REH || ''
  const pty = numOrNull(v.PTY)
  const rn1 = parsePrecip(v.RN1)
  return {
    ...point,
    temperatureC: temp,
    apparentTemperatureC: feltTemperatureC(temp, rehRaw || null, wind),
    humidity: pctFrac(v.REH) ?? point.humidity,
    windMps: wind,
    precipitationAmountMm: rn1 ?? point.precipitationAmountMm,
    precipitationIntensityMmPerHour: rn1 ?? point.precipitationIntensityMmPerHour,
    precipitationType: pty ?? point.precipitationType,
    condition: pty && pty > 0 ? conditionText(null, pty) : point.condition,
    symbolName: pty && pty > 0 ? symbolName(null, pty, point.isDaylight) : point.symbolName
  }
}

// ---- 코드값 매핑 ----

function conditionText(sky: number | null, pty: number | null): string {
  if (pty && pty > 0) {
    if (pty === 1) return '비'
    if (pty === 2) return '비/눈'
    if (pty === 3) return '눈'
    if (pty === 4) return '소나기'
    if (pty === 5) return '빗방울'
    if (pty === 6) return '진눈깨비'
    if (pty === 7) return '눈날림'
  }
  if (sky === 1) return '맑음'
  if (sky === 3) return '구름많음'
  if (sky === 4) return '흐림'
  return '정보 없음'
}

function symbolName(sky: number | null, pty: number | null, isDay: boolean): string {
  if (pty && pty > 0) {
    if (pty === 3 || pty === 7) return 'cloud.snow'
    if (pty === 2 || pty === 6) return 'cloud.snow'
    return 'cloud.rain'
  }
  if (sky === 1) return isDay ? 'sun.max' : 'moon'
  if (sky === 3) return isDay ? 'cloud.sun' : 'cloud.moon'
  if (sky === 4) return 'cloud'
  return 'cloud'
}

function numOrNull(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function pctFrac(value: string | undefined | null): number | null {
  const n = numOrNull(value)
  if (n === null) return null
  return n > 1 ? Math.min(Math.max(n / 100, 0), 1) : Math.min(Math.max(n, 0), 1)
}

// 강수량 범주 문자열 -> mm 수치. "강수없음"/"-"/null/0 -> 0.
function parsePrecip(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  if (!s || s === '강수없음' || s === '적설없음' || s === '-' || s === '0') return 0
  if (s.includes('미만')) return 0.5
  if (s.includes('이상')) {
    const m = s.match(/([\d.]+)/)
    return m ? Number(m[1]) : 50
  }
  const range = s.match(/([\d.]+)\s*~\s*([\d.]+)/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const m = s.match(/([\d.]+)/)
  return m ? Number(m[1]) : 0
}

// 계절분기 체감온도(자체 산출). 웹 mirror: src/shared/lib/runningWeather.ts feltTemperatureC.
// 여름(>=20℃): 기상청 여름철 체감온도(Stull 습구 기반). 겨울(<=10℃ & 풍속>1.3m/s): 기상청 풍속냉각. 중간: 기온.
function feltTemperatureC(tempC: number | null, humidityRaw: string | number | null, windMps: number | null): number | null {
  if (tempC === null) return null
  const rh = typeof humidityRaw === 'number' ? humidityRaw : numOrNull(humidityRaw as string | null)
  if (tempC >= 20 && rh !== null) {
    const tw =
      tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
      Math.atan(tempC + rh) -
      Math.atan(rh - 1.67633) +
      0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
      4.686035
    const at = -0.2442 + 0.55399 * tw + 0.45535 * tempC - 0.0022 * tw * tw + 0.00278 * tw * tempC + 3.0
    return Math.round(at * 10) / 10
  }
  if (tempC <= 10 && windMps !== null && windMps > 1.3) {
    const v = Math.pow(windMps * 3.6, 0.16)
    const wc = 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v
    return Math.round(wc * 10) / 10
  }
  return tempC
}

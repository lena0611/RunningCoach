// 비용/외부 호출이 있는 Edge Function 공용 인증·세션·rate limit 경계.
// coach-run/index.ts의 인라인 구현과 동일한 계약이며, 신규 함수(weather-run 등)는 이 모듈을 사용한다.
// coach-run은 안정성 위해 당분간 자체 인라인 구현을 유지한다(추후 수렴 가능).

// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pacelab-app-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

export function requiredEnv(key: string) {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`${key} is not configured`)
  return value
}

export function positiveIntegerEnv(key: string, fallback: number) {
  const raw = Deno.env.get(key)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export async function requireAppSession(
  admin: SupabaseAdminClient,
  req: Request,
  userId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const rawToken = req.headers.get('x-pacelab-app-session') ?? ''
  if (!rawToken) return { ok: false, status: 403, error: 'Missing app session' }

  const parsed = await verifyAppSessionToken(rawToken)
  if (!parsed.ok) return parsed
  if (parsed.userId !== userId) return { ok: false, status: 403, error: 'App session user mismatch' }
  if (Date.parse(parsed.expiresAt) <= Date.now()) return { ok: false, status: 403, error: 'App session expired' }

  const tokenHash = await sha256Hex(rawToken)
  const { data, error } = await admin
    .from('app_sessions')
    .select('id, expires_at, revoked_at')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!data || data.revoked_at) return { ok: false, status: 403, error: 'App session is not active' }
  if (Date.parse(data.expires_at) <= Date.now()) return { ok: false, status: 403, error: 'App session expired' }
  return { ok: true }
}

async function verifyAppSessionToken(
  token: string
): Promise<{ ok: true; userId: string; expiresAt: string } | { ok: false; status: number; error: string }> {
  const parts = token.split('~')
  if (parts.length !== 6 || parts[0] !== 'v1') return { ok: false, status: 403, error: 'Invalid app session format' }
  const payload = parts.slice(0, 5).join('~')
  const expected = await hmacSha256Base64Url(requiredEnv('APP_SESSION_HMAC_SECRET'), payload)
  if (!timingSafeEqual(expected, parts[5])) return { ok: false, status: 403, error: 'Invalid app session signature' }
  return { ok: true, userId: parts[1], expiresAt: parts[2] }
}

export async function consumeRateLimit(
  admin: SupabaseAdminClient,
  userId: string,
  functionName: string,
  limit: number
): Promise<{ ok: true } | { ok: false; error: string; retryAfterSec: number }> {
  const windowStart = new Date()
  windowStart.setMinutes(0, 0, 0)
  const windowStartIso = windowStart.toISOString()
  const nextWindow = new Date(windowStart.getTime() + 60 * 60 * 1000)
  const retryAfterSec = Math.max(1, Math.ceil((nextWindow.getTime() - Date.now()) / 1000))

  const { data, error } = await admin.rpc('consume_edge_function_rate_limit', {
    p_user_id: userId,
    p_function_name: functionName,
    p_window_start: windowStartIso,
    p_limit: limit
  })
  if (error) throw error

  const currentCount = typeof data === 'number' ? data : Number(data)
  if (!Number.isFinite(currentCount)) throw new Error('Invalid rate limit counter')
  if (currentCount > limit) {
    return { ok: false, error: `${functionName} rate limit exceeded`, retryAfterSec }
  }
  return { ok: true }
}

async function hmacSha256Base64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64Url(new Uint8Array(signature))
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function timingSafeEqual(a: string, b: string) {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

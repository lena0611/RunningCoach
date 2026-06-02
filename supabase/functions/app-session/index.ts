import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SupabaseAdminClient = any

type AppSessionBody = {
  deviceToken?: unknown
  appAttest?: unknown
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const appSessionTtlMs = 30 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const appSessionSecret = requiredEnv('APP_SESSION_HMAC_SECRET')
    const admin = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization') ?? ''
    const authToken = authHeader.replace(/^Bearer\s+/i, '')
    if (!authToken) return json({ error: 'Missing bearer token' }, 401)

    const { data: userData, error: userError } = await admin.auth.getUser(authToken)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

    const allowed = isUserAllowed(userData.user.email)
    if (!allowed) return json({ error: 'User is not approved for app access' }, 403)

    const body = await req.json().catch(() => ({})) as AppSessionBody
    const deviceToken = typeof body.deviceToken === 'string' ? body.deviceToken : ''
    const verification = await verifyAppInstance(deviceToken, body.appAttest)
    if (!verification.ok) return json({ error: verification.error }, verification.status)

    const now = Date.now()
    const expiresAt = new Date(now + appSessionTtlMs).toISOString()
    const nonce = crypto.randomUUID()
    const tokenPayload = [
      'v1',
      userData.user.id,
      expiresAt,
      nonce,
      verification.method
    ].join('.')
    const signature = await hmacSha256Base64Url(appSessionSecret, tokenPayload)
    const token = `${tokenPayload}.${signature}`
    const tokenHash = await sha256Hex(token)
    const deviceTokenHash = deviceToken ? await sha256Hex(deviceToken) : null

    const { error: insertError } = await admin.from('app_sessions').insert({
      user_id: userData.user.id,
      token_hash: tokenHash,
      device_token_hash: deviceTokenHash,
      verification_method: verification.method,
      expires_at: expiresAt
    })
    if (insertError) throw insertError

    return json({
      token,
      expiresAt,
      verificationMethod: verification.method
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function verifyAppInstance(deviceToken: string, appAttest: unknown): Promise<{ ok: true, method: string } | { ok: false, status: number, error: string }> {
  const mode = Deno.env.get('APP_SECURITY_MODE') || 'devicecheck'
  if (mode === 'development') {
    const expected = Deno.env.get('APP_SECURITY_DEVELOPMENT_TOKEN') || ''
    if (!expected || deviceToken !== expected) {
      return { ok: false, status: 403, error: 'Invalid development app token' }
    }
    return { ok: true, method: 'development-token' }
  }

  if (appAttest) {
    return { ok: false, status: 501, error: 'App Attest verification is not enabled in this Edge Function yet; use DeviceCheck mode for MVP.' }
  }

  if (!deviceToken) return { ok: false, status: 403, error: 'Missing DeviceCheck token' }
  const result = await verifyDeviceCheckToken(deviceToken)
  if (!result.ok) return result
  return { ok: true, method: 'devicecheck' }
}

function isUserAllowed(email: unknown) {
  const raw = Deno.env.get('PACELAB_ALLOWED_EMAILS') || ''
  const allowedEmails = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (!allowedEmails.length) return false
  return typeof email === 'string' && allowedEmails.includes(email.toLowerCase())
}

async function verifyDeviceCheckToken(deviceToken: string): Promise<{ ok: true } | { ok: false, status: number, error: string }> {
  const teamId = requiredEnv('APPLE_TEAM_ID')
  const keyId = requiredEnv('APPLE_DEVICECHECK_KEY_ID')
  const privateKey = requiredEnv('APPLE_DEVICECHECK_PRIVATE_KEY')
  const environment = Deno.env.get('APPLE_DEVICECHECK_ENVIRONMENT') || 'production'
  const authToken = await createAppleJwt(teamId, keyId, privateKey)
  const transactionId = crypto.randomUUID()
  const endpoint = environment === 'development'
    ? 'https://api.development.devicecheck.apple.com/v1/query_two_bits'
    : 'https://api.devicecheck.apple.com/v1/query_two_bits'

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_token: deviceToken,
      transaction_id: transactionId,
      timestamp: Date.now()
    })
  })

  if (response.ok) return { ok: true }
  const detail = await response.text().catch(() => '')
  if (response.status === 400) return { ok: false, status: 403, error: 'DeviceCheck token was rejected by Apple' }
  if (response.status === 401) return { ok: false, status: 500, error: 'DeviceCheck server credentials are invalid' }
  return { ok: false, status: 502, error: `DeviceCheck verification failed: ${response.status}${detail ? ` ${detail}` : ''}` }
}

async function createAppleJwt(teamId: string, keyId: string, privateKeyPem: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', kid: keyId }
  const payload = { iss: teamId, iat: now }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const key = await importEcPrivateKey(privateKeyPem)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}

async function importEcPrivateKey(privateKeyPem: string) {
  const normalized = privateKeyPem.replace(/\\n/g, '\n')
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
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
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function base64UrlJson(value: unknown) {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)))
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function requiredEnv(key: string) {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`${key} is not configured`)
  return value
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

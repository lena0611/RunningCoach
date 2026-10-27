import { describe, expect, it } from 'vitest'
import { guardRedirect, type RouteGuardState } from './guard'

const PATHS = ['/', '/auth', '/access', '/coach', '/memory']

/** 가드가 멈출 때까지 리다이렉트를 따라간다. 반복되면 null — 화면이 멈추는 경로다. */
function settle(path: string, state: RouteGuardState): string | null {
  const seen = new Set<string>()
  let current = path
  while (!seen.has(current)) {
    seen.add(current)
    const next = guardRedirect(current, state)
    if (next === undefined) return current
    current = next
  }
  return null
}

function state(overrides: Partial<RouteGuardState>): RouteGuardState {
  return { e2eRouteSmoke: false, canUseApp: true, supabaseConfigured: true, authenticated: true, ...overrides }
}

describe('guardRedirect — 전역 라우트 가드', () => {
  it('어떤 상태·어떤 경로에서도 리다이렉트가 끝난다(무한 반복 = 화면 멈춤)', () => {
    for (const e2eRouteSmoke of [false, true])
      for (const canUseApp of [false, true])
        for (const supabaseConfigured of [false, true])
          for (const authenticated of [false, true])
            for (const path of PATHS) {
              expect(settle(path, { e2eRouteSmoke, canUseApp, supabaseConfigured, authenticated }), `${path} ${JSON.stringify({ e2eRouteSmoke, canUseApp, supabaseConfigured, authenticated })}`).not.toBeNull()
            }
  })

  it('일반 브라우저(앱 밖)는 로그인 여부와 무관하게 안내 페이지에 머문다 — 2026-10-27 로그아웃 멈춤 재현 경로', () => {
    for (const authenticated of [false, true]) {
      for (const path of PATHS) expect(settle(path, state({ canUseApp: false, authenticated }))).toBe('/access')
    }
  })

  it('앱 안·로그아웃이면 로그인 화면, 로그인하면 홈', () => {
    expect(settle('/coach', state({ authenticated: false }))).toBe('/auth')
    expect(settle('/access', state({ authenticated: false }))).toBe('/auth')
    expect(settle('/auth', state({ authenticated: true }))).toBe('/')
    expect(settle('/memory', state({ authenticated: true }))).toBe('/memory')
    expect(settle('/access', state({ authenticated: true }))).toBe('/')
  })

  it('Supabase 설정이 없으면 로그인 화면으로', () => {
    expect(settle('/coach', state({ supabaseConfigured: false, authenticated: false }))).toBe('/auth')
  })

  it('라우트 스모크는 인증·안내 화면을 건너뛴다', () => {
    expect(settle('/auth', state({ e2eRouteSmoke: true, canUseApp: false, authenticated: false }))).toBe('/')
    expect(settle('/coach', state({ e2eRouteSmoke: true, canUseApp: false, authenticated: false }))).toBe('/coach')
  })
})

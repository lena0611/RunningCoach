export type RouteGuardState = {
  /** DEV 전용 라우트 스모크(VITE_E2E_ROUTE_SMOKE) — 인증·안내 화면을 건너뛴다. */
  e2eRouteSmoke: boolean
  /** 앱 기능을 쓸 수 있는 곳인가(아이폰 앱 브리지 또는 localhost). */
  canUseApp: boolean
  supabaseConfigured: boolean
  authenticated: boolean
}

/**
 * 전역 라우트 가드 — 보낼 경로, 그대로 두면 undefined.
 *
 * 앱 밖(일반 브라우저)에선 안내 페이지(/access)만 보여주고 **거기서 끝낸다.** 예전엔 안내 페이지도 아래 로그인
 * 가드까지 내려가서, 로그아웃 상태면 /access → /auth → /access 를 끝없이 오가며 화면이 멈췄다(2026-10-27,
 * 배포 주소를 일반 브라우저로 열면 재현). 아이폰 앱·localhost 는 이 분기에 오지 않는다.
 */
export function guardRedirect(path: string, state: RouteGuardState): string | undefined {
  if (state.e2eRouteSmoke) return path === '/auth' || path === '/access' ? '/' : undefined
  if (!state.canUseApp) return path === '/access' ? undefined : '/access'
  if (path === '/access') return '/'
  if (!state.supabaseConfigured || !state.authenticated) return path === '/auth' ? undefined : '/auth'
  return path === '/auth' ? '/' : undefined
}

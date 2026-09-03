/**
 * 새 배포 자동 반영(#776).
 *
 * GitHub Pages 는 index.html 에 `max-age=600` 을 붙인다 — 배포가 끝나도 앱은 최대 10분간 **옛 화면**을
 * 붙들고 있었다(2026-09-03 하루에 네 번 걸렸다). 헤더는 우리가 못 바꾸므로, 아주 작은 `version.json`
 * 하나만 **캐시 없이** 확인해 다르면 스스로 새로고침한다.
 *
 * 왜 이 방식인가:
 * - 네이티브 재설치가 필요 없다(웹만 바뀐다).
 * - 비용이 사실상 없다 — 파일은 수십 바이트고, 포그라운드로 돌아올 때만 본다.
 * - 서비스워커를 다시 들이지 않는다. 이 앱은 부팅 때 레거시 SW 를 **정리**하는 쪽을 택했고
 *   (WKWebView 에서 멈춰 스플래시가 영원히 남은 사고, #495), 그 결정을 되돌리지 않는다.
 */

/** 빌드 때 vite 가 박는다. 개발 서버에선 정의돼 있어도 서버 파일이 없어 비교가 그냥 건너뛴다. */
declare const __BUILD_ID__: string

const CURRENT_BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : ''
/** 새로고침 폭주 방지 — 한 번 새로고침하면 이 세션에선 다시 하지 않는다. */
let reloaded = false
/** 확인 간격 하한. 포그라운드 전환이 잦아도 요청이 몰리지 않게. */
const MIN_CHECK_INTERVAL_MS = 30_000
let lastCheckedAt = 0

async function fetchServerBuildId(): Promise<string | null> {
  try {
    // base 를 그대로 쓴다 — GitHub Pages 는 /RunningCoach/ 하위다.
    const url = new URL('version.json', document.baseURI)
    url.searchParams.set('t', String(Date.now()))
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { buildId?: unknown }
    return typeof body.buildId === 'string' ? body.buildId : null
  } catch {
    // 오프라인·차단은 조용히 넘긴다 — 새 버전 확인은 부가 기능이고, 실패해도 앱은 그대로 돌아간다.
    return null
  }
}

/** 새 배포가 있으면 true(그리고 새로고침). 없거나 확인 불가면 false. */
export async function reloadIfNewBuild(): Promise<boolean> {
  if (!CURRENT_BUILD_ID || reloaded) return false
  const now = Date.now()
  if (now - lastCheckedAt < MIN_CHECK_INTERVAL_MS) return false
  lastCheckedAt = now

  const serverBuildId = await fetchServerBuildId()
  if (!serverBuildId || serverBuildId === CURRENT_BUILD_ID) return false

  reloaded = true
  // 캐시를 우회해 다시 받는다. location.reload() 만으로는 캐시된 index.html 이 또 올 수 있다.
  const url = new URL(window.location.href)
  url.searchParams.set('v', serverBuildId)
  window.location.replace(url.toString())
  return true
}

/** 포그라운드로 돌아올 때마다 확인한다. 앱을 다시 여는 순간이 곧 "최신을 기대하는" 순간이다. */
export function watchForNewBuild(): () => void {
  const check = () => {
    if (document.visibilityState === 'visible') void reloadIfNewBuild()
  }
  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.addEventListener('pageshow', check)
  void reloadIfNewBuild()
  return () => {
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('pageshow', check)
  }
}

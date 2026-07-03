/**
 * 시스템/네트워크 원문 에러를 사용자 문구로 바꾼다 (예: iOS WKWebView 의 "The request timed out.").
 * 앱이 의도적으로 던진 한국어 메시지는 그대로 통과시키고(사용자 문구), 그 외(영문 시스템 원문·기술 문구)는
 * fallback 을 쓴다. 원문은 콘솔로만 남겨 디버깅을 잃지 않는다.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err != null) console.warn('[friendly-error]', err)
  const message = err instanceof Error ? err.message : ''
  return /[가-힣]/.test(message) ? message : fallback
}

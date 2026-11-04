/**
 * 인트로(네이티브 스플래시) 걷기 시점 조율(#898).
 *
 * 예전: 네이티브가 웹뷰 로드 끝(+최소 1.5초)에 스스로 인트로를 걷었다.
 * 지금: 웹이 부팅 첫 줄에서 `hold` 를 보내 "내가 닫으라고 할게"를 알리고, 오늘 브리핑 팝업이 그려지면
 * (또는 띄울 게 없다고 판단하면) `close` 를 보낸다. 인트로가 걷힐 때 팝업이 이미 그려져 있게 하려는 것이다.
 *
 * 버전 어긋남(웹은 자동배포, 앱은 수동 설치):
 * - 새 웹 + 구버전 앱: 능력 목록에 'closeIntro' 가 없으면 아무것도 보내지 않는다 → 예전처럼 자동으로 닫힌다.
 * - 새 앱 + 구버전 웹: 웹이 `hold` 를 안 보내니 네이티브는 예전처럼 자동으로 닫는다.
 * - 웹이 `hold` 뒤 멈추면: 웹 쪽 마감(HOLD_DEADLINE_MS)에 스스로 `close`, 네이티브도 자체 안전 시간 뒤 닫는다.
 */
const CAPABILITY = 'closeIntro'
/** 이 시간이 지나면 브리핑 준비가 덜 됐어도 인트로를 걷는다(팝업은 '준비 중'으로 먼저 뜬다). */
export const HOLD_DEADLINE_MS = 6000

let held = false
let closed = false

function handler() {
  if (!window.RunContextNativeCapabilities?.includes(CAPABILITY)) return null
  return window.webkit?.messageHandlers?.runContextIntro ?? null
}

/** 부팅 첫 줄에서 부른다. 네이티브가 지원할 때만 인트로를 붙잡는다. */
export function holdNativeIntro() {
  const h = handler()
  if (!h || held) return
  held = true
  h.postMessage({ type: 'hold' })
  window.setTimeout(closeNativeIntro, HOLD_DEADLINE_MS)
}

/** 인트로를 걷는다. 붙잡지 않았으면(구버전 앱·브라우저) 아무것도 안 한다. 여러 번 불러도 한 번만 보낸다. */
export function closeNativeIntro() {
  if (!held || closed) return
  closed = true
  handler()?.postMessage({ type: 'close' })
}

/** 지금 인트로가 화면을 덮고 있나(붙잡았고 아직 안 걷음). */
export function isNativeIntroHeld(): boolean {
  return held && !closed
}

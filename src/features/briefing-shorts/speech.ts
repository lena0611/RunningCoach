/**
 * 브리핑 쇼츠 목소리(#898, 사용자 결정: 기기 TTS).
 *
 * 말 걸기 탭이 없어서(2026-11-05 연출: 러너가 다가오면 저절로 읽는다) 사용자 동작 없이 소리를 내야 한다.
 * - 앱(능력 'briefingSpeech'): 네이티브 AVSpeechSynthesizer 가 읽는다(`runContextSpeech` 브리지). 탭 없이도 나고,
 *   무음 스위치를 따른다(저절로 뜨는 팝업이라 무음 모드면 자막만).
 * - 그 밖(구버전 앱·브라우저): 웹 음성(`speechSynthesis`)을 시도한다. iOS·크롬은 사용자 탭 전엔 막을 수 있다.
 * 어느 쪽이든 끝 이벤트가 안 오면 글자 수 기준 안전 시간으로 끝을 보장한다 — 자막은 계속 넘어간다.
 */
const CAPABILITY = 'briefingSpeech'

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

function nativeSpeech() {
  if (typeof window === 'undefined' || !window.RunContextNativeCapabilities?.includes(CAPABILITY)) return null
  return window.webkit?.messageHandlers?.runContextSpeech ?? null
}

/** 글자 수로 잡는 한 문장 길이(초) — PoC 의 자막 전용 길이와 같다. */
export function estimateSpeechSec(text: string): number {
  return 0.5 + text.length * 0.11
}

function koreanVoice(): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? []
  return voices.find((v) => v.lang === 'ko-KR') ?? voices.find((v) => v.lang.startsWith('ko')) ?? null
}

const pending = new Map<string, { onStart?: () => void; finish: () => void }>()
let nextId = 0

function receiveEvent({ id, event }: { id: string; event: 'start' | 'end' }) {
  const line = pending.get(id)
  if (!line) return
  if (event === 'start') line.onStart?.()
  else line.finish()
}

/** 한 문장을 읽고 끝나면 resolve. 실패해도 reject 하지 않는다(자막은 계속 넘어가야 한다). */
export function speak(text: string, onStart?: () => void): Promise<void> {
  const native = nativeSpeech()
  // 안전 시간: 네이티브는 시작·끝을 꼭 알려 주니 넉넉히(말이 끝나기 전에 다음 자막이 앞서가지 않게)
  const fallbackMs = (native ? estimateSpeechSec(text) * 2 + 2 : estimateSpeechSec(text) + 1.5) * 1000
  const s = native ? null : synth()
  if (!native && !s) {
    onStart?.()
    return new Promise((resolve) => window.setTimeout(resolve, estimateSpeechSec(text) * 1000))
  }
  return new Promise((resolve) => {
    let done = false
    const id = `b${++nextId}`
    const finish = () => {
      if (done) return
      done = true
      pending.delete(id)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, fallbackMs)
    if (native) {
      window.RunContextSpeech = { receiveEvent }
      pending.set(id, { onStart, finish })
      native.postMessage({ type: 'speak', id, text })
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    const voice = koreanVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 1.05
    utterance.onstart = () => onStart?.()
    utterance.onend = finish
    utterance.onerror = finish
    s?.speak(utterance)
  })
}

export function stopSpeech() {
  const native = nativeSpeech()
  if (native) {
    native.postMessage({ type: 'stop' })
    for (const line of [...pending.values()]) line.finish()
    return
  }
  synth()?.cancel()
}

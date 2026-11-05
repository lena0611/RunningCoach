/**
 * 브리핑 쇼츠 목소리(#898, 사용자 결정: 기기 TTS).
 *
 * 말 걸기 탭이 없어서(2026-11-05 연출: 러너가 다가오면 저절로 읽는다) 사용자 동작 없이 소리를 내야 한다.
 * - 앱(능력 'briefingSpeech'): 네이티브 AVSpeechSynthesizer 가 읽는다(`runContextSpeech` 브리지). 탭 없이도 나고,
 *   저절로 켤 땐 무음 스위치를 따른다(.ambient). 사용자가 스피커를 직접 눌러 켰으면(loud) 무음 모드여도 들린다.
 * - 그 밖(구버전 앱·브라우저): 웹 음성(`speechSynthesis`)을 시도한다. iOS·크롬은 사용자 탭 전엔 막을 수 있다.
 * - 소리 끔(muted, 기본 — 쇼츠처럼 자막만): 읽지 않고 글자 수 길이만큼 자막을 띄운다(입은 움직인다).
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

export type SpeakOptions = {
  /** 소리 끔 — 읽지 않고 자막 길이만큼 기다린다 */
  muted?: boolean
  /** 사용자가 스피커를 직접 눌러 켰다 — 앱은 무음 스위치를 넘어 들려준다 */
  loud?: boolean
}

/** 한 문장을 읽고 끝나면 resolve. 실패해도 reject 하지 않는다(자막은 계속 넘어가야 한다). stopSpeech 로 바로 끝낼 수 있다. */
export function speak(text: string, onStart?: () => void, { muted = false, loud = false }: SpeakOptions = {}): Promise<void> {
  const native = muted ? null : nativeSpeech()
  const s = muted || native ? null : synth()
  // 안전 시간: 네이티브는 시작·끝을 꼭 알려 주니 넉넉히(말이 끝나기 전에 다음 자막이 앞서가지 않게). 소리 없으면 자막 길이 그대로
  const sec = estimateSpeechSec(text)
  const fallbackMs = (native ? sec * 2 + 2 : s ? sec + 1.5 : sec) * 1000
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
    pending.set(id, { onStart, finish })
    if (!native && !s) {
      onStart?.()
      return
    }
    if (native) {
      window.RunContextSpeech = { receiveEvent }
      native.postMessage(loud ? { type: 'speak', id, text, loud: true } : { type: 'speak', id, text })
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

/** 읽던 문장을 멈추고, 기다리던 문장(소리 끔 포함)을 모두 끝낸다 */
export function stopSpeech() {
  const native = nativeSpeech()
  if (native) native.postMessage({ type: 'stop' })
  else synth()?.cancel()
  for (const line of [...pending.values()]) line.finish()
}

/**
 * 브라우저 웹 음성은 사용자 탭 안에서 한 번 말해야 이후 발화가 열린다(iOS Safari) — 스피커를 켜는 탭에서 부른다.
 * 앱(네이티브 음성)은 필요 없다.
 */
export function unlockSpeech() {
  const s = synth()
  if (!s || nativeSpeech()) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  s.speak(u)
}

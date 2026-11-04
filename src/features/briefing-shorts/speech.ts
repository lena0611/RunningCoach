/**
 * 기기 TTS(#898, 사용자 결정) — Web Speech API(`speechSynthesis`). iOS WKWebView 도 같은 AVSpeechSynthesizer 를 쓴다.
 *
 * - iOS 는 소리를 **사용자 탭 안에서 한 번 열어야** 이후 발화가 난다. 러너에게 말을 거는 탭에서 `unlockSpeech()` 를 부른다.
 * - 끝 이벤트가 안 오는 경우(Safari 의 긴 발화·음성 미설치)가 있어 글자 수 기준 안전 시간으로 끝을 보장한다.
 * - 음성이 없는 환경이면 같은 시간만큼 기다려 자막만 넘긴다(입은 말하는 흉내).
 */
const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/** 글자 수로 잡는 한 문장 길이(초) — PoC 의 자막 전용 길이와 같다. */
export function estimateSpeechSec(text: string): number {
  return 0.5 + text.length * 0.11
}

function koreanVoice(): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices() ?? []
  return voices.find((v) => v.lang === 'ko-KR') ?? voices.find((v) => v.lang.startsWith('ko')) ?? null
}

export function unlockSpeech() {
  const s = synth()
  if (!s) return
  s.cancel()
  const warmup = new SpeechSynthesisUtterance(' ')
  warmup.volume = 0
  warmup.lang = 'ko-KR'
  s.speak(warmup)
}

/** 한 문장을 읽고 끝나면 resolve. 실패해도 reject 하지 않는다(자막은 계속 넘어가야 한다). */
export function speak(text: string, onStart?: () => void): Promise<void> {
  const s = synth()
  const fallbackMs = (estimateSpeechSec(text) + 1.5) * 1000
  if (!s) {
    onStart?.()
    return new Promise((resolve) => window.setTimeout(resolve, estimateSpeechSec(text) * 1000))
  }
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, fallbackMs)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    const voice = koreanVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 1.05
    utterance.onstart = () => onStart?.()
    utterance.onend = finish
    utterance.onerror = finish
    s.speak(utterance)
  })
}

export function stopSpeech() {
  synth()?.cancel()
}

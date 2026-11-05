import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 브리핑 목소리(#898): 말 걸기 탭이 없어서 앱이면 네이티브가 읽는다. 능력 없는 구버전 앱엔 브리지 요청을 안 보낸다.
describe('speech', () => {
  const postMessage = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    postMessage.mockReset()
    window.webkit = { messageHandlers: { runContextSpeech: { postMessage } } }
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.webkit
    delete window.RunContextNativeCapabilities
    delete window.RunContextSpeech
  })

  it('지원 앱: 네이티브로 보내고, 시작 알림에 입을 움직이고 끝 알림에 다음 문장으로 넘어간다', async () => {
    window.RunContextNativeCapabilities = ['closeIntro', 'briefingSpeech']
    const { speak } = await import('./speech')
    const onStart = vi.fn()
    let done = false
    void speak('오늘은 이지 8km예요.', onStart).then(() => { done = true })
    expect(postMessage).toHaveBeenCalledWith({ type: 'speak', id: expect.any(String), text: '오늘은 이지 8km예요.' })
    const { id } = postMessage.mock.calls[0][0] as { id: string }
    window.RunContextSpeech?.receiveEvent({ id, event: 'start' })
    expect(onStart).toHaveBeenCalledOnce()
    window.RunContextSpeech?.receiveEvent({ id, event: 'end' })
    await vi.runAllTicks()
    await Promise.resolve()
    expect(done).toBe(true)
  })

  it('끝 알림이 안 와도 안전 시간 뒤엔 넘어간다(자막이 멈추지 않는다)', async () => {
    window.RunContextNativeCapabilities = ['briefingSpeech']
    const { speak } = await import('./speech')
    let done = false
    void speak('자, 출발!').then(() => { done = true })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(done).toBe(true)
  })

  it('건너뛰기: 네이티브에 멈춤을 보내고 읽던 문장을 끝낸다', async () => {
    window.RunContextNativeCapabilities = ['briefingSpeech']
    const { speak, stopSpeech } = await import('./speech')
    let done = false
    void speak('웜업 — 처음 5~10분은 더 느리게').then(() => { done = true })
    stopSpeech()
    await Promise.resolve()
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'stop' })
    expect(done).toBe(true)
  })

  it('구버전 앱(능력 없음): 브리지로 보내지 않는다', async () => {
    window.RunContextNativeCapabilities = ['crossTraining', 'closeIntro']
    const { speak } = await import('./speech')
    void speak('오늘은 이지예요.')
    expect(postMessage).not.toHaveBeenCalled()
  })
})

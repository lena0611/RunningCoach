import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 버전 어긋남 양방향(#898): 능력 없는 구버전 앱엔 아무것도 안 보내고, 붙잡았으면 반드시 한 번 걷는다.
describe('introBridge', () => {
  const postMessage = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    postMessage.mockReset()
    window.webkit = { messageHandlers: { runContextIntro: { postMessage } } }
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.webkit
    delete window.RunContextNativeCapabilities
  })

  it('구버전 앱(능력 목록 없음): hold·close 모두 보내지 않는다 → 네이티브가 예전처럼 스스로 닫는다', async () => {
    const bridge = await import('./introBridge')
    bridge.holdNativeIntro()
    bridge.closeNativeIntro()
    vi.advanceTimersByTime(bridge.HOLD_DEADLINE_MS + 1)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('능력 목록에 closeIntro 가 없으면(다른 능력만) 보내지 않는다', async () => {
    window.RunContextNativeCapabilities = ['crossTraining']
    const bridge = await import('./introBridge')
    bridge.holdNativeIntro()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('지원 앱: hold 후 close 는 한 번만', async () => {
    window.RunContextNativeCapabilities = ['crossTraining', 'closeIntro']
    const bridge = await import('./introBridge')
    bridge.holdNativeIntro()
    expect(bridge.isNativeIntroHeld()).toBe(true)
    bridge.closeNativeIntro()
    bridge.closeNativeIntro()
    vi.advanceTimersByTime(bridge.HOLD_DEADLINE_MS + 1)
    expect(postMessage.mock.calls).toEqual([[{ type: 'hold' }], [{ type: 'close' }]])
    expect(bridge.isNativeIntroHeld()).toBe(false)
  })

  it('지원 앱인데 웹이 close 를 못 보내면 마감 시간에 스스로 걷는다', async () => {
    window.RunContextNativeCapabilities = ['closeIntro']
    const bridge = await import('./introBridge')
    bridge.holdNativeIntro()
    vi.advanceTimersByTime(bridge.HOLD_DEADLINE_MS - 1)
    expect(postMessage).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'close' })
  })
})

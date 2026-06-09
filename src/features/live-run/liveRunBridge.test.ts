import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isLiveRunBridgeAvailable,
  pauseLiveRun,
  registerLiveRunBridge,
  requestRecoverableLiveRun,
  resumeLiveRun,
  startLiveRun,
  stopLiveRun,
  unregisterLiveRunBridge,
  type AnnounceConfig
} from './liveRunBridge'

function installBridge(postMessage: (message: unknown) => void = vi.fn()) {
  window.webkit = { messageHandlers: { runContextLiveRun: { postMessage } } }
  return postMessage
}

const config: AnnounceConfig = { periodic: { kind: 'distance', stepM: 1000 }, reversalAlert: true }

afterEach(() => {
  delete window.webkit
  delete window.RunContextLiveRun
})

describe('live run bridge presence', () => {
  it('reports false when the native bridge is absent', () => {
    expect(isLiveRunBridgeAvailable()).toBe(false)
  })

  it('reports true when the native bridge is present', () => {
    installBridge()
    expect(isLiveRunBridgeAvailable()).toBe(true)
  })
})

describe('startLiveRun', () => {
  it('posts start with a ghost curve and normalized nulls', () => {
    const post = vi.fn()
    installBridge(post)
    startLiveRun({
      sessionId: 's1',
      mode: 'solo',
      ghostCurve: [{ distanceM: 0, elapsedSec: 0 }, { distanceM: 1000, elapsedSec: 300 }],
      announceConfig: config
    })
    expect(post).toHaveBeenCalledWith({
      type: 'startLiveRun',
      sessionId: 's1',
      mode: 'solo',
      ghostCurve: [{ distanceM: 0, elapsedSec: 0 }, { distanceM: 1000, elapsedSec: 300 }],
      announceConfig: config,
      tickIntervalMs: null
    })
  })

  it('sends null ghostCurve when target is none', () => {
    const post = vi.fn()
    installBridge(post)
    startLiveRun({ sessionId: 's2', mode: 'solo', announceConfig: config })
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's2', ghostCurve: null }))
  })

  it('throws a Korean error when the bridge is absent', () => {
    expect(() => startLiveRun({ sessionId: 's3', mode: 'solo', announceConfig: config })).toThrow(/iOS/)
  })
})

describe('lifecycle commands', () => {
  it('posts pause/resume/stop/requestRecoverable', () => {
    const post = vi.fn()
    installBridge(post)
    pauseLiveRun()
    resumeLiveRun()
    stopLiveRun()
    requestRecoverableLiveRun()
    expect(post.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual([
      'pauseLiveRun',
      'resumeLiveRun',
      'stopLiveRun',
      'requestRecoverableLiveRun'
    ])
  })

  it('no-ops without a bridge', () => {
    expect(() => {
      pauseLiveRun()
      stopLiveRun()
    }).not.toThrow()
  })
})

describe('registerLiveRunBridge', () => {
  it('normalizes ticks and gaps from native', () => {
    const onTick = vi.fn()
    const onGap = vi.fn()
    registerLiveRunBridge({
      onTick,
      onGap,
      onStateChange: vi.fn(),
      onPermission: vi.fn(),
      onRecoverable: vi.fn(),
      onError: vi.fn()
    })

    // 비정상 값(NaN pace, 누락 필드)이 안전 기본값으로 정규화된다.
    window.RunContextLiveRun?.receiveTick({
      seq: 5,
      elapsedSec: 12,
      cumulativeDistanceM: 40,
      instantPaceSec: Number.NaN,
      signalState: 'weak',
      source: 'gps'
    })
    expect(onTick).toHaveBeenCalledWith(expect.objectContaining({ seq: 5, instantPaceSec: null, signalState: 'weak' }))

    window.RunContextLiveRun?.receiveGap({ timeGapSec: -8, leadState: 'ahead' })
    expect(onGap).toHaveBeenCalledWith({ timeGapSec: -8, leadState: 'ahead' })
  })

  it('passes null recoverable through', () => {
    const onRecoverable = vi.fn()
    registerLiveRunBridge({
      onTick: vi.fn(),
      onGap: vi.fn(),
      onStateChange: vi.fn(),
      onPermission: vi.fn(),
      onRecoverable,
      onError: vi.fn()
    })
    window.RunContextLiveRun?.receiveRecoverable(null)
    expect(onRecoverable).toHaveBeenCalledWith(null)
    unregisterLiveRunBridge()
    expect(window.RunContextLiveRun).toBeUndefined()
  })
})

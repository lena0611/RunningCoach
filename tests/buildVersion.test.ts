import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #776 — 배포 직후 앱이 옛 화면을 붙들던 문제(GitHub Pages 가 index.html 에 max-age=600 을 붙인다).
 * 이 모듈이 서버 version.json 과 대조해 스스로 새로고침한다. 잘못 동작하면 **무한 새로고침**이라
 * 경계를 테스트로 못박는다.
 */
describe('reloadIfNewBuild (#776)', () => {
  const replace = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    replace.mockClear()
    vi.stubGlobal('__BUILD_ID__', 'build-1')
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.test/app/', replace },
      writable: true
    })
    Object.defineProperty(document, 'baseURI', { value: 'https://example.test/app/', configurable: true })
  })

  async function load(serverBuildId: string | null, ok = true) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok,
      json: async () => (serverBuildId === null ? {} : { buildId: serverBuildId })
    }))
    return await import('@/shared/lib/buildVersion')
  }

  it('서버 버전이 다르면 캐시를 우회해 다시 받는다', async () => {
    const { reloadIfNewBuild } = await load('build-2')
    expect(await reloadIfNewBuild()).toBe(true)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace.mock.calls[0][0]).toContain('v=build-2')
  })

  it('같은 버전이면 아무것도 하지 않는다', async () => {
    const { reloadIfNewBuild } = await load('build-1')
    expect(await reloadIfNewBuild()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('한 번 새로고침하면 다시 하지 않는다 — 무한 루프 차단', async () => {
    const { reloadIfNewBuild } = await load('build-2')
    expect(await reloadIfNewBuild()).toBe(true)
    expect(await reloadIfNewBuild()).toBe(false)
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('응답이 실패하거나 형식이 아니면 조용히 넘긴다 — 부가 기능이 앱을 막으면 안 된다', async () => {
    const bad = await load(null)
    expect(await bad.reloadIfNewBuild()).toBe(false)
    vi.resetModules()
    const failed = await load('build-2', false)
    expect(await failed.reloadIfNewBuild()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})

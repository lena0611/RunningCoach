import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isReloadingForNewBuild } from '../src/shared/lib/buildVersion'

describe('옛 번들 스케줄 쓰기 가드 (#693)', () => {
  it('부팅 확인 전·개발 서버에선 새로고침 중이 아니다 — 확인 못 해도 앱을 멈추지 않는다', async () => {
    await expect(isReloadingForNewBuild()).resolves.toBe(false)
  })

  it('스케줄 정산은 부팅 확인을 기다리고, 저장 버전이 더 높으면(옛 번들) 쓰지 않는다 — 소스 가드', () => {
    const src = readFileSync(resolve(__dirname, '../src/pages/dashboard/useTrainingWeek.ts'), 'utf-8')
    const body = src.slice(src.indexOf('async function doEnsureSchedule()'))
    const firstWrite = body.indexOf('scheduleStore.')
    const reloadGuard = body.indexOf('await isReloadingForNewBuild()')
    const versionGuard = body.indexOf('> SCHEDULE_ANCHOR_LOGIC_VERSION) return')
    expect(reloadGuard).toBeGreaterThan(-1)
    expect(versionGuard).toBeGreaterThan(-1)
    // 둘 다 첫 스케줄 쓰기보다 앞에 있어야 한다
    expect(reloadGuard).toBeLessThan(firstWrite)
    expect(versionGuard).toBeLessThan(firstWrite)
  })
})

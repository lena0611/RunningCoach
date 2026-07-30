import { expect, test } from '@playwright/test'

/**
 * #639 코치 제안 → 기존 액션 화면 진입 브리지 렌더 E2E.
 *
 * **인증 불필요 — 라우트 스모크 config 로 돈다**(Supabase OFF·VITE_E2E_ROUTE_SMOKE):
 *   npx playwright test --config playwright.config.ts e2e/coach-proposal-bridge.spec.ts
 *
 * 무엇을 검증하나: 코치 카드가 눌렸을 때 세우는 **요청 플래그**가 수용부에서 실제로 화면을 바꾸는지.
 * - declare_rest → 대시보드 휴식 선언 시트가 열리고, 사용자가 발화에서 명시한 기간이 프리셋으로 들어간다
 * - 세션 액션 → 코치 탭 데이-스트립이 그 날짜로 이동한다
 * - 요청은 수용 후 소비(clear)된다 — 안 그러면 다른 화면으로 갈 때마다 되살아난다
 *
 * 무엇을 검증하지 않나: 제안 카드 자체의 렌더. 그건 coach-run Edge 배포 + LLM 응답이 선행이라
 * 라이브 QA 몫이다(브리지 계약은 그와 독립이므로 여기서 분리 검증한다).
 */
type BridgeHook = {
  coachProposalRestBridge: (untilDate: string | null) => { ok: boolean }
  coachProposalSessionBridge: (date: string) => { ok: boolean }
  coachProposalBridgeState: () => { restRequest: string | null; restUntil: string | null; focusDate: string | null }
}

async function bootDashboard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const onboardingSkip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
  if (await onboardingSkip.isVisible().catch(() => false)) await onboardingSkip.click()
  await page.waitForFunction(() => Boolean((window as unknown as { __pacelabE2E?: unknown }).__pacelabE2E), null, {
    timeout: 15_000
  })
}

/** 오늘 기준 +N일의 YYYY-MM-DD (브라우저 로컬 기준과 맞추기 위해 페이지에서 계산). */
async function isoOffset(page: import('@playwright/test').Page, days: number) {
  return page.evaluate((d) => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    t.setDate(t.getDate() + d)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }, days)
}

test.describe('#639 코치 제안 브리지', () => {
  test('declare_rest 제안 → 대시보드 휴식 선언 시트가 명시 기간 프리셋으로 열린다', async ({ page }) => {
    await bootDashboard(page)
    const until = await isoOffset(page, 9) // 사용자가 "열흘쯤"이라고 명시한 경우
    const returnDate = await isoOffset(page, 10) // 복귀 = 마지막 휴식일 + 1

    const seeded = await page.evaluate(
      (u) => (window as unknown as { __pacelabE2E: BridgeHook }).__pacelabE2E.coachProposalRestBridge(u),
      until
    )
    expect(seeded?.ok).toBe(true)

    const sheet = page.getByRole('dialog', { name: '휴식 선언' })
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    // 프리셋이 실제로 시트에 흘러들어갔는지는 "복귀 예정" 안내가 증명한다(untilDate+1).
    await expect(sheet.getByText(`복귀 예정: ${returnDate}`, { exact: false })).toBeVisible()

    // 요청은 소비돼야 한다 — 남아 있으면 다른 탭에 갈 때마다 시트가 되살아난다.
    const state = await page.evaluate(() =>
      (window as unknown as { __pacelabE2E: BridgeHook }).__pacelabE2E.coachProposalBridgeState()
    )
    expect(state.restRequest).toBeNull()
    expect(state.restUntil).toBeNull()
  })

  test('기간 미지정 제안 → 시트는 열리지만 기간을 코치가 정해두지 않는다 (SSOT §80)', async ({ page }) => {
    await bootDashboard(page)
    const seeded = await page.evaluate(() =>
      (window as unknown as { __pacelabE2E: BridgeHook }).__pacelabE2E.coachProposalRestBridge(null)
    )
    expect(seeded?.ok).toBe(true)

    const sheet = page.getByRole('dialog', { name: '휴식 선언' })
    await expect(sheet).toBeVisible({ timeout: 10_000 })
    // 프리셋이 없으면 아직 기간이 안 정해졌으므로 "복귀 예정" 안내가 없다(사용자가 골라야 활성화).
    await expect(sheet.getByText('복귀 예정:', { exact: false })).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: '푹 쉴게요' })).toBeDisabled()
  })

  test('세션 제안 → 코치 탭 데이-스트립이 그 날짜로 이동한다', async ({ page }) => {
    await bootDashboard(page)

    // 데이-스트립은 스케줄이 있을 때만 렌더된다(v-if="hasSchedule") → 기존 walk-run 시드로 in-memory 스케줄을 깐다.
    await page.evaluate(() =>
      (window as unknown as { __pacelabE2E: { seedWalkRunReturn: () => { ok: boolean } } }).__pacelabE2E.seedWalkRunReturn()
    )

    // 오늘이 아닌 날(+3일)을 겨냥해야 "이동했다"가 증명된다.
    const target = await isoOffset(page, 3)
    const seeded = await page.evaluate(
      (d) => (window as unknown as { __pacelabE2E: BridgeHook }).__pacelabE2E.coachProposalSessionBridge(d),
      target
    )
    expect(seeded?.ok).toBe(true)

    await page.getByRole('button', { name: '코치', exact: true }).click()

    // 칩 라벨은 "요일 일자"(예: "일 2") — 일자까지 맞춰야 그 날짜로 갔음이 증명된다.
    const expectedChipLabel = await page.evaluate((d: string) => {
      const labels = ['일', '월', '화', '수', '목', '금', '토']
      const t = new Date(`${d}T00:00:00`)
      return `${labels[t.getDay()]} ${t.getDate()}`
    }, target)

    const selectedChip = page.locator('.week-strip .week-chip[aria-selected="true"]')
    await expect(selectedChip).toHaveCount(1, { timeout: 15_000 })
    await expect(selectedChip.locator('.week-chip-day')).toHaveText(expectedChipLabel)

    // 포커스 요청도 소비돼야 한다.
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(() =>
              (window as unknown as { __pacelabE2E: BridgeHook }).__pacelabE2E.coachProposalBridgeState()
            )
          ).focusDate,
        { timeout: 10_000 }
      )
      .toBeNull()
  })
})

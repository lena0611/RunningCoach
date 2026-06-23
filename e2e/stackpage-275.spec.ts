import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * #275 화면 스택 공통화 — 마이그레이션 렌더 스모크 (테스트 계정 lena0611+qa 저장 세션).
 *
 * 손으로 반복하던 memory-stack-* 마크업을 공유 <StackPage>로 옮긴 화면들이
 * 실제로 열리고(트랜지션·헤더·본문), 닫기/뒤로 버튼이 동작하는지 라이브로 확인한다.
 * 비파괴(읽기/열고닫기만) — 계정 상태를 바꾸지 않는다.
 *
 * 커버:
 *  - close-X 모드(2-col 헤더): Trends 렌즈 상세, Dashboard '다음 훈련', Dashboard 거리 추이
 *  - back-arrow 모드(3-col :has 헤더): Glossary '용어 안내'
 */
const domClick = (loc: Locator) => loc.evaluate((el) => (el as HTMLElement).click())

async function skipOnboarding(page: Page) {
  const skip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
  if (await skip.isVisible().catch(() => false)) await skip.click()
}

/** 열린 StackPage(.memory-stack-layer)를 헤더 제목으로 특정한다. */
function stackByTitle(page: Page, title: string): Locator {
  return page.locator('.memory-stack-layer', {
    has: page.locator('.memory-stack-header h2', { hasText: title })
  })
}

test.describe('#275 StackPage 공통화 마이그레이션', () => {
  test('Trends 렌즈 상세 — close-X StackPage 열림·헤더·닫힘', async ({ page }) => {
    await page.goto('/trends')
    await page.waitForLoadState('networkidle')
    await skipOnboarding(page)

    await page.locator('.trend-lens-row', { hasText: '목표까지' }).first().click()
    const stack = stackByTitle(page, '목표까지')
    await expect(stack).toBeVisible()
    await expect(stack.locator('.memory-stack-content')).toBeVisible()
    // close 모드: 헤더 우측 닫기 아이콘 버튼.
    await stack.locator('.memory-stack-header .stack-icon-button').click()
    await expect(stackByTitle(page, '목표까지')).toHaveCount(0)
  })

  test('Dashboard 다음 훈련 — close-X StackPage', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await skipOnboarding(page)

    await domClick(page.locator('.hero-card-interactive').first())
    const stack = stackByTitle(page, '다음 훈련')
    await expect(stack).toBeVisible()
    await stack.locator('.memory-stack-header .stack-icon-button').click()
    await expect(stackByTitle(page, '다음 훈련')).toHaveCount(0)
  })

  test('Dashboard 거리 추이(이번 달) — close-X StackPage', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await skipOnboarding(page)

    await domClick(page.getByText('이번 달', { exact: true }))
    const stack = stackByTitle(page, '이번 달 거리 추이')
    await expect(stack).toBeVisible()
    await stack.locator('.memory-stack-header .stack-icon-button').click()
    await expect(stackByTitle(page, '이번 달 거리 추이')).toHaveCount(0)
  })

  test('Glossary 용어 안내 — back-arrow(3-col :has 헤더) StackPage', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await skipOnboarding(page)

    await domClick(page.getByRole('button', { name: '계정 메뉴 열기' }))
    await page.getByRole('button', { name: /용어 안내/ }).click()
    const stack = stackByTitle(page, '용어 안내')
    await expect(stack).toBeVisible()
    // back 모드: 헤더의 FIRST 자식이 .stack-icon-button이어야 :has() 3-col 그리드가 적용된다.
    const backBtn = stack.locator('.memory-stack-header > .stack-icon-button')
    await expect(backBtn).toHaveAttribute('aria-label', '계정 정보로 돌아가기')
    await backBtn.click()
    await expect(stackByTitle(page, '용어 안내')).toHaveCount(0)
  })
})

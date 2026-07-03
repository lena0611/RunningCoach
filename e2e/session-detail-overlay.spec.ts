import { expect, test, type Locator, type Page } from '@playwright/test'
import { suppressAccountStatePrompts } from './suppressAccountPrompts'

/**
 * 세션 상세 App 레벨 오버레이 (#275 후속) 렌더 스모크 — 테스트 계정 lena0611+qa 저장 세션.
 *
 * 상세/편집을 대시보드·기록마다 중복하던 StackPage를 App 레벨 SessionDetailOverlay 로 옮긴 뒤,
 * 어느 탭에서 런을 눌러도 같은 오버레이가 그 탭 위에 뜨고, 닫으면 그 탭으로 복귀하는지 확인한다.
 * 비파괴: 편집은 저장하지 않고 뒤로만, 삭제는 다루지 않는다(계정 상태 불변).
 *
 * ⚠ 셀렉터는 컴포넌트 대조로 작성: RunSessionList=.run-session-row(interactive=button),
 * StackPage 헤더 h2=제목, bare는 본문만 영향(헤더 유지). 세션 만료 시 storageState 재생성 후 실행.
 */
const domClick = (loc: Locator) => loc.evaluate((el) => (el as HTMLElement).click())

async function dismissStartupModals(page: Page) {
  const skip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
  if (await skip.isVisible().catch(() => false)) await skip.click()
}

/** 열린 StackPage(.memory-stack-layer)를 헤더 제목으로 특정한다. */
function stackByTitle(page: Page, title: string): Locator {
  return page.locator('.memory-stack-layer', {
    has: page.locator('.memory-stack-header h2', { hasText: title })
  })
}

async function openFirstRunDetail(page: Page) {
  const firstRun = page.locator('.run-session-row').first()
  await expect(firstRun).toBeVisible()
  await domClick(firstRun)
  const detail = stackByTitle(page, '세션 상세')
  await expect(detail).toBeVisible()
  return detail
}

test.describe('세션 상세 App 레벨 오버레이 (#275 후속)', () => {
  test.beforeEach(async ({ page }) => {
    await suppressAccountStatePrompts(page)
  })

  test('기록 탭: 런 클릭 → 세션 상세 오버레이 열림·본문·닫힘', async ({ page }) => {
    await page.goto('/#/runs')
    await page.waitForLoadState('networkidle')
    await dismissStartupModals(page)

    const detail = await openFirstRunDetail(page)
    await expect(detail.locator('.run-detail-content')).toBeVisible()
    // 닫기(우상단 X) → 라우팅 없이 기록 탭으로 복귀(오버레이만 사라짐).
    await detail.locator('.memory-stack-header .stack-icon-button').first().click()
    await expect(stackByTitle(page, '세션 상세')).toHaveCount(0)
    // 닫아도 라우팅 변화 없이 기록 탭 유지(App 레벨 오버레이).
    await expect(page).toHaveURL(/#\/runs/)
  })

  test('편집 스택이 상세 위로 열린다(비파괴: 저장 안 함)', async ({ page }) => {
    await page.goto('/#/runs')
    await page.waitForLoadState('networkidle')
    await dismissStartupModals(page)

    const detail = await openFirstRunDetail(page)
    await detail.getByRole('button', { name: '기록 수정' }).click()
    const edit = stackByTitle(page, '기록 수정')
    await expect(edit).toBeVisible()
    // 뒤로(좌측 chevron) → 편집 사라지고 상세 유지.
    await edit.locator('.memory-stack-header > .stack-icon-button').click()
    await expect(stackByTitle(page, '기록 수정')).toHaveCount(0)
    await expect(stackByTitle(page, '세션 상세')).toBeVisible()
    // 정리: 상세 닫기.
    await stackByTitle(page, '세션 상세').locator('.memory-stack-header .stack-icon-button').first().click()
    await expect(stackByTitle(page, '세션 상세')).toHaveCount(0)
  })

  test('대시보드에서도 같은 App 레벨 오버레이가 열린다(탭 점프 없음)', async ({ page }) => {
    await page.goto('/#/')
    await page.waitForLoadState('networkidle')
    await dismissStartupModals(page)

    const detail = await openFirstRunDetail(page)
    // 대시보드 위에 떴다가 닫으면 대시보드로 복귀(URL 불변).
    await detail.locator('.memory-stack-header .stack-icon-button').first().click()
    await expect(stackByTitle(page, '세션 상세')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/$/)
  })

  test('상세에서 AI 코칭 → 코치 오버레이가 상세 위로(z 순서)', async ({ page }) => {
    await page.goto('/#/runs')
    await page.waitForLoadState('networkidle')
    await dismissStartupModals(page)

    const detail = await openFirstRunDetail(page)
    await detail.getByRole('button', { name: 'AI 코칭' }).click()
    // 코치 오버레이(--z-coach 900)가 상세(--z-session 880) 위로 떠야 한다.
    const coach = stackByTitle(page, 'AI 코칭')
    await expect(coach).toBeVisible()
    await coach.locator('.memory-stack-header .stack-icon-button').first().click()
    // 코치 닫으면 상세는 그대로 남는다.
    await expect(stackByTitle(page, '세션 상세')).toBeVisible()
    await stackByTitle(page, '세션 상세').locator('.memory-stack-header .stack-icon-button').first().click()
  })
})

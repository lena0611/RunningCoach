import { expect, test } from '@playwright/test'

test('mobile app shell boots', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('PACELAB')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Vue 화면이 렌더링되지 않았습니다')
})

test('bottom navigation loads lazy feature routes', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: '기록', exact: true }).click()
  await expect(page).toHaveURL(/#\/runs/)
  await expect(page.getByText('모든 세션 유형')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Vue 화면이 렌더링되지 않았습니다')

  await page.getByRole('button', { name: '기억', exact: true }).click()
  await expect(page).toHaveURL(/#\/memory/)
  await expect(page.getByText('러너 프로필')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Vue 화면이 렌더링되지 않았습니다')

  await page.getByRole('button', { name: '요약', exact: true }).click()
  await expect(page).toHaveURL(/#\/?$/)
})

test('main tabs support interactive horizontal swipe navigation', async ({ page }) => {
  await page.goto('/')

  const viewport = page.locator('.tab-swipe-viewport')
  await expect(viewport).toBeVisible()
  const box = await viewport.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const y = box.y + Math.min(box.height * 0.45, 360)
  await page.mouse.move(box.x + box.width * 0.82, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 6 })
  await page.mouse.move(box.x + box.width * 0.18, y, { steps: 6 })
  await page.mouse.up()

  await expect(page).toHaveURL(/#\/runs/)
  await expect(page.getByText('모든 세션 유형')).toBeVisible()
})

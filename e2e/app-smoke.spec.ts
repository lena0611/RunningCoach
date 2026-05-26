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
  await expect(page.getByText('코칭 메모리')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Vue 화면이 렌더링되지 않았습니다')

  await page.getByRole('button', { name: '요약', exact: true }).click()
  await expect(page).toHaveURL(/#\/?$/)
})

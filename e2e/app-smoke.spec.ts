import { expect, test } from '@playwright/test'

test('mobile app shell boots and protects feature screens without Supabase env', async ({ page }) => {
  await page.goto('/#/runs')

  await expect(page.getByRole('heading', { name: /로그인|RunContext/ })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Vue 화면이 렌더링되지 않았습니다')
})

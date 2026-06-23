import { defineConfig } from '@playwright/test'

/**
 * 인증 E2E(#473 휴식/복귀 등) — 기존 playwright.config.ts(Supabase 끈 라우트 스모크)와 분리.
 * 실행 중인 dev 서버(Supabase 연결)를 재사용하고, 테스트 계정의 저장 세션(storageState)으로 로그인한다.
 *
 * 사용:
 *   1) dev 서버가 떠 있어야 한다(`npm run dev`). baseURL 포트를 실제 포트로 맞춘다(REST_E2E_BASE_URL 로 덮어쓰기 가능).
 *   2) e2e/.auth/qa-storage.json(테스트 계정 세션, gitignore)이 있어야 한다. 만료 시 재로그인 후 재생성.
 *   3) `npx playwright test --config playwright.rest.config.ts`
 */
const BASE_URL = process.env.REST_E2E_BASE_URL || 'http://localhost:5175'

export default defineConfig({
  testDir: './e2e',
  testMatch: /rest-return\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: 0,
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/qa-storage.json',
    viewport: { width: 390, height: 844 },
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [{ name: 'chromium-mobile', use: { browserName: 'chromium' } }]
})

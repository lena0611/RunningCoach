import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // 인증 불필요(Supabase OFF·VITE_E2E_ROUTE_SMOKE)로 도는 스펙만. 인증 필요한 스펙은 playwright.rest.config.ts.
  testMatch: /(app-smoke|walk-run-return|coach-proposal-bridge)\.spec\.ts/,
  timeout: 30_000,
  // 브라우저 1개씩(기본값은 코어 절반 = 5개). 인증 E2E(playwright.rest.config.ts)와 같게 — 맥 멈춤 방지(2026-11-06)
  workers: 1,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_E2E_ROUTE_SMOKE=true npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14']
      }
    }
  ]
})

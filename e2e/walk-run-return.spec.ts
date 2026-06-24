import { expect, test } from '@playwright/test'

/**
 * #501 부상 복귀 walk-run(걷기-뛰기) 처방 렌더 E2E.
 * 그동안 walk-run 은 buildSessionBriefing 직접 호출로만 검증됐고 UI 렌더 경로 커버리지가 없었다(이 스펙이 그 공백을 메운다).
 *
 * **인증 불필요 — 라우트 스모크 config 로 돈다**(Supabase OFF·VITE_E2E_ROUTE_SMOKE):
 *   npx playwright test --config playwright.config.ts e2e/walk-run-return.spec.ts  (또는 npm run e2e)
 * DEV 시드 훅(window.__pacelabE2E.seedWalkRunReturn)이 Supabase 에 쓰지 않고 Pinia 상태만 in-memory 로 오버레이하므로
 * 저장 세션·실계정이 필요 없다(persist 안 함 → 부작용 없음, 정리 불필요).
 *
 * 시나리오: 급성 통증성 부상(active·severity 3) + 오늘 Easy 세션이면, 대시보드 '오늘의 작전' 카드의
 * "어떻게 뛰나"가 연속주가 아니라 걷기-뛰기 5단계 사다리 + 통증 정지/의뢰 안내로 바뀐다(shouldPrescribeWalkRun).
 */
type WalkRunHook = {
  seedWalkRunReturn: () => { ok: boolean }
  walkRunActiveState: () => { todaySessionType: string | null; injuryStatus: string | null; injurySeverity: number | null }
}

test.describe('#501 부상 복귀 walk-run 처방', () => {
  test('급성 통증성 부상 + 오늘 Easy → 작전 카드가 걷기-뛰기 사다리로 렌더', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 신규 계정 온보딩 인터뷰가 뜨면 건너뛴다(이미 건너뛴 계정이면 없음).
    const onboardingSkip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
    if (await onboardingSkip.isVisible().catch(() => false)) await onboardingSkip.click()

    // 급성 부상 + 오늘 Easy 를 in-memory 로 오버레이(persist 안 함 → 실계정 무손상, reload 불필요).
    const seeded = await page.evaluate(() => (window as unknown as { __pacelabE2E: WalkRunHook }).__pacelabE2E.seedWalkRunReturn())
    expect(seeded?.ok).toBe(true)

    // 렌더 전제조건 확인: 오늘 활성 세션 = Easy, 부상 = active·severity≥2(walk-run 게이트).
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(() => (window as unknown as { __pacelabE2E: WalkRunHook }).__pacelabE2E.walkRunActiveState())
          return `${s.todaySessionType}|${s.injuryStatus}|${(s.injurySeverity ?? 0) >= 2}`
        },
        { timeout: 25_000, intervals: [500, 1000, 2000, 3000] }
      )
      .toBe('Easy|active|true')

    // 작전 카드(브리핑)가 보인다 — 코치 카드와 캐러셀 카드 양쪽 가능성으로 first.
    await expect(page.getByText('📋 오늘의 작전').first()).toBeVisible()

    // "어떻게 뛰나"가 걷기-뛰기로 — 연속주(라벨 '본런')가 아니라 walk-run 본세트 라벨.
    await expect(page.getByText('본훈련(걷기-뛰기)').first()).toBeVisible()
    // 5단계 사다리(P1 … → P5 연속 30분)가 그대로 노출.
    await expect(page.getByText(/P1 걷기 4분·뛰기 1분/).first()).toBeVisible()
    await expect(page.getByText(/연속 30분/).first()).toBeVisible()

    // 오늘의 핵심 = 통증 0 합격선.
    await expect(page.getByText(/걷기-뛰기로 통증 없이|"통증 0"이 오늘의 합격선/).first()).toBeVisible()

    // 통증 정지 스텝(부위·날카로운/심해지는/절뚝 통증 게이트).
    await expect(page.getByText('통증 정지').first()).toBeVisible()

    // ⚠ 조심할 점: redFlag 위험 신호(부종·열감·저림·방사통) 상시 노출(§4 escape hatch).
    await expect(page.getByText(/부종·열감·저림·방사통/).first()).toBeVisible()

    // severity 3 → 본세트 앞 '먼저'(복귀 보류·전문가 평가) 안내.
    await expect(page.getByText('먼저').first()).toBeVisible()
    await expect(page.getByText(/전문가 평가를 먼저 권해요/).first()).toBeVisible()
  })
})

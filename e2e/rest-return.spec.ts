import { expect, test, type Locator } from '@playwright/test'

/**
 * #473 휴식/복귀 인증 E2E (테스트 계정 lena0611+qa, 저장 세션 사용).
 * 실 dev 서버(Supabase 연결)에 로그인된 상태로 휴식 선언→배너·억제·회복주 1회→지금 복귀 라운드트립을 검증한다.
 * 선언 후 복귀로 되돌려 계정 상태를 원복(멱등)한다.
 *
 * 복귀 램프(복귀 첫 세션 Easy·캡)의 '화면'은 레이스 목표 + 7일+ 경과 시드가 필요해 여기선 다루지 않는다
 * (단위/컴포넌트 테스트 + 적대 리뷰로 검증; E2E 시드 훅은 후속).
 *
 * 대시보드 버튼 일부(휴식 진입·지금 복귀)는 하단 네비 오버레이로 좌표 클릭이 핸들러를 못 깨우는 경우가 있어
 * DOM click(el.click())으로 호출한다 — 모달 내부 버튼(이유/기간/확인)은 일반 클릭이 안정적.
 */
const domClick = (loc: Locator) => loc.evaluate((el) => (el as HTMLElement).click())

test.describe('#473 휴식/복귀', () => {
  test('휴식 선언 → 💤 배너·닦달 억제·회복주 1회 → 지금 복귀 원복', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // 신규 계정 온보딩 인터뷰가 뜨면 건너뛴다(이미 건너뛴 계정이면 없음).
    const onboardingSkip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
    if (await onboardingSkip.isVisible().catch(() => false)) {
      await onboardingSkip.click()
      await expect(page.getByRole('dialog', { name: '시작 인터뷰' })).toBeHidden()
    }

    // 이미 쉬는 중이면 먼저 복귀시켜 깨끗한 상태에서 시작.
    const returnNowPre = page.getByRole('button', { name: /지금 복귀/ })
    if (await returnNowPre.isVisible().catch(() => false)) {
      await domClick(returnNowPre)
      await expect(page.getByText('💤 쉬는 중')).toHaveCount(0)
    }

    // 휴식 선언 진입 → 시트(좌표 클릭이 안 먹는 케이스 대비 DOM click).
    await domClick(page.getByRole('button', { name: /한동안 쉬어갈까요/ }))
    const sheet = page.getByRole('dialog', { name: '휴식 선언' })
    await expect(sheet).toBeVisible()

    // 이유(날씨=통제 휴식) + 기간(1주) → 선언.
    await sheet.getByRole('button', { name: '날씨', exact: true }).click()
    await sheet.getByRole('button', { name: '1주', exact: true }).click()
    await sheet.getByRole('button', { name: '푹 쉴게요' }).click()

    // 차분 배너 + 복귀 D-N (코치 카드·캐러셀 카드 양쪽에 나오므로 first).
    await expect(page.getByText('💤 쉬는 중')).toBeVisible()
    await expect(page.getByText(/복귀까지 D-\d/).first()).toBeVisible()

    // 통제 휴식이라 "가벼운 회복주" 1회 제시(코치 모먼트).
    await expect(page.getByRole('button', { name: /가벼운 회복주/ })).toBeVisible()
    await expect(page.getByText(/푹 쉬어요/).first()).toBeVisible()

    // 닦달성 사전 카드('오늘의 작전')는 억제되어 사라진다.
    await expect(page.getByText('📋 오늘의 작전')).toHaveCount(0)

    // 지금 복귀 → 휴식 종료(배너 사라짐). 선언 op(runScheduleOp/intentBusy)가 아직 진행 중이면 클릭이
    // 무시될 수 있으므로 클릭+검증을 재시도로 감싼다(레이스 해소).
    await expect(async () => {
      await domClick(page.getByRole('button', { name: /지금 복귀/ }))
      await expect(page.getByText('💤 쉬는 중')).toHaveCount(0, { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /한동안 쉬어갈까요/ })).toBeVisible()
  })

  test('복귀 램프: 과거 휴식(레이스 목표) 복귀 시 첫 세션 Easy·캡 (DEV 시드)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const onboardingSkip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
    if (await onboardingSkip.isVisible().catch(() => false)) await onboardingSkip.click()

    // 레이스 목표 + 2주 전 시작·이틀 전 끝난 휴식을 시드(실제 경과를 흉내).
    const seeded = await page.evaluate(() => (window as unknown as { __pacelabE2E: { seedReturnRamp: () => Promise<{ ok: boolean }> } }).__pacelabE2E.seedReturnRamp())
    expect(seeded?.ok).toBe(true)

    // 새로고침 → doEnsureSchedule 자연만료 분기가 복귀 램프를 적용한다.
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 복귀 첫(가장 이른 미래) 세션이 Easy 계열 + 거리 캡(직전30일 런 0 → floor 3km)으로 점진 복원되는지.
    await expect
      .poll(
        async () => {
          const s = await page.evaluate(() => (window as unknown as { __pacelabE2E: { firstUpcomingSession: () => { sessionType: string; distanceKm: number | null } | null } }).__pacelabE2E.firstUpcomingSession())
          return s ? `${s.sessionType}|${s.distanceKm}` : 'null'
        },
        { timeout: 25_000, intervals: [500, 1000, 2000, 3000] }
      )
      .toMatch(/^(Easy|Recovery)\|/)

    const first = await page.evaluate(() => (window as unknown as { __pacelabE2E: { firstUpcomingSession: () => { sessionType: string; distanceKm: number | null } | null } }).__pacelabE2E.firstUpcomingSession())
    expect(['Easy', 'Recovery']).toContain(first?.sessionType)
    expect(first?.distanceKm ?? 99).toBeLessThanOrEqual(3.1) // ≤ 직전30일 최장(0)+10% floor 3km

    // 복귀 "회복 후 정리" 모먼트(놓침 프레이밍 아님).
    await expect(page.getByText(/돌아온 걸 환영|가볍게 다시 시작/).first()).toBeVisible()
  })
})

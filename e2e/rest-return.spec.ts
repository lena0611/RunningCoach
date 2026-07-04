import { expect, test, type Locator } from '@playwright/test'
import { suppressAccountStatePrompts } from './suppressAccountPrompts'

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
  test.beforeEach(async ({ page }) => {
    await suppressAccountStatePrompts(page)
  })

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

    try {
    // 휴식 선언 진입 → 시트(좌표 클릭이 안 먹는 케이스 대비 DOM click).
    await domClick(page.getByRole('button', { name: /한동안 쉬어갈까요/ }))
    const sheet = page.getByRole('dialog', { name: '휴식 선언' })
    await expect(sheet).toBeVisible()

    // 이유(날씨=통제 휴식) + 기간(1주) → 선언.
    await sheet.getByRole('button', { name: '날씨', exact: true }).click()
    await sheet.getByRole('button', { name: '1주', exact: true }).click()
    await sheet.getByRole('button', { name: '푹 쉴게요' }).click()

    // 차분 배너 + 복귀 D-N (리디자인 ①b: 요약 홈 휴식 히어로. 코치 탭도 열면 양쪽에 나오므로 first).
    await expect(page.getByText('💤 쉬는 중').first()).toBeVisible()
    await expect(page.getByText(/복귀까지 D-\d/).first()).toBeVisible()

    // 코치 모먼트·브리핑 카드는 리디자인 ①b 이후 코치 탭 소관 — 코치 탭에서 확인.
    await page.getByRole('button', { name: '코치', exact: true }).click()
    await expect(page).toHaveURL(/#\/coach/)

    // 통제 휴식이라 "가벼운 회복주" 1회 제시(코치 모먼트).
    await expect(page.getByRole('button', { name: /가벼운 회복주/ })).toBeVisible()
    await expect(page.getByText(/푹 쉬어요/).first()).toBeVisible()

    // 닦달성 사전 카드('오늘의 작전')는 억제되어 사라진다.
    await expect(page.getByText('📋 오늘의 작전')).toHaveCount(0)

    // 요약 홈으로 복귀 — '지금 복귀' 컨트롤은 요약 히어로 소유.
    await page.getByRole('button', { name: '요약', exact: true }).click()
    await expect(page).toHaveURL(/#\/?$/)

    // 지금 복귀 → 휴식 종료(배너 사라짐). 선언 op(runScheduleOp/intentBusy)가 아직 진행 중이면 클릭이
    // 무시될 수 있으므로 클릭+검증을 재시도로 감싼다(레이스 해소).
    await expect(async () => {
      await domClick(page.getByRole('button', { name: /지금 복귀/ }))
      await expect(page.getByText('💤 쉬는 중')).toHaveCount(0, { timeout: 3000 })
    }).toPass({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /한동안 쉬어갈까요/ })).toBeVisible()

    // ⚠ UI 로컬 상태가 아니라 **스토어 영속값**으로 복귀 완료를 확인한다 — 다음 테스트의 새 컨텍스트가
    // DB 를 읽는 시점과의 레이스로, 테스트가 선언한 휴식이 실계정에 잔존한 사고(2026-07-04)의 재발 방지.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const rest = (window as unknown as { __pacelabE2E: { activeRestState: () => { untilDate: string } | null } }).__pacelabE2E.activeRestState()
            if (!rest) return true
            const t = new Date()
            const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
            return rest.untilDate < iso
          }),
        { timeout: 15000 }
      )
      .toBe(true)
    } finally {
      // 크래시/중단돼도 테스트가 선언한 휴식을 반드시 걷어낸다(멱등 — 정상 종료 시엔 no-op에 가깝다).
      await page
        .evaluate(() => (window as unknown as { __pacelabE2E: { clearActiveRestForE2E: () => Promise<{ ok: boolean }> } }).__pacelabE2E.clearActiveRestForE2E())
        .catch(() => {})
    }
  })

  test('복귀 램프: 과거 휴식(레이스 목표) 복귀 시 첫 세션 Easy·캡 (DEV 시드)', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const onboardingSkip = page.getByRole('dialog', { name: '시작 인터뷰' }).getByRole('button', { name: '건너뛰기' })
    if (await onboardingSkip.isVisible().catch(() => false)) await onboardingSkip.click()

    // 레이스 목표 + 2주 전 시작·이틀 전 끝난 휴식을 시드(실제 경과를 흉내).
    const seeded = await page.evaluate(() => (window as unknown as { __pacelabE2E: { seedReturnRamp: () => Promise<{ ok: boolean }> } }).__pacelabE2E.seedReturnRamp())
    expect(seeded?.ok).toBe(true)

    try {
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

      // 자연만료 복귀의 사용자 노출 사실: 💤 휴식 배너가 사라진다(복귀 완료 상태).
      // '돌아온 걸 환영' 토스트는 명시 '지금 복귀' 경로 전용이고, 복귀 "회복 후 정리" 코치 모먼트는
      // 미구현(coachMoments.ts doc 주석의 showReturn 계획만 존재) — 구현되면 여기 단언을 되살린다.
      await expect(page.getByText(/쉬는 중/)).toHaveCount(0)
    } finally {
      // 시드 잔재 원복(실계정 보호) — 2026-07-03 사고: 클린업 없이 끝나 실계정 활성 목표가 'E2E'로 남았다.
      const cleaned = await page.evaluate(() =>
        (window as unknown as { __pacelabE2E: { cleanupReturnRamp: () => Promise<{ ok: boolean }> } }).__pacelabE2E.cleanupReturnRamp()
      )
      expect(cleaned?.ok).toBe(true)
    }
  })
})

import type { Page } from '@playwright/test'

/**
 * 공유 실계정 상태로 뜨는 App 레벨 프롬프트를 E2E 에서 원천 차단한다 (클라이언트 UI 억제만 — 계정 데이터 비파괴).
 *
 * 1) 부상 상태 체크인 모달: dismiss 플래그(pacelab.injuryCheckIn.dismissed.*)를 항상 dismissed 로 읽게 한다.
 * 2) 알림 설정 안내 바텀시트: 꺼진 알림이 있으면 진입마다 떠서 클릭을 가로챈다(리디자인 후 10/10 타임아웃 원인).
 *    설정은 로컬 소유(runcontext.settings)이므로 읽기를 "전부 켜짐"으로 가로채 disabled 항목 자체를 없앤다.
 *
 * Storage.prototype 가로채기라 localStorage/sessionStorage 양쪽에 적용되고, 앱 스크립트보다 먼저 실행된다.
 * 주의: 알림 설정을 실제로 토글하는 테스트에는 쓰지 말 것(읽기가 고정된다).
 */
export async function suppressAccountStatePrompts(page: Page) {
  await suppressBriefingShorts(page)
  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem
    Storage.prototype.getItem = function (this: Storage, key: string) {
      if (typeof key === 'string' && key.startsWith('pacelab.injuryCheckIn.dismissed')) return '1'
      if (key === 'runcontext.settings') {
        return JSON.stringify({
          notificationSettings: { allEnabled: true, scheduledWorkout: true, workoutMorning: true, healthKitNewRun: true }
        })
      }
      return orig.call(this, key)
    }
  })
}

/**
 * 하루 한 번 뜨는 브리핑 쇼츠 팝업(#898)을 "오늘 이미 봤다"로 읽게 한다 — 전체 화면 팝업이 탭바·버튼 클릭을 가로챈다.
 * 시드로 오늘 세션을 깔면 라우트 스모크(Supabase OFF)에서도 판정이 'show'가 된다. 클라이언트 읽기만 가로챈다(계정 무손상).
 */
export async function suppressBriefingShorts(page: Page) {
  await page.addInitScript(() => {
    const orig = Storage.prototype.getItem
    const t = new Date()
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    Storage.prototype.getItem = function (this: Storage, key: string) {
      if (typeof key === 'string' && key.startsWith('pacelab:briefing-shorts:shown:')) return today
      return orig.call(this, key)
    }
  })
}

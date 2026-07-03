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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTrainingNotifications, notifyHealthKitNewRuns } from './notificationBridge'
import type { NotificationSettings } from '@/app/stores/settingsStore'

const settings = {
  allEnabled: true,
  workoutMorning: true,
  scheduledWorkout: true,
  healthKitNewRun: true
} as NotificationSettings

function dayAfter(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}

/*
  2026-09-07 실사고: 알림이 옛 루틴 메모(`training_memory.weeklyPattern`) 문자열을 파싱했는데
  그 메모가 비어 있어 **훈련 알림이 통째로 0건**이었다. 이제 실제 플랜을 본다.
*/
describe('buildTrainingNotifications', () => {
  it('예정 세션에서 아침·저녁 알림을 만든다', () => {
    const items = buildTrainingNotifications(settings, [{ date: dayAfter(2), title: 'Easy + Strides' }])
    expect(items).toHaveLength(2)
    expect(items[0].title).toContain('Easy + Strides')
    expect(items.every((n) => new Date(n.dateIso) > new Date())).toBe(true)
  })

  it('14일 지평 밖 세션은 예약하지 않는다 — 너무 먼 알림은 플랜이 바뀌면 거짓말이 된다', () => {
    expect(buildTrainingNotifications(settings, [{ date: dayAfter(30), title: 'LSD' }])).toHaveLength(0)
  })

  it('지난 세션은 예약하지 않는다', () => {
    expect(buildTrainingNotifications(settings, [{ date: dayAfter(-3), title: 'Easy' }])).toHaveLength(0)
  })

  it('알림을 끄면 아무것도 만들지 않는다', () => {
    expect(buildTrainingNotifications({ ...settings, allEnabled: false }, [{ date: dayAfter(1), title: 'Easy' }])).toHaveLength(0)
  })
})

/*
  "앱 안에서는 toast, 앱 밖에서는 로컬 알림"(healthkit-data-contract.md §알림).

  규칙은 `notifyHealthKitNewRuns` 의 visible 가드 한 줄로 서 있는데 **지키는 테스트가 없었다** —
  2026-05-29 작성해 둔 테스트가 커밋되지 못하고 stash 에만 4개월 남아 있었다(워크트리 정리 중 발견).
  가드가 지워지면 앱을 보고 있는 동안 toast 와 배너가 같은 말을 두 번 하게 된다.
*/
describe('notifyHealthKitNewRuns', () => {
  afterEach(() => {
    delete window.webkit
    setVisibilityState('visible')
  })

  it('앱이 보이는 동안엔 네이티브 배너를 띄우지 않는다 — 같은 내용을 toast 가 이미 말했다', () => {
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { runContextNotifications: { postMessage } } }
    setVisibilityState('visible')

    expect(notifyHealthKitNewRuns(settings, 1)).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('앱이 가려져 있으면 배너로 알린다 — 사용자를 앱으로 불러야 한다', () => {
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { runContextNotifications: { postMessage } } }
    setVisibilityState('hidden')

    expect(notifyHealthKitNewRuns(settings, 2)).toBe(true)
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'showNotification',
        title: '새 러닝 기록을 가져왔습니다',
        body: 'HealthKit에서 새 러닝 2개를 저장했습니다.'
      })
    )
  })

  it('알림 설정이 꺼져 있으면 가려져 있어도 보내지 않는다', () => {
    const postMessage = vi.fn()
    window.webkit = { messageHandlers: { runContextNotifications: { postMessage } } }
    setVisibilityState('hidden')

    expect(notifyHealthKitNewRuns({ ...settings, healthKitNewRun: false }, 2)).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })
})

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
}

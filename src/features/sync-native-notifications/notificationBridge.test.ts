import { describe, expect, it } from 'vitest'
import { buildTrainingNotifications } from './notificationBridge'
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

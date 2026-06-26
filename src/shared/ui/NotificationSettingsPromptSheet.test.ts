import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { DisabledNotificationItem } from '@/app/stores/settingsStore'
import NotificationSettingsPromptSheet from './NotificationSettingsPromptSheet.vue'

const disabledItems: DisabledNotificationItem[] = [
  {
    key: 'allEnabled',
    title: '전체 알림',
    detail: '훈련 스케줄과 HealthKit 신규 기록 알림을 한 번에 켜고 끕니다.'
  },
  {
    key: 'scheduledWorkout',
    title: '스케줄 훈련 준비',
    detail: '예정 세션 당일 저녁에 한 번 더 알려줍니다.'
  }
]

describe('NotificationSettingsPromptSheet', () => {
  it('renders disabled notification items', () => {
    const wrapper = mount(NotificationSettingsPromptSheet, {
      props: { open: true, disabledItems }
    })

    expect(wrapper.text()).toContain('꺼진 알림이 있어요')
    expect(wrapper.text()).toContain('전체 알림')
    expect(wrapper.text()).toContain('스케줄 훈련 준비')
  })

  it('emits openSettings from the primary action', async () => {
    const wrapper = mount(NotificationSettingsPromptSheet, {
      props: { open: true, disabledItems }
    })

    await wrapper.get('.primary-button').trigger('click')

    expect(wrapper.emitted('openSettings')).toHaveLength(1)
  })
})

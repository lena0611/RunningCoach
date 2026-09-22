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

/**
 * 이 시트는 `Teleport to="body"` 로 나간다(#828) — `#app` 안에 남으면 배경 비활성(inert)이
 * 시트 자신까지 꺼서 앱이 잠긴다(2026-09-22 실기기 먹통 사고). 그래서 `wrapper.text()` 는 비고,
 * 내용은 body 에 붙는다. 단위 테스트에서는 teleport 를 stub 해 제자리에 렌더시킨다 —
 * 검증하려는 건 '무엇을 그리나'이지 '어디에 붙나'가 아니다(그건 커버리지 가드가 본다).
 */
const mountOptions = { global: { stubs: { teleport: true } } }

describe('NotificationSettingsPromptSheet', () => {
  it('renders disabled notification items', () => {
    const wrapper = mount(NotificationSettingsPromptSheet, {
      props: { open: true, disabledItems },
      ...mountOptions
    })

    expect(wrapper.text()).toContain('꺼진 알림이 있어요')
    expect(wrapper.text()).toContain('전체 알림')
    expect(wrapper.text()).toContain('스케줄 훈련 준비')
  })

  it('emits openSettings from the primary action', async () => {
    const wrapper = mount(NotificationSettingsPromptSheet, {
      props: { open: true, disabledItems },
      ...mountOptions
    })

    await wrapper.get('.primary-button').trigger('click')

    expect(wrapper.emitted('openSettings')).toHaveLength(1)
  })
})

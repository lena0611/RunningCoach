import { describe, expect, it } from 'vitest'
import { getDisabledNotificationItems, resolveStoredCoachModel, type NotificationSettings } from './settingsStore'
import { DEFAULT_COACH_MODEL } from '@/shared/lib/coaching/coachModels'

const enabledSettings: NotificationSettings = {
  allEnabled: true,
  scheduledWorkout: true,
  workoutMorning: true,
  healthKitNewRun: true
}

describe('getDisabledNotificationItems', () => {
  it('returns no items when every notification setting is enabled', () => {
    expect(getDisabledNotificationItems(enabledSettings)).toEqual([])
  })

  it('treats every notification row as off when the master toggle is disabled', () => {
    expect(getDisabledNotificationItems({ ...enabledSettings, allEnabled: false }).map((item) => item.key)).toEqual([
      'allEnabled',
      'workoutMorning',
      'scheduledWorkout',
      'healthKitNewRun'
    ])
  })

  it('returns only disabled detail rows when the master toggle is enabled', () => {
    expect(getDisabledNotificationItems({ ...enabledSettings, scheduledWorkout: false }).map((item) => item.key)).toEqual([
      'scheduledWorkout'
    ])
  })
})

// 2026-08-04: 무료(NVIDIA) 엔드포인트가 긴 답변에서 스트림째 실패해 기본을 GPT 로 옮겼다.
// 기본값만 바꾸면 저장값이 이겨 기존 설치가 계속 실패하므로 일회성 이관이 필요하다.
describe('resolveStoredCoachModel (무료 모델 일회성 이관)', () => {
  it('저장값이 없거나 알 수 없으면 기본 모델을 쓴다', () => {
    expect(resolveStoredCoachModel(undefined, false)).toBe(DEFAULT_COACH_MODEL)
    expect(resolveStoredCoachModel('gpt-없는모델', false)).toBe(DEFAULT_COACH_MODEL)
  })

  it('이관 전에는 무료 모델 저장값을 기본(GPT)으로 올린다', () => {
    expect(resolveStoredCoachModel('deepseek-ai/deepseek-v4-pro', false)).toBe(DEFAULT_COACH_MODEL)
    expect(resolveStoredCoachModel('z-ai/glm-5.2', false)).toBe(DEFAULT_COACH_MODEL)
  })

  it('이관 후 사용자가 일부러 고른 무료 모델은 유지한다', () => {
    expect(resolveStoredCoachModel('deepseek-ai/deepseek-v4-pro', true)).toBe('deepseek-ai/deepseek-v4-pro')
    expect(resolveStoredCoachModel('z-ai/glm-5.2', true)).toBe('z-ai/glm-5.2')
  })

  it('GPT 저장값은 이관 여부와 무관하게 그대로 둔다', () => {
    expect(resolveStoredCoachModel('openai', false)).toBe('openai')
    expect(resolveStoredCoachModel('openai', true)).toBe('openai')
  })
})

import { defineStore } from 'pinia'

export type NotificationSettingKey = 'scheduledWorkout' | 'workoutMorning' | 'healthKitNewRun'
export type SettingsPanelFocus = 'notifications'

export type NotificationSettings = {
  allEnabled: boolean
  scheduledWorkout: boolean
  workoutMorning: boolean
  healthKitNewRun: boolean
}

export type NotificationSettingRow = {
  key: NotificationSettingKey
  title: string
  detail: string
}

export type DisabledNotificationItem = {
  key: 'allEnabled' | NotificationSettingKey
  title: string
  detail: string
}

const storageKey = 'runcontext.settings'
const defaultNotificationSettings: NotificationSettings = {
  allEnabled: false,
  scheduledWorkout: true,
  workoutMorning: true,
  healthKitNewRun: true
}
export const notificationAllSetting = {
  key: 'allEnabled',
  title: '전체 알림',
  detail: '훈련 스케줄과 HealthKit 신규 기록 알림을 한 번에 켜고 끕니다.'
} as const
export const notificationSettingRows = [
  {
    key: 'workoutMorning',
    title: '훈련 당일 아침',
    detail: '예정 훈련이 있는 날 오전 7시에 알려줍니다.'
  },
  {
    key: 'scheduledWorkout',
    title: '스케줄 훈련 준비',
    detail: '예정 세션 당일 저녁에 한 번 더 알려줍니다.'
  },
  {
    key: 'healthKitNewRun',
    title: 'HealthKit 새 러닝',
    detail: '앱이 새 러닝을 저장하면 알림을 보냅니다.'
  }
] as const satisfies readonly NotificationSettingRow[]

export const useSettingsStore = defineStore('settingsStore', {
  state: () => ({
    notificationSettings: loadSettings().notificationSettings,
    settingsPanelRequestId: 0,
    settingsPanelFocus: null as SettingsPanelFocus | null
  }),
  actions: {
    setAllNotifications(enabled: boolean) {
      this.notificationSettings = {
        ...this.notificationSettings,
        allEnabled: enabled
      }
      this.persist()
    },
    setNotificationSetting(key: NotificationSettingKey, enabled: boolean) {
      this.notificationSettings = {
        ...this.notificationSettings,
        [key]: enabled
      }
      this.persist()
    },
    requestSettingsPanel(focus: SettingsPanelFocus | null = null) {
      this.settingsPanelFocus = focus
      this.settingsPanelRequestId += 1
    },
    persist() {
      localStorage.setItem(storageKey, JSON.stringify({
        notificationSettings: this.notificationSettings
      }))
    }
  }
})

export function getDisabledNotificationItems(settings: NotificationSettings): DisabledNotificationItem[] {
  if (!settings.allEnabled) {
    return [notificationAllSetting, ...notificationSettingRows]
  }
  return notificationSettingRows.filter((row) => !settings[row.key])
}

function loadSettings(): { notificationSettings: NotificationSettings } {
  if (typeof localStorage === 'undefined') {
    return { notificationSettings: defaultNotificationSettings }
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}') as { notificationSettings?: Partial<NotificationSettings> }
    return {
      notificationSettings: normalizeNotificationSettings(parsed.notificationSettings)
    }
  } catch {
    return { notificationSettings: defaultNotificationSettings }
  }
}

function normalizeNotificationSettings(value: Partial<NotificationSettings> | undefined): NotificationSettings {
  return {
    ...defaultNotificationSettings,
    ...(value ?? {}),
    allEnabled: Boolean(value?.allEnabled)
  }
}
